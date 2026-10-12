import Link from 'next/link';
import { requireMember } from '@/lib/supabase/server';
import { dataBR, diasAte, statusInfo } from '@/lib/status';
import { AcaoBotao } from '@/components/AcaoBotao';
import { RadarDial } from '@/components/RadarDial';
import { SegmentoToggle } from '@/components/SegmentoToggle';
import { LinhaLicitacao } from '@/components/LinhaLicitacao';
import { rodarRadarAgora } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const saudacao = () => {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

export default async function Painel() {
  const { sb, nome } = await requireMember();
  const agora = new Date().toISOString();
  const [{ data: rel }, { data: cats }, { data: casos }] = await Promise.all([
    sb.from('daily_reports').select('status,iniciado_em').order('iniciado_em', { ascending: false }).limit(1).maybeSingle(),
    sb.from('search_categories').select('id,nome,ativo').order('nome'),
    sb
      .from('cases')
      .select('id,status,tender:tenders(objeto,data_encerramento_proposta),company:companies(razao_social,nome_fantasia)')
      .not('status', 'in', '(ganho,perdido,cancelado)')
      .order('updated_at', { ascending: false }),
  ]);
  const ativos = (cats ?? []).filter((c) => c.ativo);
  const idsAtivos = ativos.map((c) => c.id);
  const nomeCat = new Map((cats ?? []).map((c) => [c.id, c.nome]));

  const { data: abertas } = idsAtivos.length
    ? await sb
        .from('tenders')
        .select('id,objeto,orgao_nome,municipio,uf,valor_estimado,data_encerramento_proposta,prioritaria,me_epp_indicio,visualizado,categorias')
        .eq('ignorado', false)
        .overlaps('categorias', idsAtivos)
        .or(`data_encerramento_proposta.gte.${agora},data_encerramento_proposta.is.null`)
        .order('data_encerramento_proposta', { ascending: true, nullsFirst: false })
        .limit(500)
    : { data: [] as any[] };

  const lista = abertas ?? [];
  const qtdPorSeg = new Map<string, number>();
  lista.forEach((t) => qtdPorSeg.set(t.categorias[0], (qtdPorSeg.get(t.categorias[0]) ?? 0) + 1));
  const semana = lista.filter((t) => (diasAte(t.data_encerramento_proposta) ?? 99) <= 7).length;
  const naoVistas = lista.filter((t) => !t.visualizado).length;
  const pontos = lista
    .filter((t) => t.data_encerramento_proposta)
    .map((t) => ({ id: t.id, dias: diasAte(t.data_encerramento_proposta)!, segmento: nomeCat.get(t.categorias[0]) ?? '', titulo: t.objeto ?? '' }));

  const porStatus = (casos ?? []).reduce<Record<string, number>>((acc, c: any) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc), {});

  return (
    <div className="space-y-8">
      {/* Abertura: saudação + radar de prazos */}
      <section className="grid items-center gap-8 overflow-hidden rounded-[2rem] bg-tinta p-6 text-white sm:p-10 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-white/60">{saudacao()}, {nome ?? 'tudo certo'}.</p>
          <h1 className="mt-3 max-w-xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
            {lista.length === 0
              ? 'Nenhuma licitação aberta nos seus segmentos agora.'
              : `${lista.length} ${lista.length === 1 ? 'licitação aberta' : 'licitações abertas'} nos seus segmentos.`}
          </h1>
          {lista.length > 0 && (
            <p className="mt-4 max-w-md text-lg text-white/75">
              {semana > 0 ? `${semana} encerram nos próximos 7 dias` : 'Nenhuma encerra nesta semana'}
              {naoVistas > 0 ? ` e ${naoVistas} você ainda não abriu.` : '.'}
            </p>
          )}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/radar" className="btn bg-selo text-white hover:bg-selo/90">Ver no radar</Link>
            <AcaoBotao acao={rodarRadarAgora.bind(null, 'diario')} classe="btn border border-white/25 text-white hover:bg-white/10" processando="Buscando no governo...">
              Buscar novidades
            </AcaoBotao>
          </div>
          <p className="mt-4 text-xs text-white/45">
            Última busca {rel ? dataBR(rel.iniciado_em, true) : 'ainda não feita'}
            {rel && rel.status !== 'concluido' && ' (incompleta, busque de novo para completar)'}
          </p>
        </div>
        <div className="flex flex-col items-center">
          <RadarDial pontos={pontos} segmentos={ativos.map((c) => c.nome)} />
          <div className="mt-3 flex gap-4 text-xs text-white/60">
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-alerta" />até 3 dias</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-ambar" />até 7 dias</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-selo" />mais de 7</span>
          </div>
        </div>
      </section>

      {/* Segmentos: liga/desliga */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2>Meus segmentos</h2>
          <p className="text-sm text-nevoa">Toque para ligar ou desligar. Desligado some de todo o sistema.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(cats ?? []).map((c) => (
            <SegmentoToggle key={c.id} id={c.id} nome={c.nome} ativo={c.ativo} qtd={qtdPorSeg.get(c.id) ?? 0} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <section className="card p-0">
          <div className="flex items-baseline justify-between px-5 pb-2 pt-5">
            <h2>Encerram primeiro</h2>
            <Link href="/radar" className="text-sm font-semibold text-selo hover:underline">Ver todas</Link>
          </div>
          {lista.length === 0 && (
            <p className="px-5 pb-6 text-sm text-nevoa">Ligue um segmento acima ou clique em Buscar novidades.</p>
          )}
          <ul>
            {lista.slice(0, 8).map((t) => (
              <li key={t.id} className="border-t border-linha">
                <Link href={`/radar?abrir=${t.id}`} className="block px-5 py-4 transition hover:bg-papel">
                  <LinhaLicitacao t={t} segmento={nomeCat.get(t.categorias[0])} />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card h-fit">
          <div className="mb-4 flex items-baseline justify-between">
            <h2>Meus pregões</h2>
            <Link href="/pregoes" className="text-sm font-semibold text-selo hover:underline">Abrir</Link>
          </div>
          {!casos?.length ? (
            <p className="text-sm text-nevoa">Nenhum em andamento. No radar, abra uma licitação e clique em Tenho interesse.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {Object.entries(porStatus).map(([s, n]) => (
                  <span key={s} className={`chip ${statusInfo(s).cor}`}>{statusInfo(s).rotulo}: {n}</span>
                ))}
              </div>
              <ul className="space-y-3">
                {casos.slice(0, 5).map((c: any) => {
                  const d = diasAte(c.tender?.data_encerramento_proposta);
                  return (
                    <li key={c.id}>
                      <Link href={`/pregoes/${c.id}`} className="block rounded-xl p-2 -m-2 hover:bg-papel">
                        <div className="text-sm font-semibold">{c.company?.nome_fantasia || c.company?.razao_social}</div>
                        <div className="line-clamp-1 text-sm text-nevoa">{c.tender?.objeto}</div>
                        {d !== null && d <= 7 && <div className="text-xs font-semibold text-alerta">{d <= 0 ? 'encerra hoje' : `encerra em ${d} dias`}</div>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
