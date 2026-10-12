// Motor do Radar: busca no PNCP, deduplica, classifica, filtra e gera o relatório do dia.
import { supabaseAdmin } from './supabase/admin';
import { buscarAtualizadas, buscarComPropostaAberta, buscarPublicadas, type CompraPNCP } from './pncp';
import { classificar, indicioMeEpp, type Categoria } from './classify';

export type ModoRadar = 'diario' | 'completo';

const hojeSP = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
const dataISO = (d: Date) => d.toISOString().slice(0, 10);

export async function runRadar(modo: ModoRadar = 'diario', userId?: string) {
  const sb = supabaseAdmin();
  const [{ data: cfg }, { data: cats }] = await Promise.all([
    sb.from('settings').select('*').eq('id', 1).single(),
    sb.from('search_categories').select('id,nome,palavras_chave,exclusoes,ativo'),
  ]);
  if (!cfg) throw new Error('Configurações não encontradas. Rode a migration do banco.');
  const categorias = (cats ?? []) as Categoria[];
  const nomeCat = new Map(categorias.map((c) => [c.id, c.nome]));

  const hoje = hojeSP();
  const { data: rel } = await sb
    .from('daily_reports')
    .insert({ data: dataISO(hoje), modo, status: 'rodando' })
    .select('id')
    .single();

  const erros: { local: string; modalidade: number; erro: string }[] = [];
  const brutos = new Map<string, CompraPNCP>();

  // Locais: municípios específicos, ou UFs, ou Brasil inteiro
  const locais: { uf?: string; municipioIbge?: string; rotulo: string }[] = cfg.municipios_ibge?.length
    ? cfg.municipios_ibge.map((m: string) => ({ municipioIbge: m, rotulo: `IBGE ${m}` }))
    : cfg.ufs?.length
      ? cfg.ufs.map((uf: string) => ({ uf, rotulo: uf }))
      : [{ rotulo: 'Brasil' }];

  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  const limiteProposta = new Date(hoje);
  limiteProposta.setDate(limiteProposta.getDate() + 120);

  for (const local of locais) {
    for (const modalidade of cfg.modalidades as number[]) {
      try {
        let lista: CompraPNCP[] = [];
        if (modo === 'completo') {
          lista = await buscarComPropostaAberta({ ate: limiteProposta, modalidade, uf: local.uf, municipioIbge: local.municipioIbge });
        } else {
          lista = await buscarPublicadas({ dataInicial: ontem, dataFinal: hoje, modalidade, uf: local.uf, municipioIbge: local.municipioIbge });
          if (cfg.incluir_atualizados) {
            lista.push(
              ...(await buscarAtualizadas({ dataInicial: ontem, dataFinal: hoje, modalidade, uf: local.uf, municipioIbge: local.municipioIbge })),
            );
          }
        }
        // deduplicação: mesmo número de controle = mesma licitação; fica a versão mais recente
        for (const c of lista) {
          const atual = brutos.get(c.numeroControlePNCP);
          if (!atual || (c.dataAtualizacaoGlobal ?? '') > (atual.dataAtualizacaoGlobal ?? '')) brutos.set(c.numeroControlePNCP, c);
        }
      } catch (e) {
        erros.push({ local: local.rotulo, modalidade, erro: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  // Classificação e filtros
  const agora = Date.now();
  const linhas: Record<string, unknown>[] = [];
  const porSegmento: Record<string, number> = {};
  let prioritarias = 0;

  for (const c of brutos.values()) {
    const objeto = c.objetoCompra ?? '';
    const { ids, score } = classificar(objeto, c.informacaoComplementar, categorias);
    if (!ids.length) continue; // fora dos segmentos monitorados

    const valor = c.valorTotalEstimado ?? null;
    if (cfg.valor_min && valor !== null && valor < Number(cfg.valor_min)) continue;
    if (cfg.valor_max && valor !== null && valor > Number(cfg.valor_max)) continue;

    if (c.dataEncerramentoProposta) {
      const dias = (new Date(c.dataEncerramentoProposta).getTime() - agora) / 86_400_000;
      if (dias < (cfg.dias_minimos_proposta ?? 0)) continue; // prazo curto demais ou já encerrada
    }
    const meEpp = indicioMeEpp(objeto, c.informacaoComplementar);
    if (cfg.somente_me_epp && !meEpp) continue;

    const prioritaria = score >= 2 || (meEpp && score >= 1);
    if (prioritaria) prioritarias++;
    ids.forEach((id) => (porSegmento[nomeCat.get(id)!] = (porSegmento[nomeCat.get(id)!] ?? 0) + 1));

    linhas.push({
      numero_controle_pncp: c.numeroControlePNCP,
      orgao_cnpj: c.orgaoEntidade?.cnpj,
      ano_compra: c.anoCompra,
      sequencial_compra: c.sequencialCompra,
      numero_compra: c.numeroCompra,
      processo: c.processo,
      orgao_nome: c.orgaoEntidade?.razaoSocial,
      unidade_nome: c.unidadeOrgao?.nomeUnidade,
      municipio: c.unidadeOrgao?.municipioNome,
      uf: c.unidadeOrgao?.ufSigla,
      modalidade_id: c.modalidadeId,
      modalidade_nome: c.modalidadeNome,
      modo_disputa: c.modoDisputaNome,
      objeto,
      informacao_complementar: c.informacaoComplementar,
      valor_estimado: valor,
      data_publicacao: c.dataPublicacaoPncp,
      data_abertura_proposta: c.dataAberturaProposta,
      data_encerramento_proposta: c.dataEncerramentoProposta,
      situacao_nome: c.situacaoCompraNome,
      link_sistema_origem: c.linkSistemaOrigem,
      srp: c.srp,
      me_epp_indicio: meEpp,
      categorias: ids,
      score,
      prioritaria,
      ultima_conferencia_fonte: new Date().toISOString(),
      raw: c,
      updated_at: new Date().toISOString(),
    });
  }

  // Grava em lotes. Marcadores (visto, favorito, ignorado) não são tocados no update.
  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await sb.from('tenders').upsert(linhas.slice(i, i + 200), { onConflict: 'numero_controle_pncp' });
    if (error) erros.push({ local: 'banco', modalidade: 0, erro: error.message });
  }

  const totalConsultas = locais.length * (cfg.modalidades as number[]).length;
  const status = erros.length === 0 ? 'concluido' : erros.length >= totalConsultas ? 'falhou' : 'parcial';

  await sb
    .from('daily_reports')
    .update({
      status,
      encontradas: brutos.size,
      pre_filtradas: linhas.length,
      prioritarias,
      por_segmento: porSegmento,
      erros,
      concluido_em: new Date().toISOString(),
    })
    .eq('id', rel!.id);

  await sb.from('activity_logs').insert({
    user_id: userId ?? null,
    entidade: 'daily_reports',
    entidade_id: rel!.id,
    acao: `radar_${modo}`,
    detalhe: { status, encontradas: brutos.size, pre_filtradas: linhas.length, erros: erros.length },
  });

  return { status, encontradas: brutos.size, preFiltradas: linhas.length, prioritarias, erros };
}
