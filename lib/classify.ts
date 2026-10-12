// Classificação das licitações por segmento usando palavras-chave (sem IA, rápido e previsível)

export type Categoria = { id: string; nome: string; palavras_chave: string[]; exclusoes: string[]; ativo: boolean };

export const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const contem = (texto: string, termo: string) => {
  const t = normalizar(termo);
  if (!t) return false;
  // palavra inteira (evita "split" casar com "splitter", "pneus" com "pneumatico")
  return new RegExp(`(^|\\s)${t.replace(/[-]/g, '[- ]?')}(s|es)?(\\s|$)`).test(texto);
};

/**
 * Cada licitação recebe UM segmento só: o que tiver mais palavras-chave batendo
 * (no empate, o de palavras mais específicas/longas). Assim os segmentos não se misturam.
 * Classifica contra todos os segmentos; quais aparecem é decidido pelos segmentos ativos.
 */
export function classificar(objeto: string, complemento: string | undefined, categorias: Categoria[]) {
  const texto = normalizar(`${objeto} ${complemento ?? ''}`);
  let melhor: { c: Categoria; hits: number; especificidade: number } | null = null;
  for (const c of categorias) {
    if (c.exclusoes.some((e) => contem(texto, e))) continue;
    const batidas = c.palavras_chave.filter((p) => contem(texto, p));
    if (!batidas.length) continue;
    const especificidade = batidas.reduce((s, p) => s + p.length, 0);
    if (!melhor || batidas.length > melhor.hits || (batidas.length === melhor.hits && especificidade > melhor.especificidade)) {
      melhor = { c, hits: batidas.length, especificidade };
    }
  }
  return melhor
    ? { ids: [melhor.c.id], nomes: [melhor.c.nome], score: melhor.hits }
    : { ids: [] as string[], nomes: [] as string[], score: 0 };
}

/** Indício de benefício ME/EPP no texto. A confirmação real é no edital/itens. */
export function indicioMeEpp(objeto: string, complemento?: string) {
  const t = normalizar(`${objeto} ${complemento ?? ''}`);
  return /(exclusiv\w* (para |a )?(me|microempresa)|me ?\/? ?epp|cota reservada|lc 123|lei complementar 123)/.test(t);
}

/** Exigências que costumam deixar um edital complexo, mesmo em segmento "simples". */
export function sinaisDeComplexidade(texto: string) {
  const t = normalizar(texto);
  const sinais: [RegExp, string][] = [
    [/dedicacao exclusiva de mao de obra|postos de trabalho/, 'Mão de obra dedicada (planilha de custos e convenção coletiva)'],
    [/visita tecnica/, 'Visita técnica'],
    [/amostra/, 'Exige amostra'],
    [/garantia contratual|garantia de execucao/, 'Garantia contratual'],
    [/\bcrea\b|\bcau\b|responsavel tecnico/, 'Registro em conselho / responsável técnico'],
    [/licenca (sanitaria|ambiental)|anvisa|vigilancia sanitaria/, 'Licença sanitária ou ambiental'],
  ];
  return sinais.filter(([re]) => re.test(t)).map(([, s]) => s);
}
