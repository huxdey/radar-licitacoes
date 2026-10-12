// IA documental: leitura do edital (saídas A e B) e auditoria dos documentos recebidos.
import Anthropic from '@anthropic-ai/sdk';
import type { Bloco } from './docs';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const cliente = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function chamarComFerramenta<T>(o: {
  system: string;
  blocos: Bloco[];
  pedido: string;
  ferramenta: { name: string; description: string; input_schema: Anthropic.Messages.Tool.InputSchema };
}): Promise<T> {
  const stream = cliente().messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system: o.system,
    tools: [o.ferramenta],
    tool_choice: { type: 'tool', name: o.ferramenta.name },
    messages: [{ role: 'user', content: [...o.blocos, { type: 'text', text: o.pedido }] }],
  });
  const msg = await stream.finalMessage();
  const uso = msg.content.find((c) => c.type === 'tool_use');
  if (!uso || uso.type !== 'tool_use') throw new Error('A IA não devolveu a análise estruturada.');
  if (msg.stop_reason === 'max_tokens') throw new Error('Resposta da IA cortada por tamanho. Tente com menos arquivos.');
  return uso.input as T;
}

// ---------- Saídas A e B: análise do edital ----------

export const CATEGORIAS_EXIGENCIA = [
  'juridica',
  'fiscal',
  'trabalhista',
  'economico_financeira',
  'tecnica',
  'declaracao',
  'proposta',
  'outra',
] as const;

export type AnaliseEdital = {
  resumo: {
    orgao: string;
    objeto: string;
    prazo_proposta: string;
    data_sessao: string;
    plataforma: string;
    valor_estimado: string;
    criterio_julgamento: string;
    condicoes_execucao: string;
    beneficio_me_epp: string;
    sinais_complexidade: string[];
    riscos: string[];
    referencias: Record<string, string>;
  };
  exigencias: {
    categoria: (typeof CATEGORIAS_EXIGENCIA)[number];
    descricao: string;
    responsavel: 'contador' | 'empresa' | 'assessoria';
    referencia: string;
    arquivo_origem: string;
    revisao_humana: boolean;
  }[];
  arquivos_nao_lidos_relevantes: string[];
};

const SYSTEM_EDITAL = `Você é um analista sênior de licitações públicas brasileiras (Lei 14.133/2021, LC 123/2006).
Sua tarefa é ler o edital e anexos e extrair, com fidelidade, o que a empresa precisa apresentar para ser habilitada e para propor.
Regras:
- Use somente o que está nos documentos. Se algo não constar, escreva "Não informado no material lido".
- Toda exigência deve trazer a referência: item/cláusula e página (ex.: "item 9.4.2, p. 18 do Edital").
- Uma exigência por linha, específica (ex.: "Certidão Negativa de Débitos Trabalhistas (CNDT) válida na data da sessão", não "certidões").
- Inclua índices contábeis com os valores mínimos exigidos (LG, SG, LC), capital social ou patrimônio líquido mínimo, quantitativos mínimos de atestados e prazos de validade quando o edital fixar.
- responsavel: "contador" para balanço, índices, certidões fiscais/trabalhistas e regularidade; "empresa" para contrato social, procurações, atestados, registros e declarações; "assessoria" para o que você mesmo prepara (proposta, cadastro no portal).
- revisao_humana = true para atestados técnicos, índices/balanço, exigências ambíguas e qualquer item que dependa de interpretação.
- Aponte retificações/erratas que alterem exigências e sinalize riscos (prazos curtos, visita técnica obrigatória, amostras, garantia, mão de obra dedicada).
Escreva em português do Brasil, objetivo.`;

export async function analisarEdital(blocos: Bloco[], contexto: string) {
  return chamarComFerramenta<AnaliseEdital>({
    system: SYSTEM_EDITAL,
    blocos,
    pedido: `${contexto}\n\nAnalise os documentos acima e registre o resumo e TODAS as exigências de habilitação e proposta usando a ferramenta.`,
    ferramenta: {
      name: 'registrar_analise',
      description: 'Registra o resumo do pregão e a lista de exigências extraídas do edital.',
      input_schema: {
        type: 'object',
        required: ['resumo', 'exigencias', 'arquivos_nao_lidos_relevantes'],
        properties: {
          resumo: {
            type: 'object',
            required: [
              'orgao', 'objeto', 'prazo_proposta', 'data_sessao', 'plataforma', 'valor_estimado',
              'criterio_julgamento', 'condicoes_execucao', 'beneficio_me_epp', 'sinais_complexidade', 'riscos', 'referencias',
            ],
            properties: {
              orgao: { type: 'string', description: 'Órgão contratante, cidade/UF' },
              objeto: { type: 'string' },
              prazo_proposta: { type: 'string', description: 'Data e hora limite para envio da proposta' },
              data_sessao: { type: 'string', description: 'Data e hora da sessão pública' },
              plataforma: { type: 'string', description: 'Portal onde a disputa acontece (ex.: Compras.gov.br, BLL, BEC-SP)' },
              valor_estimado: { type: 'string' },
              criterio_julgamento: { type: 'string' },
              condicoes_execucao: { type: 'string', description: 'Prazo, local, vigência, recursos e obrigações principais' },
              beneficio_me_epp: { type: 'string', description: 'Exclusividade, cota reservada ou outro tratamento ME/EPP' },
              sinais_complexidade: { type: 'array', items: { type: 'string' } },
              riscos: { type: 'array', items: { type: 'string' } },
              referencias: {
                type: 'object',
                description: 'Para cada campo acima, a cláusula/página de onde saiu',
                additionalProperties: { type: 'string' },
              },
            },
          },
          exigencias: {
            type: 'array',
            items: {
              type: 'object',
              required: ['categoria', 'descricao', 'responsavel', 'referencia', 'arquivo_origem', 'revisao_humana'],
              properties: {
                categoria: { type: 'string', enum: [...CATEGORIAS_EXIGENCIA] },
                descricao: { type: 'string' },
                responsavel: { type: 'string', enum: ['contador', 'empresa', 'assessoria'] },
                referencia: { type: 'string' },
                arquivo_origem: { type: 'string' },
                revisao_humana: { type: 'boolean' },
              },
            },
          },
          arquivos_nao_lidos_relevantes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Anexos citados no edital que não estavam entre os documentos fornecidos',
          },
        },
      },
    },
  });
}

// ---------- Auditoria documental ----------

export type ResultadoAuditoria = {
  verificacoes: {
    exigencia_numero: number | null;
    arquivo: string | null;
    status: 'ok' | 'faltando' | 'vencido' | 'divergente' | 'ilegivel' | 'revisao_humana';
    titulo: string;
    detalhe: string;
    evidencia: string;
    validade: string | null;
  }[];
  conclusao: string;
};

const SYSTEM_AUDITORIA = `Você confere documentos de habilitação de uma empresa contra as exigências de um edital de licitação.
Seja rigoroso e conservador: na dúvida, use "revisao_humana", nunca "ok".
Para cada exigência numerada, diga se algum arquivo a atende:
- ok: documento presente, legível, da empresa certa (razão social e CNPJ batem) e válido na data da sessão.
- faltando: nenhum arquivo atende.
- vencido: validade termina antes da data da sessão informada.
- divergente: CNPJ/razão social diferente, documento de outra natureza, ou conteúdo não cumpre o exigido (ex.: índice abaixo do mínimo, atestado com quantitativo menor).
- ilegivel: arquivo sem condições de leitura.
- revisao_humana: atestados técnicos, balanço/índices e qualquer caso que dependa de interpretação. Extraia os números (índices, quantitativos) na evidência.
Também reporte arquivos que não correspondem a nenhuma exigência (exigencia_numero = null) e qualquer inconsistência entre documentos.
Em "evidencia" cite o trecho/dado do documento que sustenta a conclusão (número da certidão, data de validade, índice calculado).
Datas no formato AAAA-MM-DD. Português do Brasil.`;

export async function auditarDocumentos(blocos: Bloco[], contexto: string) {
  return chamarComFerramenta<ResultadoAuditoria>({
    system: SYSTEM_AUDITORIA,
    blocos,
    pedido: `${contexto}\n\nConfira os documentos acima contra cada exigência e registre o resultado com a ferramenta.`,
    ferramenta: {
      name: 'registrar_auditoria',
      description: 'Registra o resultado da conferência documental.',
      input_schema: {
        type: 'object',
        required: ['verificacoes', 'conclusao'],
        properties: {
          verificacoes: {
            type: 'array',
            items: {
              type: 'object',
              required: ['exigencia_numero', 'arquivo', 'status', 'titulo', 'detalhe', 'evidencia', 'validade'],
              properties: {
                exigencia_numero: { type: ['integer', 'null'] },
                arquivo: { type: ['string', 'null'] },
                status: { type: 'string', enum: ['ok', 'faltando', 'vencido', 'divergente', 'ilegivel', 'revisao_humana'] },
                titulo: { type: 'string', description: 'Nome curto do item (ex.: Certidão FGTS)' },
                detalhe: { type: 'string' },
                evidencia: { type: 'string' },
                validade: { type: ['string', 'null'], description: 'AAAA-MM-DD quando houver' },
              },
            },
          },
          conclusao: { type: 'string', description: 'Conclusão preliminar em 1 a 3 frases' },
        },
      },
    },
  });
}
