import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { brl, dataBR, diasAte, statusInfo } from '@/lib/status';
import { AcaoBotao } from '@/components/AcaoBotao';
import { rodarRadarAgora } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export default async function Painel() {
  const sb = supabaseServer();
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [{ data: rel }, { data: novas }, { data: casos }, { data: cats }] = await Promise.all([
    sb.from('daily_reports').select('*').order('iniciado_em', { ascending: false }).limit(1).maybeSingle(),
    sb
      .from('tenders')
      .select('id,objeto,orgao_nome,municipio,uf,valor_estimado,data_encerramento_proposta,prioritaria,categorias')
      .eq('primeira_vez_visto', hoje)
      .eq('ignorado', false)
      .order('prioritaria', { ascending: false })
      .order('score', { ascending: false })
      .limit(8),
    sb
      .from('cases')
      .select('id,status,prazo_interno,tender:tenders(objeto,numero_compra,data_encerramento_proposta),company:companies(razao_social,nome_fantasia)')
      .not('status', 'in', '(ganho,perdido,cancelado)')
      .order('updated_at', { ascending: false }),
    sb.from('search_categories').select('id,nome'),
  ]);
  const nomeCat = new Map((cats ?? []).map((c) => [c.id, c.nome]));
  const segmentos = Object.entries((rel?.por_segmento as Record<string, number>) ?? {}).sort((a, b) => b[1] - a[1]);
  const urgentes = (casos ?? [])
    .map((c: any) => ({ ...c, dias: diasAte(c.tender?.data_encerramento_proposta) }))
    .filter((c) => c.dias !== null && c.dias <= 7)
    .sort((a, b) => a.dias! - b.dias!);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Radar diário</h1>
          <p className="text-sm text-black/60">
            {rel ? `Última busca: ${dataBR(rel.iniciado_em, true)}` : 'Nenhuma busca realizada ainda.'}
            {rel && rel.status !== 'concluido' && (
              <span className="ml-2 chip bg-orange-100 text-orange-800">
                {rel.status === 'rodando' ? 'em andamento' : rel.status === 'falhou' ? 'falhou' : 'incompleta'}
              </span>
            )}
          </p>
        </div>
        <AcaoBotao acao={rodarRadarAgora.bind(null, 'diario')} classe="btn-primario" processando="Buscando no PNCP...">
          Atualizar radar agora
        </AcaoBotao>
      </div>

      {rel && rel.status !== 'concluido' && (rel.erros as unknown[])?.length > 0 && (
        <div className="card border-orange-300 bg-orange-50 text-sm">
          A última busca não conseguiu consultar tudo no PNCP ({(rel.erros as unknown[]).length} consulta(s) com erro). Os números abaixo podem estar
          incompletos. Rode novamente mais tarde.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          ['Encontradas', rel?.encontradas ?? 0],
          ['Nos seus segmentos', rel?.pre_filtradas ?? 0],
          ['Prioritárias', rel?.prioritarias ?? 0],
        ].map(([r, n]) => (
          <div key={r as string} className="card">
            <div className="text-3xl font-bold">{n}</div>
            <div className="text-xs uppercase tracking-wide text-black/50">{r}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="card md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2>Novas hoje</h2>
            <Link href="/radar?filtro=novas" className="text-sm underline">ver todas</Link>
          </div>
          {!novas?.length && <p className="text-sm text-black/50">Nenhuma oportunidade nova hoje.</p>}
          <ul className="divide-y divide-black/5">
            {novas?.map((t) => (
              <li key={t.id} className="py-2">
                <Link href={`/radar?abrir=${t.id}`} className="block hover:bg-black/[0.02]">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-black/50">
                    {t.prioritaria && <span className="chip bg-tinta text-white">prioritária</span>}
                    {(t.categorias as string[]).map((c) => (
                      <span key={c} className="chip bg-black/5">{nomeCat.get(c)}</span>
                    ))}
                    <span>{t.municipio}/{t.uf}</span>
                  </div>
                  <div className="line-clamp-2 text-sm font-medium">{t.objeto}</div>
                  <div className="text-xs text-black/60">
                    {brl(t.valor_estimado)} · encerra {dataBR(t.data_encerramento_proposta)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-6">
          <section className="card">
            <h2 className="mb-3">Por segmento</h2>
            {!segmentos.length && <p className="text-sm text-black/50">Sem dados.</p>}
            {segmentos.map(([n, q]) => (
              <div key={n} className="flex justify-between border-b border-black/5 py-1 text-sm last:border-0">
                <span>{n}</span>
                <span className="font-semibold">{q}</span>
              </div>
            ))}
          </section>

          <section className="card">
            <h2 className="mb-3">Prazos em até 7 dias</h2>
            {!urgentes.length && <p className="text-sm text-black/50">Nada urgente.</p>}
            {urgentes.map((c: any) => (
              <Link key={c.id} href={`/pregoes/${c.id}`} className="block border-b border-black/5 py-2 text-sm last:border-0">
                <div className="font-medium">{c.company?.nome_fantasia || c.company?.razao_social}</div>
                <div className="line-clamp-1 text-black/60">{c.tender?.objeto}</div>
                <div className="mt-1 flex gap-2">
                  <span className={`chip ${c.dias <= 2 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                    {c.dias <= 0 ? 'encerra hoje' : `${c.dias} dia(s)`}
                  </span>
                  <span className={`chip ${statusInfo(c.status).cor}`}>{statusInfo(c.status).rotulo}</span>
                </div>
              </Link>
            ))}
          </section>
        </div>
      </div>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2>Processos em andamento ({casos?.length ?? 0})</h2>
          <Link href="/pregoes" className="text-sm underline">Meus Pregões</Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(
            (casos ?? []).reduce<Record<string, number>>((acc, c: any) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc), {}),
          ).map(([s, n]) => (
            <span key={s} className={`chip ${statusInfo(s).cor}`}>{statusInfo(s).rotulo}: {n}</span>
          ))}
        </div>
      </section>
    </div>
  );
}
