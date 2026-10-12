// Integração com a API pública do PNCP (Portal Nacional de Contratações Públicas)
// Documentação: https://pncp.gov.br/api/consulta/swagger-ui/index.html

const CONSULTA = 'https://pncp.gov.br/api/consulta/v1';
const PNCP = 'https://pncp.gov.br/api/pncp/v1';

export const MODALIDADES: Record<number, string> = {
  1: 'Leilão eletrônico',
  2: 'Diálogo competitivo',
  3: 'Concurso',
  4: 'Concorrência eletrônica',
  5: 'Concorrência presencial',
  6: 'Pregão eletrônico',
  7: 'Pregão presencial',
  8: 'Dispensa de licitação',
  9: 'Inexigibilidade',
  10: 'Manifestação de interesse',
  11: 'Pré-qualificação',
  12: 'Credenciamento',
  13: 'Leilão presencial',
};

export type CompraPNCP = {
  numeroControlePNCP: string;
  anoCompra: number;
  sequencialCompra: number;
  numeroCompra?: string;
  processo?: string;
  objetoCompra?: string;
  informacaoComplementar?: string;
  valorTotalEstimado?: number;
  dataPublicacaoPncp?: string;
  dataAberturaProposta?: string;
  dataEncerramentoProposta?: string;
  dataAtualizacaoGlobal?: string;
  modalidadeId?: number;
  modalidadeNome?: string;
  modoDisputaNome?: string;
  situacaoCompraNome?: string;
  linkSistemaOrigem?: string;
  srp?: boolean;
  orgaoEntidade?: { cnpj?: string; razaoSocial?: string };
  unidadeOrgao?: { ufSigla?: string; municipioNome?: string; nomeUnidade?: string; codigoIbge?: string };
};

type Pagina<T> = { data: T[]; totalPaginas: number; numeroPagina: number; paginasRestantes: number; totalRegistros: number };

export const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

async function getJson<T>(url: string, tentativas = 3): Promise<T | null> {
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
      if (r.status === 204) return null; // sem resultados
      if (r.ok) return (await r.json()) as T;
      ultimoErro = new Error(`PNCP respondeu ${r.status} em ${url}`);
      if (r.status < 500 && r.status !== 429) break; // erro de parâmetro: não adianta repetir
    } catch (e) {
      ultimoErro = e;
    }
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
  throw ultimoErro;
}

/** Percorre todas as páginas. Lança erro se alguma página falhar (nunca devolve lista incompleta em silêncio). */
async function todasPaginas(base: string, params: Record<string, string | number | undefined>, maxPaginas = 200) {
  const out: CompraPNCP[] = [];
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const qs = new URLSearchParams();
    Object.entries({ ...params, pagina, tamanhoPagina: 50 }).forEach(([k, v]) => v !== undefined && String(v) !== '' && qs.set(k, String(v)));
    const p = await getJson<Pagina<CompraPNCP>>(`${base}?${qs}`);
    if (!p || !p.data?.length) break;
    out.push(...p.data);
    if (!p.paginasRestantes) break;
  }
  return out;
}

/** Contratações publicadas no período (novidades do dia). */
export function buscarPublicadas(o: { dataInicial: Date; dataFinal: Date; modalidade: number; uf?: string; municipioIbge?: string }) {
  return todasPaginas(`${CONSULTA}/contratacoes/publicacao`, {
    dataInicial: yyyymmdd(o.dataInicial),
    dataFinal: yyyymmdd(o.dataFinal),
    codigoModalidadeContratacao: o.modalidade,
    uf: o.uf,
    codigoMunicipioIbge: o.municipioIbge,
  });
}

/** Contratações atualizadas no período (retificações, mudanças de prazo). */
export function buscarAtualizadas(o: { dataInicial: Date; dataFinal: Date; modalidade: number; uf?: string; municipioIbge?: string }) {
  return todasPaginas(`${CONSULTA}/contratacoes/atualizacao`, {
    dataInicial: yyyymmdd(o.dataInicial),
    dataFinal: yyyymmdd(o.dataFinal),
    codigoModalidadeContratacao: o.modalidade,
    uf: o.uf,
    codigoMunicipioIbge: o.municipioIbge,
  });
}

/** Contratações com recebimento de propostas aberto (carga completa). */
export function buscarComPropostaAberta(o: { ate: Date; modalidade?: number; uf?: string; municipioIbge?: string }) {
  return todasPaginas(`${CONSULTA}/contratacoes/proposta`, {
    dataFinal: yyyymmdd(o.ate),
    codigoModalidadeContratacao: o.modalidade,
    uf: o.uf,
    codigoMunicipioIbge: o.municipioIbge,
  });
}

/** Reconfere uma contratação na fonte oficial. */
export function consultarCompra(cnpj: string, ano: number, sequencial: number) {
  return getJson<CompraPNCP>(`${CONSULTA}/orgaos/${cnpj}/compras/${ano}/${sequencial}`);
}

export type ArquivoPNCP = {
  sequencialDocumento?: number;
  titulo?: string;
  tipoDocumentoNome?: string;
  tipoDocumentoDescricao?: string;
  url?: string;
  uri?: string;
  statusAtivo?: boolean;
};

/** Lista os arquivos publicados de uma contratação (edital, TR, anexos). */
export async function listarArquivos(cnpj: string, ano: number, sequencial: number) {
  const r = await getJson<ArquivoPNCP[]>(`${PNCP}/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`);
  return (r ?? []).filter((a) => a.statusAtivo !== false);
}

export function urlArquivo(cnpj: string, ano: number, sequencial: number, a: ArquivoPNCP) {
  return a.url || a.uri || `${PNCP}/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos/${a.sequencialDocumento}`;
}

export async function baixar(url: string) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Download falhou (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  // tenta descobrir o nome real do arquivo
  const cd = r.headers.get('content-disposition') || '';
  const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return { buf, nome: m ? decodeURIComponent(m[1]) : undefined, mime: r.headers.get('content-type') || undefined };
}

/** Aceita "CNPJ-1-SEQ/ANO" ou um link do PNCP (…/app/editais/CNPJ/ANO/SEQ). */
export function parseIdentificador(entrada: string) {
  const s = entrada.trim();
  let m = s.match(/(\d{14})-\d+-(\d+)\/(\d{4})/);
  if (m) return { cnpj: m[1], sequencial: Number(m[2]), ano: Number(m[3]) };
  m = s.match(/editais\/(\d{14})\/(\d{4})\/(\d+)/);
  if (m) return { cnpj: m[1], ano: Number(m[2]), sequencial: Number(m[3]) };
  return null;
}

export const linkPortalPNCP = (cnpj?: string | null, ano?: number | null, seq?: number | null) =>
  cnpj && ano && seq ? `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}` : undefined;
