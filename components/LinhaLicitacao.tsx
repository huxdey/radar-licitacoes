import { brl, diasAte } from '@/lib/status';

const publicada = (d: string) => {
  const n = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  return n <= 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`;
};

/** Linha de licitação: a barra lateral mostra a urgência do prazo. */
export function LinhaLicitacao({
  t,
  segmento,
  destaque,
}: {
  t: { objeto: string | null; orgao_nome: string | null; municipio: string | null; uf: string | null; valor_estimado: number | null; data_encerramento_proposta: string | null; data_publicacao?: string | null; prioritaria?: boolean; me_epp_indicio?: boolean; visualizado?: boolean };
  segmento?: string;
  destaque?: React.ReactNode;
}) {
  const d = diasAte(t.data_encerramento_proposta);
  const urg = d === null ? 'bg-linha' : d <= 3 ? 'bg-alerta' : d <= 7 ? 'bg-ambar' : 'bg-selo';
  const prazo = d === null ? 'sem prazo informado' : d < 0 ? 'encerrada' : d === 0 ? 'encerra hoje' : d === 1 ? 'falta 1 dia' : `faltam ${d} dias`;
  return (
    <div className="flex gap-4">
      <span className={`w-1 shrink-0 rounded-full ${urg}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {segmento && <span className="chip bg-papel text-tinta">{segmento}</span>}
          {t.prioritaria && <span className="chip bg-tinta text-white">prioritária</span>}
          {t.me_epp_indicio && <span className="chip bg-selo/10 text-selo">ME/EPP</span>}
          {t.visualizado === false && <span className="chip bg-sky-100 text-sky-800">nova</span>}
          {destaque}
        </div>
        <p className={`mt-1.5 line-clamp-2 text-[15px] leading-snug ${t.visualizado === false ? 'font-semibold' : 'font-medium'}`}>{t.objeto}</p>
        <p className="mt-1 truncate text-sm text-nevoa">
          {t.orgao_nome} {t.municipio && <>em {t.municipio}/{t.uf}</>}
          {t.data_publicacao && <>, publicada {publicada(t.data_publicacao)}</>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-display text-base font-bold">{t.valor_estimado ? brl(t.valor_estimado) : 'valor sigiloso'}</div>
        <div className={`mt-0.5 text-sm font-semibold ${d !== null && d <= 3 ? 'text-alerta' : d !== null && d <= 7 ? 'text-ambar' : 'text-nevoa'}`}>{prazo}</div>
      </div>
    </div>
  );
}
