// Etapas 3 e 4: download do edital, análise com IA, solicitação ao contador, upload e auditoria.
import { randomUUID } from 'crypto';
import { supabaseAdmin, BUCKET } from './supabase/admin';
import { baixar, listarArquivos, urlArquivo, consultarCompra } from './pncp';
import { expandir, mimeDe, paraBloco, prioridadeEdital, type Arquivo, type Bloco } from './docs';
import { analisarEdital, auditarDocumentos, type ResultadoAuditoria } from './ai';
import { normalizar } from './classify';

const LIMITE_BYTES_IA = 18 * 1024 * 1024; // margem abaixo do limite de requisição da IA
const LIMITE_DOCS_IA = 20;

const seguro = (s: string) =>
  normalizar(s.replace(/\.[^.]+$/, ''))
    .replace(/\s+/g, '-')
    .slice(0, 80) + (s.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? '');

async function log(userId: string | null, entidade: string, id: string, acao: string, detalhe?: unknown) {
  await supabaseAdmin().from('activity_logs').insert({ user_id: userId, entidade, entidade_id: id, acao, detalhe: detalhe ?? null });
}

async function carregarCaso(caseId: string) {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('cases').select('*, tender:tenders(*), company:companies(*)').eq('id', caseId).single();
  if (error || !data) throw new Error('Processo não encontrado');
  return data as any;
}

async function lerDoStorage(path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Não consegui abrir ${path}`);
  return Buffer.from(await data.arrayBuffer());
}

// ---------------------------------------------------------------- Download

export async function baixarDocumentacao(caseId: string, userId: string) {
  const sb = supabaseAdmin();
  const caso = await carregarCaso(caseId);
  const t = caso.tender;
  if (!t.orgao_cnpj || !t.ano_compra || !t.sequencial_compra) {
    return { baixados: 0, falhas: 0, aviso: 'Licitação sem identificação do PNCP. Envie os arquivos do edital manualmente.' };
  }

  // Reconfere a situação na fonte oficial antes de qualquer coisa
  try {
    const atual = await consultarCompra(t.orgao_cnpj, t.ano_compra, t.sequencial_compra);
    if (atual) {
      await sb
        .from('tenders')
        .update({
          situacao_nome: atual.situacaoCompraNome,
          data_encerramento_proposta: atual.dataEncerramentoProposta,
          data_abertura_proposta: atual.dataAberturaProposta,
          link_sistema_origem: atual.linkSistemaOrigem,
          ultima_conferencia_fonte: new Date().toISOString(),
        })
        .eq('id', t.id);
    }
  } catch {
    /* segue com o download; a tela mostra a data da última conferência */
  }

  const lista = await listarArquivos(t.orgao_cnpj, t.ano_compra, t.sequencial_compra);
  const { data: existentes } = await sb.from('tender_files').select('*').eq('tender_id', t.id);
  let baixados = 0;
  let falhas = 0;

  for (const a of lista) {
    const ja = existentes?.find((e) => e.sequencial === a.sequencialDocumento);
    if (ja?.status === 'baixado') continue;
    const url = urlArquivo(t.orgao_cnpj, t.ano_compra, t.sequencial_compra, a);
    const titulo = a.titulo || a.tipoDocumentoNome || `documento-${a.sequencialDocumento}`;
    try {
      const { buf, nome } = await baixar(url);
      const nomeFinal = nome || (/\.[a-z0-9]{2,4}$/i.test(titulo) ? titulo : `${titulo}.pdf`);
      const path = `editais/${t.id}/${String(a.sequencialDocumento ?? 0).padStart(3, '0')}-${seguro(nomeFinal)}`;
      const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: mimeDe(nomeFinal), upsert: true });
      if (up.error) throw new Error(up.error.message);
      const row = {
        tender_id: t.id,
        sequencial: a.sequencialDocumento,
        titulo: nomeFinal,
        tipo: a.tipoDocumentoNome,
        url_origem: url,
        storage_path: path,
        tamanho_bytes: buf.length,
        status: 'baixado',
        erro: null,
      };
      if (ja) await sb.from('tender_files').update(row).eq('id', ja.id);
      else await sb.from('tender_files').insert(row);
      baixados++;
    } catch (e) {
      falhas++;
      const row = { tender_id: t.id, sequencial: a.sequencialDocumento, titulo, tipo: a.tipoDocumentoNome, url_origem: url, status: 'falhou', erro: String(e) };
      if (ja) await sb.from('tender_files').update(row).eq('id', ja.id);
      else await sb.from('tender_files').insert(row);
    }
  }
  await log(userId, 'cases', caseId, 'baixar_documentacao', { encontrados: lista.length, baixados, falhas });
  return {
    baixados,
    falhas,
    aviso: lista.length === 0 ? 'O PNCP não lista arquivos para esta licitação. Baixe no portal do órgão e envie manualmente.' : undefined,
  };
}

/** Arquivos do edital enviados à mão (quando não estão no PNCP). */
export async function anexarArquivoEdital(tenderId: string, arq: Arquivo, userId: string) {
  const sb = supabaseAdmin();
  const path = `editais/${tenderId}/manual-${Date.now()}-${seguro(arq.nome)}`;
  const up = await sb.storage.from(BUCKET).upload(path, arq.buf, { contentType: mimeDe(arq.nome) });
  if (up.error) throw new Error(up.error.message);
  await sb.from('tender_files').insert({ tender_id: tenderId, titulo: arq.nome, storage_path: path, tamanho_bytes: arq.buf.length, status: 'manual' });
  await log(userId, 'tenders', tenderId, 'anexar_edital_manual', { arquivo: arq.nome });
}

// ---------------------------------------------------------------- Montagem dos blocos para a IA

async function montarBlocos(arquivos: Arquivo[]) {
  const blocos: Bloco[] = [];
  const lidos: string[] = [];
  const naoLidos: { nome: string; motivo: string }[] = [];
  let total = 0;
  for (const a of arquivos) {
    if (blocos.length >= LIMITE_DOCS_IA) {
      naoLidos.push({ nome: a.nome, motivo: 'Limite de arquivos por análise' });
      continue;
    }
    const r = await paraBloco(a);
    if ('erro' in r) {
      naoLidos.push({ nome: a.nome, motivo: r.erro });
      continue;
    }
    if (total + r.bytes > LIMITE_BYTES_IA) {
      naoLidos.push({ nome: a.nome, motivo: 'Excede o tamanho máximo de uma análise' });
      continue;
    }
    total += r.bytes;
    if (r.bloco.type === 'image') blocos.push({ type: 'text', text: `Imagem a seguir: ${a.nome}` });
    blocos.push(r.bloco);
    lidos.push(a.nome);
  }
  return { blocos, lidos, naoLidos };
}

// ---------------------------------------------------------------- Análise do edital (saídas A e B)

export async function analisarEditalDoCaso(caseId: string, userId: string) {
  const sb = supabaseAdmin();
  const caso = await carregarCaso(caseId);
  const t = caso.tender;
  const { data: arquivos } = await sb.from('tender_files').select('*').eq('tender_id', t.id).in('status', ['baixado', 'manual']);
  if (!arquivos?.length) throw new Error('Nenhum arquivo do edital disponível. Baixe a documentação ou envie os arquivos.');

  const planos: Arquivo[] = [];
  for (const f of arquivos) planos.push(...(await expandir({ nome: f.titulo || f.storage_path, buf: await lerDoStorage(f.storage_path) })));
  planos.sort((a, b) => prioridadeEdital(a.nome) - prioridadeEdital(b.nome));

  const { blocos, lidos, naoLidos } = await montarBlocos(planos);
  if (!blocos.length) throw new Error('Nenhum arquivo legível para análise.');

  const contexto = `Licitação: ${t.modalidade_nome ?? ''} ${t.numero_compra ?? ''} - ${t.orgao_nome ?? ''} (${t.municipio ?? ''}/${t.uf ?? ''})
Objeto cadastrado no PNCP: ${t.objeto ?? ''}
Empresa que pretende participar: ${caso.company.razao_social} (CNPJ ${caso.company.cnpj})
Arquivos fornecidos: ${lidos.join('; ')}`;

  const r = await analisarEdital(blocos, contexto);

  await sb.from('requirements').delete().eq('case_id', caseId);
  if (r.exigencias.length) {
    await sb.from('requirements').insert(
      r.exigencias.map((e, i) => ({
        case_id: caseId,
        categoria: e.categoria,
        descricao: e.descricao,
        responsavel: e.responsavel,
        referencia: e.referencia,
        arquivo_origem: e.arquivo_origem,
        revisao_humana: e.revisao_humana,
        ordem: i,
      })),
    );
  }
  const resumo = { ...r.resumo, arquivos_lidos: lidos, arquivos_nao_lidos: naoLidos, anexos_citados_ausentes: r.arquivos_nao_lidos_relevantes };
  const solicitacao = montarSolicitacao(caso, r.exigencias, caso.prazo_interno);
  await sb.from('cases').update({ resumo, solicitacao_texto: solicitacao, analise_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', caseId);
  await log(userId, 'cases', caseId, 'analisar_edital', { exigencias: r.exigencias.length, lidos: lidos.length, nao_lidos: naoLidos.length });
  return { exigencias: r.exigencias.length, naoLidos };
}

const ROTULO_CATEGORIA: Record<string, string> = {
  juridica: 'Habilitação jurídica',
  fiscal: 'Regularidade fiscal',
  trabalhista: 'Regularidade trabalhista',
  economico_financeira: 'Qualificação econômico-financeira',
  tecnica: 'Qualificação técnica',
  declaracao: 'Declarações',
  proposta: 'Proposta',
  outra: 'Outros',
};

export function montarSolicitacao(
  caso: any,
  exigencias: { categoria: string; descricao: string; responsavel: string; referencia: string | null }[],
  prazoInterno?: string | null,
) {
  const t = caso.tender;
  const bloco = (resp: string) => {
    const itens = exigencias.filter((e) => e.responsavel === resp);
    if (!itens.length) return '(nada nesta etapa)';
    const grupos = new Map<string, typeof itens>();
    itens.forEach((e) => grupos.set(e.categoria, [...(grupos.get(e.categoria) ?? []), e]));
    return [...grupos.entries()]
      .map(([cat, l]) => `*${ROTULO_CATEGORIA[cat] ?? cat}*\n` + l.map((e) => `- ${e.descricao}${e.referencia ? ` (${e.referencia})` : ''}`).join('\n'))
      .join('\n\n');
  };
  const prazo = prazoInterno ? new Date(prazoInterno + 'T12:00:00').toLocaleDateString('pt-BR') : 'a combinar';
  return `*${t.modalidade_nome ?? 'Licitação'} ${t.numero_compra ?? ''} - ${t.orgao_nome ?? ''}*
Empresa: ${caso.company.razao_social} - CNPJ ${caso.company.cnpj}
Objeto: ${t.objeto ?? ''}

DOCUMENTOS PARA O CONTADOR
${bloco('contador')}

DOCUMENTOS PARA A EMPRESA
${bloco('empresa')}

Prazo interno para envio: ${prazo}
Todos os documentos devem estar válidos na data da sessão. Enviar em PDF legível.`;
}

// ---------------------------------------------------------------- Upload dos documentos da empresa

export async function receberDocumentos(caseId: string, arquivos: Arquivo[], userId: string) {
  const sb = supabaseAdmin();
  const caso = await carregarCaso(caseId);
  const planos: Arquivo[] = [];
  for (const a of arquivos) planos.push(...(await expandir(a)));

  const { data: ativos } = await sb.from('company_documents').select('*').eq('case_id', caseId).eq('ativo', true);
  let novos = 0;
  let substituidos = 0;
  for (const a of planos) {
    const nomeBase = a.nome.split('/').pop()!;
    const anterior = ativos?.find((d) => normalizar(d.nome_arquivo) === normalizar(nomeBase));
    const versao = anterior ? anterior.versao + 1 : 1;
    const path = `empresas/${caso.company_id}/${caseId}/03-documentos/v${versao}-${Date.now()}-${seguro(nomeBase)}`;
    const up = await sb.storage.from(BUCKET).upload(path, a.buf, { contentType: mimeDe(nomeBase) });
    if (up.error) throw new Error(`${nomeBase}: ${up.error.message}`);
    const { data: novo } = await sb
      .from('company_documents')
      .insert({
        case_id: caseId,
        company_id: caso.company_id,
        nome_arquivo: nomeBase,
        storage_path: path,
        mime: mimeDe(nomeBase),
        tamanho_bytes: a.buf.length,
        versao,
        enviado_por: userId,
      })
      .select('id')
      .single();
    if (anterior && novo) {
      await sb.from('company_documents').update({ ativo: false, substituido_por: novo.id }).eq('id', anterior.id);
      substituidos++;
    } else novos++;
  }
  if (['separado', 'em_analise', 'documentacao_solicitada'].includes(caso.status)) {
    await sb.from('cases').update({ status: 'conferencia_documental', updated_at: new Date().toISOString() }).eq('id', caseId);
  }
  await log(userId, 'cases', caseId, 'receber_documentos', { novos, substituidos });
  return { novos, substituidos };
}

// ---------------------------------------------------------------- Auditoria

export async function auditarCaso(caseId: string, userId: string) {
  const sb = supabaseAdmin();
  const caso = await carregarCaso(caseId);
  const { data: reqs } = await sb.from('requirements').select('*').eq('case_id', caseId).order('ordem');
  if (!reqs?.length) throw new Error('Rode a análise do edital antes da auditoria.');
  const { data: docs } = await sb.from('company_documents').select('*').eq('case_id', caseId).eq('ativo', true);
  if (!docs?.length) throw new Error('Nenhum documento recebido para conferir.');

  const arquivos: Arquivo[] = [];
  for (const d of docs) arquivos.push({ nome: d.nome_arquivo, buf: await lerDoStorage(d.storage_path) });
  const { blocos, lidos, naoLidos } = await montarBlocos(arquivos);

  const dataSessao = caso.tender.data_abertura_proposta || caso.tender.data_encerramento_proposta;
  const contexto = `Empresa: ${caso.company.razao_social} - CNPJ ${caso.company.cnpj}
Data da sessão/limite da proposta: ${dataSessao ? new Date(dataSessao).toISOString().slice(0, 10) : 'não informada'}
Data de hoje: ${new Date().toISOString().slice(0, 10)}
Arquivos recebidos e legíveis: ${lidos.join('; ') || 'nenhum'}

EXIGÊNCIAS DO EDITAL:
${reqs.map((r, i) => `${i + 1}. [${r.categoria}] ${r.descricao} (${r.referencia ?? 'sem referência'})`).join('\n')}`;

  let r: ResultadoAuditoria = { verificacoes: [], conclusao: 'Nenhum arquivo legível.' };
  if (blocos.length) r = await auditarDocumentos(blocos, contexto);

  const runId = randomUUID();
  const docPorNome = new Map(docs.map((d) => [normalizar(d.nome_arquivo), d.id]));
  const limite = dataSessao ? new Date(dataSessao).toISOString().slice(0, 10) : null;
  const cobertas = new Set<number>();

  const linhas = r.verificacoes.map((v) => {
    const req = v.exigencia_numero ? reqs[v.exigencia_numero - 1] : undefined;
    if (v.exigencia_numero) cobertas.add(v.exigencia_numero);
    let status = v.status;
    let detalhe = v.detalhe;
    // regra dura: validade antes da sessão = vencido, independente do que a IA disse
    if (v.validade && limite && v.validade < limite && status === 'ok') {
      status = 'vencido';
      detalhe = `Validade ${v.validade} termina antes da sessão (${limite}). ${detalhe}`;
    }
    // itens marcados para revisão humana nunca saem como "ok" automático
    if (req?.revisao_humana && status === 'ok') {
      status = 'revisao_humana';
      detalhe = `Conferência preliminar sem problemas, mas exige validação humana. ${detalhe}`;
    }
    return {
      case_id: caseId,
      run_id: runId,
      requirement_id: req?.id ?? null,
      document_id: v.arquivo ? docPorNome.get(normalizar(v.arquivo)) ?? null : null,
      status,
      titulo: v.titulo,
      detalhe,
      evidencia: v.evidencia,
      validade: v.validade && /^\d{4}-\d{2}-\d{2}$/.test(v.validade) ? v.validade : null,
    };
  });

  // exigências que a IA não comentou viram "faltando" (nunca assumimos que está tudo certo)
  reqs.forEach((req, i) => {
    if (!cobertas.has(i + 1)) {
      linhas.push({
        case_id: caseId, run_id: runId, requirement_id: req.id, document_id: null, status: 'faltando',
        titulo: req.descricao.slice(0, 80), detalhe: 'Nenhum documento identificado para esta exigência.', evidencia: '', validade: null,
      });
    }
  });
  // arquivos que não puderam ser lidos
  naoLidos.forEach((n) =>
    linhas.push({
      case_id: caseId, run_id: runId, requirement_id: null, document_id: docPorNome.get(normalizar(n.nome)) ?? null,
      status: 'ilegivel', titulo: n.nome, detalhe: n.motivo, evidencia: '', validade: null,
    }),
  );

  if (linhas.length) await sb.from('document_checks').insert(linhas);
  const novoStatus = statusPelaAuditoria(linhas.map((l) => l.status));
  await sb.from('cases').update({ status: novoStatus, updated_at: new Date().toISOString() }).eq('id', caseId);
  await log(userId, 'cases', caseId, 'auditoria', { runId, conclusao: r.conclusao, total: linhas.length, status: novoStatus });
  return { runId, conclusao: r.conclusao, status: novoStatus };
}

export function statusPelaAuditoria(status: string[]) {
  if (status.some((s) => ['faltando', 'vencido', 'divergente', 'ilegivel'].includes(s))) return 'com_pendencias';
  if (status.some((s) => s === 'revisao_humana')) return 'conferencia_documental';
  return 'pronto_revisao_final';
}

export function listaCorrecoes(caso: any, checks: { status: string; titulo: string; detalhe: string | null }[]) {
  const pend = checks.filter((c) => c.status !== 'ok' && c.status !== 'revisao_humana');
  const rotulo: Record<string, string> = { faltando: 'FALTANDO', vencido: 'VENCIDO', divergente: 'DIVERGENTE', ilegivel: 'ILEGÍVEL' };
  return `*Correções - ${caso.tender.modalidade_nome ?? ''} ${caso.tender.numero_compra ?? ''} (${caso.company.razao_social})*

${pend.map((c) => `- [${rotulo[c.status] ?? c.status}] ${c.titulo}: ${c.detalhe ?? ''}`).join('\n') || 'Nenhuma pendência.'}

Por favor, devolver os arquivos corrigidos em PDF.`;
}
