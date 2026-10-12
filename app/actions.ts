'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { reclassificarExistentes, runRadar, type ModoRadar } from '@/lib/radar';
import { consultarCompra, parseIdentificador } from '@/lib/pncp';
import { classificar, indicioMeEpp, type Categoria } from '@/lib/classify';
import {
  anexarArquivoEdital, analisarEditalDoCaso, auditarCaso, baixarDocumentacao, montarSolicitacao,
  receberDocumentos, statusPelaAuditoria,
} from '@/lib/processos';

export type Resultado = { ok: boolean; msg: string };

async function membro() {
  const m = await requireMember();
  if (!m.user || !m.member) throw new Error('Acesso não autorizado');
  return m;
}
const erro = (e: unknown): Resultado => ({ ok: false, msg: e instanceof Error ? e.message : String(e) });

async function arquivosDoForm(fd: FormData, campo = 'arquivos') {
  const files = fd.getAll(campo).filter((f): f is File => f instanceof File && f.size > 0);
  return Promise.all(files.map(async (f) => ({ nome: f.name, buf: Buffer.from(await f.arrayBuffer()) })));
}

// ------------------------------------------------------------ Radar

export async function rodarRadarAgora(modo: ModoRadar): Promise<Resultado> {
  try {
    const { user } = await membro();
    const r = await runRadar(modo, user!.id);
    revalidatePath('/');
    revalidatePath('/radar');
    const base = `${r.preFiltradas} licitações nos seus segmentos (${r.prioritarias} prioritárias), de ${r.encontradas} que o governo publicou no total.`;
    if (r.status === 'concluido') return { ok: true, msg: base };
    if (r.status === 'parcial') return { ok: true, msg: `${base} Parte da busca não terminou a tempo: clique de novo para completar.` };
    return { ok: false, msg: `O PNCP não respondeu. Tente de novo em alguns minutos. (${r.erros[0]?.erro ?? ''})` };
  } catch (e) {
    return erro(e);
  }
}

export async function marcarLicitacao(id: string, campo: 'visualizado' | 'favorito' | 'ignorado' | 'arquivado', valor: boolean) {
  const { sb } = await membro();
  await sb.from('tenders').update({ [campo]: valor }).eq('id', id);
  revalidatePath('/radar');
}

export async function adicionarLicitacaoManual(fd: FormData): Promise<Resultado> {
  try {
    const { sb, user } = await membro();
    const entrada = String(fd.get('identificador') ?? '');
    const objetoManual = String(fd.get('objeto') ?? '').trim();
    const id = parseIdentificador(entrada);
    const { data: cats } = await sb.from('search_categories').select('id,nome,palavras_chave,exclusoes,ativo');

    if (id) {
      const c = await consultarCompra(id.cnpj, id.ano, id.sequencial);
      if (!c) return { ok: false, msg: 'Não encontrei essa contratação no PNCP.' };
      const { ids, score } = classificar(c.objetoCompra ?? '', c.informacaoComplementar, (cats ?? []) as Categoria[]);
      const { error } = await sb.from('tenders').upsert(
        {
          numero_controle_pncp: c.numeroControlePNCP, orgao_cnpj: id.cnpj, ano_compra: id.ano, sequencial_compra: id.sequencial,
          numero_compra: c.numeroCompra, processo: c.processo, orgao_nome: c.orgaoEntidade?.razaoSocial,
          unidade_nome: c.unidadeOrgao?.nomeUnidade, municipio: c.unidadeOrgao?.municipioNome, uf: c.unidadeOrgao?.ufSigla,
          modalidade_id: c.modalidadeId, modalidade_nome: c.modalidadeNome, modo_disputa: c.modoDisputaNome,
          objeto: c.objetoCompra, informacao_complementar: c.informacaoComplementar, valor_estimado: c.valorTotalEstimado,
          data_publicacao: c.dataPublicacaoPncp, data_abertura_proposta: c.dataAberturaProposta,
          data_encerramento_proposta: c.dataEncerramentoProposta, situacao_nome: c.situacaoCompraNome,
          link_sistema_origem: c.linkSistemaOrigem, srp: c.srp, me_epp_indicio: indicioMeEpp(c.objetoCompra ?? '', c.informacaoComplementar),
          categorias: ids, score, origem: 'manual', favorito: true, ultima_conferencia_fonte: new Date().toISOString(), raw: c,
        },
        { onConflict: 'numero_controle_pncp' },
      );
      if (error) throw new Error(error.message);
    } else {
      if (!objetoManual) return { ok: false, msg: 'Informe o número de controle/link do PNCP ou, sem PNCP, o objeto da licitação.' };
      const { error } = await sb.from('tenders').insert({
        objeto: objetoManual,
        orgao_nome: String(fd.get('orgao') ?? '') || null,
        numero_compra: String(fd.get('numero') ?? '') || null,
        link_sistema_origem: entrada || null,
        data_encerramento_proposta: fd.get('prazo') ? new Date(String(fd.get('prazo'))).toISOString() : null,
        origem: 'manual',
        favorito: true,
      });
      if (error) throw new Error(error.message);
    }
    await sb.from('activity_logs').insert({ user_id: user!.id, entidade: 'tenders', acao: 'adicionar_manual', detalhe: { entrada } });
    revalidatePath('/radar');
    return { ok: true, msg: 'Licitação adicionada aos favoritos do radar.' };
  } catch (e) {
    return erro(e);
  }
}

export async function iniciarProcesso(fd: FormData) {
  const { sb, user } = await membro();
  const tenderId = String(fd.get('tender_id'));
  const companyId = String(fd.get('company_id'));
  const { data: existente } = await sb.from('cases').select('id').eq('tender_id', tenderId).eq('company_id', companyId).maybeSingle();
  let id = existente?.id as string | undefined;
  if (!id) {
    const { data, error } = await sb
      .from('cases')
      .insert({ tender_id: tenderId, company_id: companyId, status: 'separado', created_by: user!.id })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    id = data.id;
    await sb.from('tenders').update({ visualizado: true, favorito: true }).eq('id', tenderId);
    await sb.from('activity_logs').insert({ user_id: user!.id, entidade: 'cases', entidade_id: id, acao: 'iniciar_processo' });
  }
  redirect(`/pregoes/${id}`);
}

// ------------------------------------------------------------ Empresas

export async function salvarEmpresa(fd: FormData): Promise<Resultado> {
  try {
    const { sb, user } = await membro();
    const id = String(fd.get('id') ?? '');
    const row = {
      razao_social: String(fd.get('razao_social') ?? '').trim(),
      nome_fantasia: String(fd.get('nome_fantasia') ?? '').trim() || null,
      cnpj: String(fd.get('cnpj') ?? '').replace(/\D/g, ''),
      segmentos: fd.getAll('segmentos').map(String),
      cidade: String(fd.get('cidade') ?? '').trim() || null,
      uf: String(fd.get('uf') ?? '').trim().toUpperCase() || null,
      contato_nome: String(fd.get('contato_nome') ?? '').trim() || null,
      contato_telefone: String(fd.get('contato_telefone') ?? '').trim() || null,
      contato_email: String(fd.get('contato_email') ?? '').trim() || null,
      observacoes: String(fd.get('observacoes') ?? '').trim() || null,
    };
    if (!row.razao_social || row.cnpj.length !== 14) return { ok: false, msg: 'Razão social e CNPJ (14 dígitos) são obrigatórios.' };
    const q = id ? sb.from('companies').update(row).eq('id', id) : sb.from('companies').insert(row);
    const { error } = await q;
    if (error) throw new Error(error.message.includes('duplicate') ? 'Já existe empresa com esse CNPJ.' : error.message);
    await sb.from('activity_logs').insert({ user_id: user!.id, entidade: 'companies', acao: id ? 'editar' : 'criar', detalhe: { cnpj: row.cnpj } });
    revalidatePath('/empresas');
    return { ok: true, msg: 'Empresa salva.' };
  } catch (e) {
    return erro(e);
  }
}

// ------------------------------------------------------------ Configurações

const lista = (v: FormDataEntryValue | null) =>
  String(v ?? '')
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);

export async function salvarCategoria(fd: FormData): Promise<Resultado> {
  try {
    const { sb } = await membro();
    const id = String(fd.get('id') ?? '');
    const row = {
      nome: String(fd.get('nome') ?? '').trim(),
      palavras_chave: lista(fd.get('palavras_chave')),
      exclusoes: lista(fd.get('exclusoes')),
      complexidade: String(fd.get('complexidade') ?? 'media'),
      ativo: fd.get('ativo') === 'on',
    };
    if (!row.nome || !row.palavras_chave.length) return { ok: false, msg: 'Nome e ao menos uma palavra-chave.' };
    const { error } = id ? await sb.from('search_categories').update(row).eq('id', id) : await sb.from('search_categories').insert(row);
    if (error) throw new Error(error.message);
    const n = await reclassificarExistentes();
    revalidatePath('/configuracoes');
    revalidatePath('/radar');
    return { ok: true, msg: `Segmento salvo. ${n} licitação(ões) reclassificada(s).` };
  } catch (e) {
    return erro(e);
  }
}

export async function salvarConfiguracoes(fd: FormData): Promise<Resultado> {
  try {
    const { sb } = await membro();
    const num = (k: string) => (fd.get(k) ? Number(String(fd.get(k)).replace(/\./g, '').replace(',', '.')) : null);
    const { error } = await sb
      .from('settings')
      .update({
        ufs: lista(fd.get('ufs')).map((s) => s.toUpperCase()),
        municipios_ibge: lista(fd.get('municipios_ibge')),
        modalidades: fd.getAll('modalidades').map(Number),
        valor_min: num('valor_min'),
        valor_max: num('valor_max'),
        dias_minimos_proposta: Number(fd.get('dias_minimos_proposta') ?? 0),
        somente_me_epp: fd.get('somente_me_epp') === 'on',
        incluir_atualizados: fd.get('incluir_atualizados') === 'on',
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    if (error) throw new Error(error.message);
    revalidatePath('/configuracoes');
    return { ok: true, msg: 'Regras de busca salvas.' };
  } catch (e) {
    return erro(e);
  }
}

// ------------------------------------------------------------ Processo (pregão + empresa)

export async function mudarStatus(caseId: string, status: string): Promise<Resultado> {
  try {
    const { sb, user } = await membro();
    const extra = status === 'preparado_envio' ? { aprovado_por: user!.id, aprovado_em: new Date().toISOString() } : {};
    const { error } = await sb.from('cases').update({ status, ...extra, updated_at: new Date().toISOString() }).eq('id', caseId);
    if (error) throw new Error(error.message);
    await sb.from('activity_logs').insert({ user_id: user!.id, entidade: 'cases', entidade_id: caseId, acao: 'status', detalhe: { status } });
    revalidatePath(`/pregoes/${caseId}`);
    revalidatePath('/pregoes');
    return { ok: true, msg: 'Status atualizado.' };
  } catch (e) {
    return erro(e);
  }
}

export async function salvarDadosProcesso(fd: FormData): Promise<Resultado> {
  try {
    const { sb, user } = await membro();
    const caseId = String(fd.get('case_id'));
    const prazo = String(fd.get('prazo_interno') ?? '') || null;
    const viabilidade = {
      custo_estimado: String(fd.get('custo_estimado') ?? ''),
      preco_minimo: String(fd.get('preco_minimo') ?? ''),
      capacidade: String(fd.get('capacidade') ?? ''),
      riscos: String(fd.get('riscos') ?? ''),
    };
    await sb.from('cases').update({ prazo_interno: prazo, observacoes: String(fd.get('observacoes') ?? ''), viabilidade, updated_at: new Date().toISOString() }).eq('id', caseId);
    // atualiza o prazo dentro do texto de solicitação
    const { data: caso } = await sb.from('cases').select('*, tender:tenders(*), company:companies(*)').eq('id', caseId).single();
    const { data: reqs } = await sb.from('requirements').select('*').eq('case_id', caseId).order('ordem');
    if (caso && reqs?.length) await sb.from('cases').update({ solicitacao_texto: montarSolicitacao(caso, reqs, prazo) }).eq('id', caseId);
    await sb.from('activity_logs').insert({ user_id: user!.id, entidade: 'cases', entidade_id: caseId, acao: 'editar_dados' });
    revalidatePath(`/pregoes/${caseId}`);
    return { ok: true, msg: 'Dados salvos.' };
  } catch (e) {
    return erro(e);
  }
}

export async function baixarDocumentacaoAcao(caseId: string): Promise<Resultado> {
  try {
    const { user } = await membro();
    const r = await baixarDocumentacao(caseId, user!.id);
    revalidatePath(`/pregoes/${caseId}`);
    const msg = `${r.baixados} arquivo(s) baixado(s)${r.falhas ? `, ${r.falhas} falharam (veja a lista e baixe manualmente)` : ''}.${r.aviso ? ' ' + r.aviso : ''}`;
    return { ok: r.falhas === 0 && !r.aviso, msg };
  } catch (e) {
    return erro(e);
  }
}

export async function enviarArquivosEdital(fd: FormData): Promise<Resultado> {
  try {
    const { user } = await membro();
    const caseId = String(fd.get('case_id'));
    const tenderId = String(fd.get('tender_id'));
    const arqs = await arquivosDoForm(fd);
    for (const a of arqs) await anexarArquivoEdital(tenderId, a, user!.id);
    revalidatePath(`/pregoes/${caseId}`);
    return { ok: true, msg: `${arqs.length} arquivo(s) do edital anexado(s).` };
  } catch (e) {
    return erro(e);
  }
}

export async function analisarEditalAcao(caseId: string): Promise<Resultado> {
  try {
    const { user } = await membro();
    const r = await analisarEditalDoCaso(caseId, user!.id);
    revalidatePath(`/pregoes/${caseId}`);
    return {
      ok: r.naoLidos.length === 0,
      msg: `${r.exigencias} exigências extraídas.${r.naoLidos.length ? ` ${r.naoLidos.length} arquivo(s) não foram lidos, confira a lista.` : ''}`,
    };
  } catch (e) {
    return erro(e);
  }
}

export async function marcarDocumentacaoSolicitada(caseId: string): Promise<Resultado> {
  return mudarStatus(caseId, 'documentacao_solicitada');
}

export async function enviarDocumentosEmpresa(fd: FormData): Promise<Resultado> {
  try {
    const { user } = await membro();
    const caseId = String(fd.get('case_id'));
    const arqs = await arquivosDoForm(fd);
    if (!arqs.length) return { ok: false, msg: 'Selecione ao menos um arquivo.' };
    const r = await receberDocumentos(caseId, arqs, user!.id);
    revalidatePath(`/pregoes/${caseId}`);
    return { ok: true, msg: `${r.novos} novo(s), ${r.substituidos} substituído(s) por nova versão.` };
  } catch (e) {
    return erro(e);
  }
}

export async function auditarAcao(caseId: string): Promise<Resultado> {
  try {
    const { user } = await membro();
    const r = await auditarCaso(caseId, user!.id);
    revalidatePath(`/pregoes/${caseId}`);
    return { ok: r.status === 'pronto_revisao_final', msg: r.conclusao };
  } catch (e) {
    return erro(e);
  }
}

/** Você confirma manualmente um item que a IA mandou revisar. */
export async function validarItem(checkId: string, caseId: string, aprovado: boolean): Promise<Resultado> {
  try {
    const { sb, nome, user } = await membro();
    const { data: chk } = await sb.from('document_checks').select('*').eq('id', checkId).single();
    if (!chk) return { ok: false, msg: 'Item não encontrado.' };
    await sb
      .from('document_checks')
      .update({
        status: aprovado ? 'ok' : 'divergente',
        detalhe: `${aprovado ? 'Validado' : 'Reprovado'} manualmente por ${nome ?? 'usuário'} em ${new Date().toLocaleDateString('pt-BR')}. ${chk.detalhe ?? ''}`,
      })
      .eq('id', checkId);
    const { data: run } = await supabaseAdmin().from('document_checks').select('status').eq('case_id', caseId).eq('run_id', chk.run_id);
    await sb.from('cases').update({ status: statusPelaAuditoria((run ?? []).map((r) => r.status)) }).eq('id', caseId);
    await sb.from('activity_logs').insert({ user_id: user!.id, entidade: 'document_checks', entidade_id: checkId, acao: aprovado ? 'validar' : 'reprovar' });
    revalidatePath(`/pregoes/${caseId}`);
    return { ok: true, msg: 'Registrado.' };
  } catch (e) {
    return erro(e);
  }
}
