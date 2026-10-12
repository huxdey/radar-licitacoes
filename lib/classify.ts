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

export function classificar(objeto: string, complemento: string | undefined, categorias: Categoria[]) {
  const texto = normalizar(`${objeto} ${complemento ?? ''}`);
  const ids: string[] = [];
  const nomes: string[] = [];
  let score = 0;
  for (const c of categorias) {
    if (!c.ativo) continue;
    if (c.exclusoes.some((e) => contem(texto, e))) continue;
    const hits = c.palavras_chave.filter((p) => contem(texto, p)).length;
    if (hits > 0) {
      ids.push(c.id);
      nomes.push(c.nome);
      score += hits;
    }
  }
  return { ids, nomes, score };
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
