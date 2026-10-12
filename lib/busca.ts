// Busca sob encomenda: vai ao PNCP só nos estados e modalidades pedidos,
// traz as licitações com proposta aberta e classifica por segmento.
import { supabaseAdmin } from './supabase/admin';
import { BuscaIncompleta, buscarComPropostaAberta, definirPrazoBusca, type CompraPNCP } from './pncp';
import { classificar, indicioMeEpp, type Categoria } from './classify';

export const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

const VALIDADE_CACHE_HORAS = 6; // a mesma UF+modalidade não é baixada de novo dentro desse prazo

export async function buscarSobDemanda(o: { ufs: string[]; modalidades: number[]; forcar?: boolean; userId?: string }) {
  const sb = supabaseAdmin();
  definirPrazoBusca(240_000);
  const { data: cats } = await sb.from('search_categories').select('id,nome,palavras_chave,exclusoes,ativo');
  const categorias = (cats ?? []) as Categoria[];
  const { data: cache } = await sb.from('buscas_cache').select('uf,modalidade,feito_em');
  const recente = (uf: string, m: number) => {
    const c = cache?.find((x) => x.uf === uf && x.modalidade === m);
    return c && Date.now() - new Date(c.feito_em).getTime() < VALIDADE_CACHE_HORAS * 3_600_000;
  };

  const ate = new Date();
  ate.setDate(ate.getDate() + 180);
  let consultadas = 0;
  let guardadas = 0;
  const erros: string[] = [];

  for (const uf of o.ufs) {
    for (const modalidade of o.modalidades) {
      if (!o.forcar && recente(uf, modalidade)) continue;
      consultadas++;
      let lista: CompraPNCP[] = [];
      let completa = true;
      try {
        lista = await buscarComPropostaAberta({ ate, modalidade, uf });
      } catch (e) {
        completa = false;
        if (e instanceof BuscaIncompleta) lista = e.parcial;
        erros.push(`${uf}: ${e instanceof Error ? e.message : String(e)}`);
      }
      guardadas += await guardar(lista, categorias);
      if (completa) {
        await sb.from('buscas_cache').upsert({ uf, modalidade, feito_em: new Date().toISOString() }, { onConflict: 'uf,modalidade' });
      }
    }
  }
  await sb.from('activity_logs').insert({
    user_id: o.userId ?? null,
    entidade: 'buscas_cache',
    acao: 'busca_sob_demanda',
    detalhe: { ufs: o.ufs, modalidades: o.modalidades, consultadas, guardadas, erros },
  });
  return { consultadas, guardadas, erros };
}

async function guardar(lista: CompraPNCP[], categorias: Categoria[]) {
  const sb = supabaseAdmin();
  const unicas = new Map<string, CompraPNCP>();
  lista.forEach((c) => unicas.set(c.numeroControlePNCP, c));
  const linhas: Record<string, unknown>[] = [];
  for (const c of unicas.values()) {
    const objeto = c.objetoCompra ?? '';
    const { ids, score } = classificar(objeto, c.informacaoComplementar, categorias);
    if (!ids.length) continue; // não é de nenhum segmento: nem guarda
    const meEpp = indicioMeEpp(objeto, c.informacaoComplementar);
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
      valor_estimado: c.valorTotalEstimado ?? null,
      data_publicacao: c.dataPublicacaoPncp,
      data_abertura_proposta: c.dataAberturaProposta,
      data_encerramento_proposta: c.dataEncerramentoProposta,
      situacao_nome: c.situacaoCompraNome,
      link_sistema_origem: c.linkSistemaOrigem,
      srp: c.srp,
      me_epp_indicio: meEpp,
      categorias: ids,
      score,
      prioritaria: score >= 2 || (meEpp && score >= 1),
      ultima_conferencia_fonte: new Date().toISOString(),
      raw: c,
      updated_at: new Date().toISOString(),
    });
  }
  for (let i = 0; i < linhas.length; i += 200) {
    await sb.from('tenders').upsert(linhas.slice(i, i + 200), { onConflict: 'numero_controle_pncp' });
  }
  return linhas.length;
}
