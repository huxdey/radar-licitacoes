// Processador de documentos: abre ZIP, extrai texto de Word/Excel e prepara PDFs/imagens para a IA.
import JSZip from 'jszip';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import type Anthropic from '@anthropic-ai/sdk';

export type Arquivo = { nome: string; buf: Buffer };

const ext = (nome: string) => nome.toLowerCase().split('.').pop() ?? '';

/** Abre ZIPs (inclusive ZIP dentro de ZIP) e devolve a lista plana de arquivos. */
export async function expandir(arq: Arquivo, prefixo = ''): Promise<Arquivo[]> {
  if (ext(arq.nome) !== 'zip' && !(arq.buf[0] === 0x50 && arq.buf[1] === 0x4b && !/\.(docx|xlsx|pptx|odt|ods)$/i.test(arq.nome))) {
    return [{ nome: prefixo + arq.nome, buf: arq.buf }];
  }
  const zip = await JSZip.loadAsync(arq.buf);
  const out: Arquivo[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || entry.name.startsWith('__MACOSX') || entry.name.split('/').pop()!.startsWith('.')) continue;
    const buf = Buffer.from(await entry.async('uint8array'));
    out.push(...(await expandir({ nome: entry.name, buf }, `${prefixo}${arq.nome.replace(/\.zip$/i, '')}/`)));
  }
  return out;
}

export const mimeDe = (nome: string) =>
  ({
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    txt: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    zip: 'application/zip',
  })[ext(nome)] ?? 'application/octet-stream';

const LIMITE_TEXTO = 180_000; // caracteres por arquivo

export type Bloco = Anthropic.Messages.ContentBlockParam;

/** Converte um arquivo num bloco que a IA consegue ler. Devolve null se o formato não for suportado. */
export async function paraBloco(arq: Arquivo, titulo = arq.nome): Promise<{ bloco: Bloco; bytes: number } | { erro: string }> {
  const e = ext(arq.nome);
  try {
    if (e === 'pdf') {
      return {
        bloco: { type: 'document', title: titulo, source: { type: 'base64', media_type: 'application/pdf', data: arq.buf.toString('base64') } },
        bytes: arq.buf.length,
      };
    }
    if (e === 'png' || e === 'jpg' || e === 'jpeg') {
      return {
        bloco: {
          type: 'image',
          source: { type: 'base64', media_type: e === 'png' ? 'image/png' : 'image/jpeg', data: arq.buf.toString('base64') },
        },
        bytes: arq.buf.length,
      };
    }
    let texto = '';
    if (e === 'docx') texto = (await mammoth.extractRawText({ buffer: arq.buf })).value;
    else if (['xlsx', 'xls', 'ods', 'csv'].includes(e)) {
      const wb = XLSX.read(arq.buf, { type: 'buffer' });
      texto = wb.SheetNames.map((n) => `### Planilha: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n');
    } else if (['txt', 'html', 'htm', 'xml', 'json', 'md'].includes(e)) texto = arq.buf.toString('utf8');
    else return { erro: `Formato .${e} não suportado para leitura automática` };

    if (!texto.trim()) return { erro: 'Arquivo sem texto legível (pode ser imagem escaneada)' };
    if (texto.length > LIMITE_TEXTO) texto = texto.slice(0, LIMITE_TEXTO) + '\n[... arquivo truncado por tamanho ...]';
    return {
      bloco: { type: 'document', title: titulo, source: { type: 'text', media_type: 'text/plain', data: texto } },
      bytes: texto.length,
    };
  } catch (err) {
    return { erro: `Não foi possível ler: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Ordem de leitura: edital e termo de referência primeiro. */
export function prioridadeEdital(nome: string) {
  const n = nome.toLowerCase();
  if (/edital/.test(n) && !/anexo/.test(n)) return 0;
  if (/termo de refer|\btr\b/.test(n)) return 1;
  if (/retifica|errata|esclarecimento|impugna/.test(n)) return 2;
  if (/modelo|declara|proposta/.test(n)) return 3;
  if (/planilha|custo/.test(n)) return 4;
  if (/estudo t[eé]cnico|etp/.test(n)) return 6;
  return 5;
}
