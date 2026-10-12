import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { dataBR } from '@/lib/status';
import { linkPortalPNCP } from '@/lib/pncp';
import { sinaisDeComplexidade } from '@/lib/classify';
import { RadarItem, MarcadorBotao } from '@/components/RadarItem';
import { AcaoBotao } from '@/components/AcaoBotao';
import { FormAcao } from '@/components/FormAcao';
import { LinhaLicitacao } from '@/components/LinhaLicitacao';
import { adicionarLicitacaoManual, iniciarProcesso, rodarRadarAgora } from '../actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const FILTROS = [
  ['abertas', 'Abertas'],
  ['nao_vistas', 'Não abertas ainda'],
  ['prioritarias', 'Prioritárias'],
  ['favoritos', 'Salvas'],
  ['ignoradas', 'Ignoradas'],
  ['todas', 'Histórico'],
] as const;

export default async function Radar({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const sb = supabaseServer();
  const filtro = searchParams.filtro ?? 'abertas';
  const pagina = Math.max(1, Number(searchParams.p ?? 1));
  const agora = new Date().toISOString();

  const { data: cats } = await sb.from('search_categories').select('id,nome,ativo').order('nome');
  const ativos = (cats ?? []).filter((c) => c.ativo);
  const idsAtivos = ativos.map((c) => c.id);
  const nomeCat = new Map((cats ?? []).map((c) => [c.id, c.nome]));
  const segSel = searchParams.segmento && idsAtivos.includes(searchParams.segmento) ? searchParams.segmento : undefined;

  // só segmentos ligados (ou licitações adicionadas à mão)
  const filtroSegmentos = segSel ? `categorias.cs.{${segSel}}` : `origem.eq.manual,categorias.ov.{${idsAtivos.join(',') || '00000000-0000-0000-0000-000000000000'}}`;
  const abertoOu = `data_encerramento_proposta.gte.${agora},data_encerramento_proposta.is.null`;

  let q = sb.from('tenders').select('*', { count: 'exact' }).or(filtroSegmentos);
  if (filtro !== 'ignoradas') q = q.eq('ignorado', false);
  if (filtro === 'abertas' || filtro === 'prioritarias' || filtro === 'nao_vistas') q = q.or(abertoOu);
  if (filtro === 'nao_vistas') q = q.eq('visualizado', false);
  if (filtro === 'prioritarias') q = q.eq('prioritaria', true);
  if (filtro === 'favoritos') q = q.eq('favorito', true);
  if (filtro === 'ignoradas') q = q.eq('ignorado', true);
  if (searchParams.uf) q = q.eq('uf', searchParams.uf.toUpperCase());
  if (searchParams.busca) q = q.ilike('objeto', `%${searchParams.busca}%`);
  if (searchParams.meepp) q = q.eq('me_epp_indicio', true);
  q = q.order('data_encerramento_proposta', { ascending: true, nullsFirst: false }).range((pagina - 1) * 30, pagina * 30 - 1);

  const [{ data: lic, count }, { data: empresas }, { data: casos }, { data: contagemBruta }] = await Promise.all([
    q,
    sb.from('companies').select('id,razao_social,nome_fantasia,segmentos').order('razao_social'),
    sb.from('cases').select('id,tender_id,company:companies(nome_fantasia,razao_social)'),
    sb.from('tenders').select('categorias').eq('ignorado', false).overlaps('categorias', idsAtivos.length ? idsAtivos : ['00000000-0000-0000-0000-000000000000']).or(abertoOu).limit(5000),
  ]);
  const contagem = new Map<string, number>();
  (contagemBruta ?? []).forEach((t) => contagem.set(t.categorias[0], (contagem.get(t.categorias[0]) ?? 0) + 1));
  const casosPorLic = new Map<string, any[]>();
  (casos ?? []).forEach((c: any) => casosPorLic.set(c.tender_id, [...(casosPorLic.get(c.tender_id) ?? []), c]));
  const link = (p: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(Object.entries({ ...searchParams, ...p }).filter(([, v]) => v) as [string, string][]);
    return `/radar?${qs}`;
  };
  const totalPaginas = Math.max(1, Math.ceil((count ?? 0) / 30));
  const pill = (ativo: boolean) =>
    `inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
      ativo ? 'border-tinta bg-tinta text-white' : 'border-linha bg-white text-tinta hover:border-tinta/40'
    }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>{segSel ? nomeCat.get(segSel) : 'Radar'}</h1>
          <p className="mt-1 text-nevoa">
            {count ?? 0} {count === 1 ? 'licitação' : 'licitações'}
            {segSel ? '' : ' nos seus segmentos'}, ordenadas pelo prazo que acaba primeiro.
          </p>
        </div>
        <AcaoBotao acao={rodarRadarAgora.bind(null, 'diario')} classe="btn-primario" processando="Buscando no governo...">
          Buscar novidades
        </AcaoBotao>
      </div>

      {/* Segmento: escolhe um, mostra só ele */}
      <div className="flex flex-wrap gap-2">
        <Link href={link({ segmento: undefined, p: undefined })} className={pill(!segSel)}>
          Todos os meus
        </Link>
        {ativos.map((c) => (
          <Link key={c.id} href={link({ segmento: c.id, p: undefined, abrir: undefined })} className={pill(segSel === c.id)}>
            {c.nome}
            <span className={`rounded-full px-1.5 text-xs ${segSel === c.id ? 'bg-white/15' : 'bg-papel'}`}>{contagem.get(c.id) ?? 0}</span>
          </Link>
        ))}
        {ativos.length === 0 && <p className="text-sm text-alerta">Nenhum segmento ligado. Ligue os seus no Painel.</p>}
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
          <input type="hidden" name="filtro" value={filtro} />
          {segSel && <input type="hidden" name="segmento" value={segSel} />}
          <input name="busca" defaultValue={searchParams.busca} placeholder="Procurar palavra" className="input w-44 py-2" aria-label="Procurar palavra no objeto" />
          <input name="uf" defaultValue={searchParams.uf} placeholder="UF" maxLength={2} className="input w-16 py-2" aria-label="Estado" />
          <label className="flex items-center gap-1.5 text-sm text-nevoa">
            <input type="checkbox" name="meepp" value="1" defaultChecked={!!searchParams.meepp} /> ME/EPP
          </label>
          <button className="btn-secundario py-2">Procurar</button>
        </form>
      </div>

      <div className="space-y-3">
        {!lic?.length && (
          <div className="card text-center text-nevoa">
            Nada por aqui neste filtro. Tente "Buscar novidades" ou outro segmento.
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
                  segmento={segSel ? undefined : nomeCat.get(t.categorias[0])}
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
