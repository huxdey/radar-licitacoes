import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { brl, dataBR, diasAte } from '@/lib/status';
import { linkPortalPNCP } from '@/lib/pncp';
import { sinaisDeComplexidade } from '@/lib/classify';
import { RadarItem, MarcadorBotao } from '@/components/RadarItem';
import { AcaoBotao } from '@/components/AcaoBotao';
import { FormAcao } from '@/components/FormAcao';
import { adicionarLicitacaoManual, iniciarProcesso, rodarRadarAgora } from '../actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const FILTROS = [
  ['abertas', 'Abertas'],
  ['novas', 'Novas hoje'],
  ['nao_vistas', 'Não visualizadas'],
  ['prioritarias', 'Prioritárias'],
  ['favoritos', 'Salvas'],
  ['ignoradas', 'Ignoradas'],
  ['todas', 'Histórico completo'],
] as const;

export default async function Radar({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const sb = supabaseServer();
  const filtro = searchParams.filtro ?? 'abertas';
  const pagina = Math.max(1, Number(searchParams.p ?? 1));
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  let q = sb.from('tenders').select('*', { count: 'exact' });
  if (filtro !== 'ignoradas') q = q.eq('ignorado', false);
  if (filtro === 'abertas') q = q.or(`data_encerramento_proposta.gte.${new Date().toISOString()},data_encerramento_proposta.is.null`);
  if (filtro === 'novas') q = q.eq('primeira_vez_visto', hoje);
  if (filtro === 'nao_vistas') q = q.eq('visualizado', false);
  if (filtro === 'prioritarias') q = q.eq('prioritaria', true).or(`data_encerramento_proposta.gte.${new Date().toISOString()},data_encerramento_proposta.is.null`);
  if (filtro === 'favoritos') q = q.eq('favorito', true);
  if (filtro === 'ignoradas') q = q.eq('ignorado', true);
  if (searchParams.segmento) q = q.contains('categorias', [searchParams.segmento]);
  if (searchParams.uf) q = q.eq('uf', searchParams.uf.toUpperCase());
  if (searchParams.busca) q = q.ilike('objeto', `%${searchParams.busca}%`);
  if (searchParams.meepp) q = q.eq('me_epp_indicio', true);
  q = q.order('prioritaria', { ascending: false }).order('data_encerramento_proposta', { ascending: true, nullsFirst: false }).range((pagina - 1) * 30, pagina * 30 - 1);

  const [{ data: lic, count }, { data: cats }, { data: empresas }, { data: casos }] = await Promise.all([
    q,
    sb.from('search_categories').select('id,nome').order('nome'),
    sb.from('companies').select('id,razao_social,nome_fantasia,segmentos').order('razao_social'),
    sb.from('cases').select('id,tender_id,company:companies(nome_fantasia,razao_social)'),
  ]);
  const nomeCat = new Map((cats ?? []).map((c) => [c.id, c.nome]));
  const casosPorLic = new Map<string, any[]>();
  (casos ?? []).forEach((c: any) => casosPorLic.set(c.tender_id, [...(casosPorLic.get(c.tender_id) ?? []), c]));
  const link = (p: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(Object.entries({ ...searchParams, ...p }).filter(([, v]) => v) as [string, string][]);
    return `/radar?${qs}`;
  };
  const totalPaginas = Math.max(1, Math.ceil((count ?? 0) / 30));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Radar</h1>
          <p className="text-sm text-black/60">{count ?? 0} oportunidade(s) neste filtro</p>
        </div>
        <AcaoBotao acao={rodarRadarAgora.bind(null, 'diario')} classe="btn-primario" processando="Buscando no PNCP...">
          Atualizar radar agora
        </AcaoBotao>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map(([id, r]) => (
          <Link key={id} href={link({ filtro: id, p: undefined })} className={`chip px-3 py-1 text-sm ${filtro === id ? 'bg-tinta text-white' : 'bg-white border border-black/10'}`}>
            {r}
          </Link>
        ))}
      </div>

      <form className="card grid gap-2 sm:grid-cols-5" action="/radar">
        <input type="hidden" name="filtro" value={filtro} />
        <input name="busca" defaultValue={searchParams.busca} placeholder="Buscar no objeto..." className="input sm:col-span-2" />
        <select name="segmento" defaultValue={searchParams.segmento ?? ''} className="input">
          <option value="">Todos os segmentos</option>
          {cats?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <input name="uf" defaultValue={searchParams.uf} placeholder="UF" maxLength={2} className="input" />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="meepp" value="1" defaultChecked={!!searchParams.meepp} /> ME/EPP</label>
          <button className="btn-secundario ml-auto">Filtrar</button>
        </div>
      </form>

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">+ Adicionar licitação manualmente</summary>
        <FormAcao acao={adicionarLicitacaoManual} botao="Adicionar" processando="Consultando..." limpar className="mt-3 space-y-3">
          <div>
            <label className="label">Link ou número de controle do PNCP</label>
            <input name="identificador" className="input" placeholder="ex.: 46395000000139-1-000123/2026 ou https://pncp.gov.br/app/editais/..." />
          </div>
          <p className="text-xs text-black/50">Fora do PNCP? Deixe o campo acima com o link do portal e preencha:</p>
          <div className="grid gap-2 sm:grid-cols-4">
            <input name="objeto" className="input sm:col-span-2" placeholder="Objeto" />
            <input name="orgao" className="input" placeholder="Órgão" />
            <input name="numero" className="input" placeholder="Nº do pregão" />
          </div>
          <div className="max-w-xs">
            <label className="label">Prazo da proposta</label>
            <input name="prazo" type="datetime-local" className="input" />
          </div>
        </FormAcao>
      </details>

      <div className="space-y-3">
        {!lic?.length && <div className="card text-sm text-black/50">Nenhuma oportunidade neste filtro.</div>}
        {lic?.map((t) => {
          const dias = diasAte(t.data_encerramento_proposta);
          const vinculos = casosPorLic.get(t.id) ?? [];
          const sinais = sinaisDeComplexidade(`${t.objeto ?? ''} ${t.informacao_complementar ?? ''}`);
          const portal = linkPortalPNCP(t.orgao_cnpj, t.ano_compra, t.sequencial_compra);
          const sugeridas = (empresas ?? []).filter((e) => (e.segmentos as string[]).some((s) => (t.categorias as string[]).includes(s)));
          return (
            <RadarItem
              key={t.id}
              id={t.id}
              visto={t.visualizado}
              abrir={searchParams.abrir === t.id}
              resumo={
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {!t.visualizado && <span className="chip bg-sky-600 text-white">novo</span>}
                    {t.prioritaria && <span className="chip bg-tinta text-white">prioritária</span>}
                    {t.favorito && <span className="chip bg-amber-100 text-amber-800">salva</span>}
                    {t.me_epp_indicio && <span className="chip bg-emerald-100 text-emerald-800">indício ME/EPP</span>}
                    {vinculos.length > 0 && <span className="chip bg-violet-100 text-violet-800">em processo</span>}
                    {(t.categorias as string[]).map((c) => <span key={c} className="chip bg-black/5">{nomeCat.get(c)}</span>)}
                    <span className="text-black/50">{t.modalidade_nome} · {t.municipio}/{t.uf}</span>
                  </div>
                  <div className={`mt-1 line-clamp-2 text-sm ${t.visualizado ? '' : 'font-semibold'}`}>{t.objeto}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-black/60">
                    <span>{brl(t.valor_estimado)}</span>
                    <span>Encerra: {dataBR(t.data_encerramento_proposta, true)}{dias !== null && dias >= 0 ? ` (${dias}d)` : ''}</span>
                    <span>{t.orgao_nome}</span>
                  </div>
                </div>
              }
            >
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="label">Órgão / unidade</dt><dd>{t.orgao_nome} · {t.unidade_nome}</dd></div>
                <div><dt className="label">Número / processo</dt><dd>{t.numero_compra} · {t.processo}</dd></div>
                <div><dt className="label">Abertura das propostas</dt><dd>{dataBR(t.data_abertura_proposta, true)}</dd></div>
                <div><dt className="label">Situação (PNCP)</dt><dd>{t.situacao_nome ?? 'Não informado'} <span className="text-xs text-black/40">conferido em {dataBR(t.ultima_conferencia_fonte, true)}</span></dd></div>
                <div className="sm:col-span-2"><dt className="label">Objeto completo</dt><dd className="whitespace-pre-line">{t.objeto}</dd></div>
                {t.informacao_complementar && <div className="sm:col-span-2"><dt className="label">Informação complementar</dt><dd className="whitespace-pre-line text-black/70">{t.informacao_complementar}</dd></div>}
                {sinais.length > 0 && (
                  <div className="sm:col-span-2"><dt className="label">Sinais de complexidade</dt><dd className="flex flex-wrap gap-1">{sinais.map((s) => <span key={s} className="chip bg-orange-100 text-orange-800">{s}</span>)}</dd></div>
                )}
              </dl>

              {vinculos.length > 0 && (
                <div className="mt-3 text-sm">
                  Processos: {vinculos.map((v) => <Link key={v.id} href={`/pregoes/${v.id}`} className="mr-2 underline">{v.company?.nome_fantasia || v.company?.razao_social}</Link>)}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-end gap-2">
                <form action={iniciarProcesso} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="tender_id" value={t.id} />
                  <div>
                    <label className="label">Tenho interesse - empresa</label>
                    <select name="company_id" className="input" required defaultValue={sugeridas[0]?.id ?? ''}>
                      <option value="" disabled>Escolha a empresa</option>
                      {empresas?.map((e) => <option key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</option>)}
                    </select>
                  </div>
                  <button className="btn-primario" disabled={!empresas?.length}>Iniciar processo</button>
                </form>
                <MarcadorBotao id={t.id} campo="favorito" valor={!t.favorito}>{t.favorito ? 'Remover dos salvos' : 'Salvar para depois'}</MarcadorBotao>
                <MarcadorBotao id={t.id} campo="ignorado" valor={!t.ignorado} classe="btn-perigo">{t.ignorado ? 'Restaurar' : 'Ignorar'}</MarcadorBotao>
                {portal && <a href={portal} target="_blank" rel="noreferrer" className="btn-secundario">Abrir no PNCP</a>}
                {t.link_sistema_origem && <a href={t.link_sistema_origem} target="_blank" rel="noreferrer" className="btn-secundario">Portal da disputa</a>}
              </div>
              {!empresas?.length && <p className="mt-2 text-xs text-alerta">Cadastre uma empresa em Empresas para iniciar processos.</p>}
            </RadarItem>
          );
        })}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {pagina > 1 && <Link className="btn-secundario" href={link({ p: String(pagina - 1) })}>Anterior</Link>}
          <span>Página {pagina} de {totalPaginas}</span>
          {pagina < totalPaginas && <Link className="btn-secundario" href={link({ p: String(pagina + 1) })}>Próxima</Link>}
        </div>
      )}
    </div>
  );
}
