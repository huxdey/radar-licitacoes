import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { STATUS_CHECK, brl, dataBR, diasAte, statusInfo } from '@/lib/status';
import { linkPortalPNCP } from '@/lib/pncp';
import { listaCorrecoes } from '@/lib/processos';
import { AcaoBotao } from '@/components/AcaoBotao';
import { FormAcao } from '@/components/FormAcao';
import { CopiarBotao } from '@/components/CopiarBotao';
import { BaixarTexto } from '@/components/BaixarTexto';
import { StatusSelect } from '@/components/StatusSelect';
import {
  analisarEditalAcao, auditarAcao, baixarDocumentacaoAcao, enviarArquivosEdital, enviarDocumentosEmpresa,
  marcarDocumentacaoSolicitada, salvarDadosProcesso, validarItem,
} from '../../actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // análise e auditoria com IA podem levar alguns minutos

const ROTULO_CAT: Record<string, string> = {
  juridica: 'Habilitação jurídica', fiscal: 'Regularidade fiscal', trabalhista: 'Regularidade trabalhista',
  economico_financeira: 'Econômico-financeira', tecnica: 'Qualificação técnica', declaracao: 'Declarações',
  proposta: 'Proposta', outra: 'Outros',
};
const CAMPOS_RESUMO: [string, string][] = [
  ['orgao', 'Órgão contratante'], ['objeto', 'Objeto'], ['prazo_proposta', 'Prazo da proposta'], ['data_sessao', 'Sessão pública'],
  ['plataforma', 'Plataforma'], ['valor_estimado', 'Valor estimado'], ['criterio_julgamento', 'Critério'],
  ['condicoes_execucao', 'Condições de execução'], ['beneficio_me_epp', 'Benefício ME/EPP'],
];

const Secao = ({ n, titulo, children, acoes }: { n: string; titulo: string; children: React.ReactNode; acoes?: React.ReactNode }) => (
  <section className="card">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <h2><span className="mr-2 text-black/30">{n}</span>{titulo}</h2>
      <div className="flex flex-wrap gap-2">{acoes}</div>
    </div>
    {children}
  </section>
);

export default async function Processo({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data: caso } = await sb.from('cases').select('*, tender:tenders(*), company:companies(*)').eq('id', params.id).maybeSingle();
  if (!caso) notFound();
  const t = caso.tender as any;

  const [{ data: arquivos }, { data: reqs }, { data: docs }, { data: checks }, { data: logs }] = await Promise.all([
    sb.from('tender_files').select('*').eq('tender_id', t.id).order('sequencial'),
    sb.from('requirements').select('*').eq('case_id', caso.id).order('ordem'),
    sb.from('company_documents').select('*').eq('case_id', caso.id).order('created_at', { ascending: false }),
    sb.from('document_checks').select('*').eq('case_id', caso.id).order('created_at', { ascending: false }),
    sb.from('activity_logs').select('*, user:users(nome)').eq('entidade_id', caso.id).order('created_at', { ascending: false }).limit(30),
  ]);

  const ultimoRun = checks?.[0]?.run_id;
  const run = (checks ?? []).filter((c) => c.run_id === ultimoRun);
  const conta = (s: string) => run.filter((c) => c.status === s).length;
  const pendentes = run.filter((c) => !['ok', 'revisao_humana'].includes(c.status)).length;
  const resumo = caso.resumo as any;
  const dias = diasAte(t.data_encerramento_proposta);
  const portal = linkPortalPNCP(t.orgao_cnpj, t.ano_compra, t.sequencial_compra);
  const ativos = (docs ?? []).filter((d) => d.ativo);
  const antigos = (docs ?? []).filter((d) => !d.ativo);
  const viab = (caso.viabilidade as Record<string, string>) ?? {};
  const s = statusInfo(caso.status);

  return (
    <div className="space-y-5">
      <Link href="/pregoes" className="text-sm underline">← Meus Pregões</Link>

      {/* Cabeçalho */}
      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <div className="text-xs uppercase tracking-wide text-black/50">{t.modalidade_nome} {t.numero_compra} · {t.orgao_nome}</div>
            <h1 className="mt-1 text-xl">{t.objeto}</h1>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-black/70">
              <span>Empresa: <b>{caso.company.nome_fantasia || caso.company.razao_social}</b></span>
              <span>Valor: {brl(t.valor_estimado)}</span>
              <span>Local: {t.municipio}/{t.uf}</span>
              <span className={dias !== null && dias <= 3 ? 'font-semibold text-alerta' : ''}>
                Encerra: {dataBR(t.data_encerramento_proposta, true)}{dias !== null ? ` (${dias < 0 ? 'encerrado' : `${dias}d`})` : ''}
              </span>
            </div>
            <div className="mt-1 text-xs text-black/40">Situação no PNCP: {t.situacao_nome ?? 'não informado'} · última conferência na fonte {dataBR(t.ultima_conferencia_fonte, true)}</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`chip ${s.cor}`}>{s.rotulo}</span>
            <StatusSelect caseId={caso.id} atual={caso.status} />
            <div className="flex gap-2">
              {portal && <a href={portal} target="_blank" rel="noreferrer" className="btn-secundario">PNCP</a>}
              {t.link_sistema_origem && <a href={t.link_sistema_origem} target="_blank" rel="noreferrer" className="btn-secundario">Portal da disputa</a>}
            </div>
          </div>
        </div>
        {caso.aprovado_em && <p className="mt-3 text-sm text-selo">Aprovado internamente para envio em {dataBR(caso.aprovado_em, true)}.</p>}
      </section>

      {/* 01 Edital */}
      <Secao
        n="01"
        titulo="Edital e anexos"
        acoes={
          <>
            <AcaoBotao acao={baixarDocumentacaoAcao.bind(null, caso.id)} classe="btn-primario" processando="Baixando do PNCP...">Baixar documentação</AcaoBotao>
            {!!arquivos?.some((a) => a.storage_path) && <a href={`/api/edital-zip/${t.id}`} className="btn-secundario">Baixar ZIP</a>}
          </>
        }
      >
        {!arquivos?.length && <p className="text-sm text-black/50">Nenhum arquivo ainda. Clique em "Baixar documentação".</p>}
        <ul className="divide-y divide-black/5 text-sm">
          {arquivos?.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 flex-1 truncate">{a.titulo} {a.tipo && <span className="text-black/40">· {a.tipo}</span>}</span>
              {a.status === 'falhou' ? (
                <span className="flex items-center gap-2">
                  <span className="chip bg-red-100 text-red-700">não baixado</span>
                  {a.url_origem && <a href={a.url_origem} target="_blank" rel="noreferrer" className="underline">baixar manualmente</a>}
                </span>
              ) : a.storage_path ? (
                <a href={`/api/arquivo?path=${encodeURIComponent(a.storage_path)}`} target="_blank" className="underline">abrir</a>
              ) : null}
            </li>
          ))}
        </ul>
        {!!arquivos?.some((a) => a.status === 'falhou') && (
          <p className="mt-2 text-sm text-alerta">Atenção: há anexos que não foram baixados. A análise só considera o que está aqui.</p>
        )}
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-black/60">Enviar arquivos do edital manualmente (portal do órgão, e-mail etc.)</summary>
          <FormAcao acao={enviarArquivosEdital} botao="Anexar ao edital" processando="Enviando..." limpar className="mt-2 space-y-2">
            <input type="hidden" name="case_id" value={caso.id} />
            <input type="hidden" name="tender_id" value={t.id} />
            <input type="file" name="arquivos" multiple className="text-sm" />
          </FormAcao>
        </details>
      </Secao>

      {/* 02 Análise */}
      <Secao
        n="02"
        titulo="Exigências identificadas"
        acoes={
          <AcaoBotao acao={analisarEditalAcao.bind(null, caso.id)} classe="btn-primario" processando="A IA está lendo o edital (1-3 min)..." confirmar={reqs?.length ? 'Refazer a análise substitui as exigências atuais. Continuar?' : undefined}>
            {reqs?.length ? 'Refazer análise' : 'Analisar edital com IA'}
          </AcaoBotao>
        }
      >
        {!resumo && <p className="text-sm text-black/50">Baixe a documentação e rode a análise para ver o resumo e o checklist.</p>}
        {resumo && (
          <div className="space-y-4">
            <p className="text-xs text-black/40">Analisado em {dataBR(caso.analise_em, true)}. Toda exigência traz a cláusula de origem: confira no edital antes de decidir.</p>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {CAMPOS_RESUMO.map(([k, r]) => (
                <div key={k}>
                  <dt className="label">{r}</dt>
                  <dd>{resumo[k] || 'Não informado'}{resumo.referencias?.[k] && <span className="ml-1 text-xs text-black/40">({resumo.referencias[k]})</span>}</dd>
                </div>
              ))}
            </dl>
            {(resumo.sinais_complexidade?.length > 0 || resumo.riscos?.length > 0) && (
              <div className="rounded-lg bg-orange-50 p-3 text-sm">
                <div className="mb-1 font-semibold text-orange-900">Atenção</div>
                <ul className="list-disc pl-5">
                  {[...(resumo.sinais_complexidade ?? []), ...(resumo.riscos ?? [])].map((x: string, i: number) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            )}
            {(resumo.arquivos_nao_lidos?.length > 0 || resumo.anexos_citados_ausentes?.length > 0) && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
                <div className="mb-1 font-semibold">Material que a IA não leu</div>
                <ul className="list-disc pl-5">
                  {resumo.arquivos_nao_lidos?.map((a: any) => <li key={a.nome}>{a.nome}: {a.motivo}</li>)}
                  {resumo.anexos_citados_ausentes?.map((a: string) => <li key={a}>Citado no edital, mas não encontrado: {a}</li>)}
                </ul>
              </div>
            )}
            {Object.entries(
              (reqs ?? []).reduce<Record<string, any[]>>((acc, r) => ((acc[r.categoria] = [...(acc[r.categoria] ?? []), r]), acc), {}),
            ).map(([cat, itens]) => (
              <div key={cat}>
                <div className="label">{ROTULO_CAT[cat] ?? cat}</div>
                <ul className="space-y-1 text-sm">
                  {itens.map((r) => (
                    <li key={r.id} className="flex gap-2">
                      <span className="chip h-fit bg-black/5">{r.responsavel}</span>
                      <span>
                        {r.descricao} <span className="text-xs text-black/40">{r.referencia}</span>
                        {r.revisao_humana && <span className="chip ml-1 bg-amber-100 text-amber-800">revisão humana</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Secao>

      {/* Solicitação */}
      {caso.solicitacao_texto && (
        <Secao
          n="→"
          titulo="Solicitação para contador e empresa"
          acoes={
            <>
              <CopiarBotao texto={caso.solicitacao_texto} rotulo="Copiar para WhatsApp" />
              <BaixarTexto texto={caso.solicitacao_texto} nome={`solicitacao-${t.numero_compra ?? caso.id}.txt`} />
              {['separado', 'em_analise'].includes(caso.status) && (
                <AcaoBotao acao={marcarDocumentacaoSolicitada.bind(null, caso.id)}>Marcar como solicitada</AcaoBotao>
              )}
            </>
          }
        >
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-black/[0.03] p-3 text-sm">{caso.solicitacao_texto}</pre>
        </Secao>
      )}

      {/* 03 Documentos */}
      <Secao n="03" titulo={`Documentos da empresa (${ativos.length})`}>
        <FormAcao acao={enviarDocumentosEmpresa} botao="Enviar documentos" processando="Enviando..." limpar className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="case_id" value={caso.id} />
          <input type="file" name="arquivos" multiple className="text-sm" />
          <span className="text-xs text-black/50">PDF, Word, Excel, imagens ou um ZIP com tudo. Arquivo com o mesmo nome vira nova versão.</span>
        </FormAcao>
        <ul className="mt-3 divide-y divide-black/5 text-sm">
          {ativos.map((d) => (
            <li key={d.id} className="flex justify-between gap-2 py-1.5">
              <a href={`/api/arquivo?path=${encodeURIComponent(d.storage_path)}`} target="_blank" className="truncate underline">{d.nome_arquivo}</a>
              <span className="whitespace-nowrap text-xs text-black/40">v{d.versao} · {dataBR(d.created_at, true)}</span>
            </li>
          ))}
        </ul>
        {antigos.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-black/50">Versões anteriores ({antigos.length})</summary>
            <ul className="mt-1">
              {antigos.map((d) => (
                <li key={d.id} className="text-black/50">
                  <a href={`/api/arquivo?path=${encodeURIComponent(d.storage_path)}`} target="_blank" className="underline">{d.nome_arquivo}</a> v{d.versao} · {dataBR(d.created_at, true)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Secao>

      {/* 04 Auditoria */}
      <Secao
        n="04"
        titulo="Auditoria e pendências"
        acoes={
          <>
            <AcaoBotao acao={auditarAcao.bind(null, caso.id)} classe="btn-primario" processando="Conferindo documentos (1-3 min)...">
              {ultimoRun ? 'Rodar nova auditoria' : 'Auditar documentos'}
            </AcaoBotao>
            {pendentes > 0 && <CopiarBotao texto={listaCorrecoes(caso, run)} rotulo="Copiar lista de correções" />}
          </>
        }
      >
        {!ultimoRun && <p className="text-sm text-black/50">Envie os documentos e rode a auditoria.</p>}
        {ultimoRun && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Conferidos', conta('ok'), 'text-selo'],
                ['Revisar', conta('revisao_humana'), 'text-ambar'],
                ['Pendentes', conta('faltando') + conta('vencido') + conta('ilegivel'), 'text-alerta'],
                ['Divergentes', conta('divergente'), 'text-alerta'],
              ].map(([r, n, cor]) => (
                <div key={r as string} className="rounded-lg bg-black/[0.03] p-3">
                  <div className={`text-2xl font-bold ${cor}`}>{n}</div>
                  <div className="text-xs uppercase text-black/50">{r}</div>
                </div>
              ))}
            </div>
            <p className={`mb-3 text-sm font-medium ${caso.status === 'pronto_revisao_final' ? 'text-selo' : 'text-alerta'}`}>
              {caso.status === 'pronto_revisao_final'
                ? 'Conclusão preliminar: pronto para revisão final. Não é garantia de habilitação.'
                : pendentes > 0
                  ? 'Conclusão preliminar: existem pendências.'
                  : 'Conclusão preliminar: há itens aguardando sua validação.'}
            </p>
            <ul className="divide-y divide-black/5 text-sm">
              {run
                .sort((a, b) => ['faltando', 'vencido', 'divergente', 'ilegivel', 'revisao_humana', 'ok'].indexOf(a.status) - ['faltando', 'vencido', 'divergente', 'ilegivel', 'revisao_humana', 'ok'].indexOf(b.status))
                .map((c) => (
                  <li key={c.id} className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`chip ${STATUS_CHECK[c.status]?.cor}`}>{STATUS_CHECK[c.status]?.rotulo}</span>
                      <span className="font-medium">{c.titulo}</span>
                      {c.validade && <span className="text-xs text-black/50">validade {dataBR(c.validade + 'T12:00:00')}</span>}
                    </div>
                    {c.detalhe && <p className="mt-1 text-black/70">{c.detalhe}</p>}
                    {c.evidencia && <p className="mt-1 text-xs text-black/50">Evidência: {c.evidencia}</p>}
                    {c.status === 'revisao_humana' && (
                      <div className="mt-2 flex gap-2">
                        <AcaoBotao acao={validarItem.bind(null, c.id, caso.id, true)}>Validei, está ok</AcaoBotao>
                        <AcaoBotao acao={validarItem.bind(null, c.id, caso.id, false)} classe="btn-perigo">Não atende</AcaoBotao>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </>
        )}
      </Secao>

      {/* 05 Viabilidade e dados */}
      <Secao n="05" titulo="Viabilidade, prazo interno e observações">
        <FormAcao acao={salvarDadosProcesso}>
          <input type="hidden" name="case_id" value={caso.id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label">Prazo interno (documentos)</label><input type="date" name="prazo_interno" defaultValue={caso.prazo_interno ?? ''} className="input" /></div>
            <div><label className="label">Custo estimado</label><input name="custo_estimado" defaultValue={viab.custo_estimado ?? ''} className="input" /></div>
            <div><label className="label">Preço mínimo aprovado</label><input name="preco_minimo" defaultValue={viab.preco_minimo ?? ''} className="input" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Capacidade de execução</label><textarea name="capacidade" rows={3} defaultValue={viab.capacidade ?? ''} className="input" /></div>
            <div><label className="label">Riscos</label><textarea name="riscos" rows={3} defaultValue={viab.riscos ?? ''} className="input" /></div>
          </div>
          <div><label className="label">Observações e resultado</label><textarea name="observacoes" rows={3} defaultValue={caso.observacoes ?? ''} className="input" /></div>
        </FormAcao>
      </Secao>

      {/* 06 Histórico */}
      <Secao n="06" titulo="Histórico">
        <ul className="space-y-1 text-xs text-black/60">
          {logs?.map((l: any) => (
            <li key={l.id}>
              {dataBR(l.created_at, true)} · {l.user?.nome ?? 'sistema'} · {l.acao.replace(/_/g, ' ')}
              {l.detalhe?.status && ` → ${statusInfo(l.detalhe.status).rotulo}`}
            </li>
          ))}
        </ul>
      </Secao>
    </div>
  );
}
