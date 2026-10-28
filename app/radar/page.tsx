import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { dataBR } from '@/lib/status';
import { linkPortalPNCP } from '@/lib/pncp';
import { sinaisDeComplexidade } from '@/lib/classify';
import { RadarItem, MarcadorBotao } from '@/components/RadarItem';
import { FormAcao } from '@/components/FormAcao';
import { LinhaLicitacao } from '@/components/LinhaLicitacao';
import { adicionarLicitacaoManual, iniciarProcesso } from '../actions';
import { BuscaForm } from '@/components/BuscaForm';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const FILTROS = [
  ['abertas', 'Abertas'],
  ['nao_vistas', 'Não abertas ainda'],
  ['favoritos', 'Salvas'],
  ['ignoradas', 'Ignoradas'],
] as const;

export default async function Radar({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const sb = supabaseServer();
  const filtro = searchParams.filtro ?? 'abertas';
  const pagina = Math.max(1, Number(searchParams.p ?? 1));
  const agora = new Date().toISOString();
  const lista = (v?: string) => (v ? v.split(',').filter(Boolean) : []);
  const segs = lista(searchParams.segs);
  const ufs = lista(searchParams.ufs).map((u) => u.toUpperCase());
  const dias = [7, 15, 30, 60].includes(Number(searchParams.dias)) ? Number(searchParams.dias) : 30;
  const mods = lista(searchParams.mods).map(Number).filter(Boolean);
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const temBusca = segs.length > 0 && ufs.length > 0;

  const { data: cats } = await sb.from('search_categories').select('id,nome,ativo').order('nome');
  const nomeCat = new Map((cats ?? []).map((c) => [c.id, c.nome]));
  const abertoOu = `data_encerramento_proposta.gte.${agora},data_encerramento_proposta.is.null`;

  let lic: any[] | null = [];
  let count: number | null = 0;
  if (temBusca) {
    let q = sb.from('tenders').select('*', { count: 'exact' }).overlaps('categorias', segs).in('uf', ufs).gte('data_publicacao', desde);
    if (mods.length) q = q.in('modalidade_id', mods);
    if (filtro !== 'ignoradas') q = q.eq('ignorado', false);
    if (filtro === 'abertas' || filtro === 'nao_vistas') q = q.or(abertoOu);
    if (filtro === 'nao_vistas') q = q.eq('visualizado', false);
    if (filtro === 'favoritos') q = q.eq('favorito', true);
    if (filtro === 'ignoradas') q = q.eq('ignorado', true);
    if (searchParams.busca) q = q.ilike('objeto', `%${searchParams.busca}%`);
    if (searchParams.meepp) q = q.eq('me_epp_indicio', true);
    const r = await q.order('data_encerramento_proposta', { ascending: true, nullsFirst: false }).range((pagina - 1) * 30, pagina * 30 - 1);
    lic = r.data;
    count = r.count;
  }
  // veio do Painel (clicou numa licitação): mostra ela direto, aberta
  const vindoDoPainel = !temBusca && !!searchParams.abrir;
  if (vindoDoPainel) {
    const { data } = await sb.from('tenders').select('*').eq('id', searchParams.abrir!).limit(1);
    lic = data;
    count = data?.length ?? 0;
  }

  const [{ data: empresas }, { data: casos }] = await Promise.all([
    sb.from('companies').select('id,razao_social,nome_fantasia,segmentos').order('razao_social'),
    sb.from('cases').select('id,tender_id,company:companies(nome_fantasia,razao_social)'),
  ]);
  const casosPorLic = new Map<string, any[]>();
  (casos ?? []).forEach((c: any) => casosPorLic.set(c.tender_id, [...(casosPorLic.get(c.tender_id) ?? []), c]));
  const link = (p: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(Object.entries({ ...searchParams, ...p }).filter(([, v]) => v) as [string, string][]);
    return `/radar?${qs}`;
  };
  const totalPaginas = Math.max(1, Math.ceil((count ?? 0) / 30));
  const descricao = temBusca
    ? `${segs.map((s) => nomeCat.get(s)).join(', ')} em ${ufs.join(', ')}, publicadas nos últimos ${dias} dias`
    : '';

  return (
    <div className="space-y-6">
      <div>
        {vindoDoPainel && <Link href="/" className="mb-2 inline-block text-sm font-semibold text-selo hover:underline">Voltar ao painel</Link>}
        <h1>{vindoDoPainel ? 'Licitação' : 'Buscar licitações'}</h1>
        <p className="mt-1 text-nevoa">Escolha o segmento, o estado e o período. O sistema busca só isso no governo.</p>
      </div>

{!vindoDoPainel && (
      <BuscaForm segmentos={(cats ?? []).map((c) => ({ id: c.id, nome: c.nome }))} inicial={{ segs, ufs, dias, mods: mods.length ? mods : [6] }} />
      )}

      {temBusca && (
        <>
          <div>
            <h2 className="text-2xl">{count ?? 0} {count === 1 ? 'licitação' : 'licitações'}</h2>
            <p className="text-nevoa">{descricao}. Ordenadas pelo prazo que acaba primeiro.</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-linha pb-3">
            {FILTROS.map(([id, r]) => (
              <Link
                key={id}
                href={link({ filtro: id, p: undefined })}
                className={`-mb-[13px] border-b-2 pb-3 text-sm font-semibold ${filtro === id ? 'border-selo text-tinta' : 'border-transparent text-nevoa hover:text-tinta'}`}
              >
                {r}
              </Link>
            ))}
            <form action="/radar" className="ml-auto flex items-center gap-2">
              {['segs', 'ufs', 'dias', 'mods', 'filtro'].map((k) => searchParams[k] && <input key={k} type="hidden" name={k} value={searchParams[k]} />)}
              <input name="busca" defaultValue={searchParams.busca} placeholder="Procurar palavra" className="input w-44 py-2" aria-label="Procurar palavra no objeto" />
              <label className="flex items-center gap-1.5 text-sm text-nevoa">
                <input type="checkbox" name="meepp" value="1" defaultChecked={!!searchParams.meepp} /> ME/EPP
              </label>
              <button className="btn-secundario py-2">Filtrar</button>
            </form>
          </div>
        </>
      )}

      <div className="space-y-3">
        {(temBusca || vindoDoPainel) && !lic?.length && (
          <div className="card text-center text-nevoa">
            Nenhuma licitação aberta com esses filtros. Se você acabou de escolher um estado novo, clique em Buscar.
          </div>
        )}
        {lic?.map((t) => {
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
                <LinhaLicitacao
                  t={t}
                  segmento={segs.length > 1 ? nomeCat.get(t.categorias[0]) : undefined}
                  destaque={vinculos.length > 0 ? <span className="chip bg-violet-100 text-violet-800">em processo</span> : t.favorito ? <span className="chip bg-ambar/15 text-ambar">salva</span> : null}
                />
              }
            >
              <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                <div><dt className="label">Órgão</dt><dd>{t.orgao_nome}{t.unidade_nome && <span className="text-nevoa"> ({t.unidade_nome})</span>}</dd></div>
                <div><dt className="label">Modalidade e número</dt><dd>{t.modalidade_nome} {t.numero_compra}</dd></div>
                <div><dt className="label">Propostas</dt><dd>de {dataBR(t.data_abertura_proposta, true)} até {dataBR(t.data_encerramento_proposta, true)}</dd></div>
                <div><dt className="label">Situação no governo</dt><dd>{t.situacao_nome ?? 'Não informado'} <span className="text-xs text-nevoa">(conferido {dataBR(t.ultima_conferencia_fonte, true)})</span></dd></div>
                <div className="sm:col-span-2"><dt className="label">Objeto completo</dt><dd className="whitespace-pre-line leading-relaxed">{t.objeto}</dd></div>
                {t.informacao_complementar && <div className="sm:col-span-2"><dt className="label">Informação complementar</dt><dd className="whitespace-pre-line text-nevoa">{t.informacao_complementar}</dd></div>}
                {sinais.length > 0 && (
                  <div className="sm:col-span-2"><dt className="label">Pode exigir atenção</dt><dd className="flex flex-wrap gap-1.5">{sinais.map((s) => <span key={s} className="chip bg-ambar/15 text-tinta">{s}</span>)}</dd></div>
                )}
              </dl>

              {vinculos.length > 0 && (
                <p className="mt-4 text-sm">
                  Já em processo com:{' '}
                  {vinculos.map((v) => <Link key={v.id} href={`/pregoes/${v.id}`} className="mr-2 font-semibold text-selo underline">{v.company?.nome_fantasia || v.company?.razao_social}</Link>)}
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-linha pt-4">
                <form action={iniciarProcesso} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="tender_id" value={t.id} />
                  <div>
                    <label className="label" htmlFor={`emp-${t.id}`}>Empresa que vai participar</label>
                    <select id={`emp-${t.id}`} name="company_id" className="input py-2" required defaultValue={sugeridas[0]?.id ?? ''}>
                      <option value="" disabled>Escolha</option>
                      {empresas?.map((e) => <option key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</option>)}
                    </select>
                  </div>
                  <button className="btn bg-selo text-white hover:bg-selo/90" disabled={!empresas?.length}>Tenho interesse</button>
                </form>
                <MarcadorBotao id={t.id} campo="favorito" valor={!t.favorito}>{t.favorito ? 'Tirar dos salvos' : 'Salvar'}</MarcadorBotao>
                <MarcadorBotao id={t.id} campo="ignorado" valor={!t.ignorado} classe="btn-perigo">{t.ignorado ? 'Restaurar' : 'Ignorar'}</MarcadorBotao>
                {portal && <a href={portal} target="_blank" rel="noreferrer" className="btn-secundario">Ver no PNCP</a>}
                {t.link_sistema_origem && <a href={t.link_sistema_origem} target="_blank" rel="noreferrer" className="btn-secundario">Portal da disputa</a>}
              </div>
              {!empresas?.length && <p className="mt-2 text-sm text-alerta">Cadastre uma empresa em Empresas para poder participar.</p>}
            </RadarItem>
          );
        })}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {pagina > 1 && <Link className="btn-secundario" href={link({ p: String(pagina - 1) })}>Anteriores</Link>}
          <span className="text-nevoa">Página {pagina} de {totalPaginas}</span>
          {pagina < totalPaginas && <Link className="btn-secundario" href={link({ p: String(pagina + 1) })}>Próximas</Link>}
        </div>
      )}

      <details className="card">
        <summary className="cursor-pointer font-semibold">Adicionar uma licitação que não apareceu</summary>
        <FormAcao acao={adicionarLicitacaoManual} botao="Adicionar" processando="Consultando..." limpar className="mt-4 space-y-3">
          <div>
            <label className="label">Link ou número de controle do PNCP</label>
            <input name="identificador" className="input" placeholder="https://pncp.gov.br/app/editais/..." />
          </div>
          <p className="text-sm text-nevoa">Se ela não está no PNCP, cole o link do portal acima e preencha:</p>
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
    </div>
  );
}
