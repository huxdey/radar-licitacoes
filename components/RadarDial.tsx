/**
 * O radar de prazos: cada ponto é uma licitação aberta nos seus segmentos.
 * Quanto mais perto do centro, menos dias faltam para encerrar a proposta.
 * Cada fatia do círculo é um segmento.
 */
type Ponto = { id: string; dias: number; segmento: string; titulo: string };

const R = 140; // raio útil
const ANEIS = [7, 15, 30];
const cor = (d: number) => (d <= 3 ? '#D14343' : d <= 7 ? '#E8A317' : '#0F9D6E');

// posição estável por id (o mesmo ponto não "pula" a cada carregamento)
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function RadarDial({ pontos, segmentos }: { pontos: Ponto[]; segmentos: string[] }) {
  const n = Math.max(segmentos.length, 1);
  const fatia = (2 * Math.PI) / n;
  return (
    <svg viewBox="-170 -170 340 340" className="h-auto w-full max-w-[340px]" role="img" aria-label={`Radar com ${pontos.length} licitações abertas`}>
      <defs>
        <radialGradient id="fundo" r="1">
          <stop offset="0" stopColor="#13304F" />
          <stop offset="1" stopColor="#0E2238" />
        </radialGradient>
        <linearGradient id="varre" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0F9D6E" stopOpacity="0" />
          <stop offset="1" stopColor="#0F9D6E" stopOpacity=".45" />
        </linearGradient>
      </defs>
      <circle r={R + 18} fill="url(#fundo)" />
      {ANEIS.map((d) => (
        <g key={d}>
          <circle r={(d / 30) * R} fill="none" stroke="#ffffff" strokeOpacity=".14" strokeDasharray={d === 30 ? undefined : '3 4'} />
          <text x="4" y={-(d / 30) * R - 4} fill="#ffffff" fillOpacity=".45" fontSize="9" fontFamily="Figtree">
            {d} dias
          </text>
        </g>
      ))}
      {segmentos.map((s, i) => {
        const a = i * fatia - Math.PI / 2;
        return <line key={s} x1="0" y1="0" x2={Math.cos(a) * (R + 18)} y2={Math.sin(a) * (R + 18)} stroke="#ffffff" strokeOpacity=".07" />;
      })}
      <g className="radar-varredura">
        <path d={`M0 0 L0 ${-(R + 18)} A${R + 18} ${R + 18} 0 0 1 ${(R + 18) * Math.sin(0.7)} ${-(R + 18) * Math.cos(0.7)} Z`} fill="url(#varre)" />
      </g>
      {pontos.map((p) => {
        const i = Math.max(0, segmentos.indexOf(p.segmento));
        const h = hash(p.id);
        const a = i * fatia - Math.PI / 2 + (0.15 + ((h % 1000) / 1000) * 0.7) * fatia;
        const r = (Math.min(Math.max(p.dias, 0.5), 30) / 30) * R;
        return (
          <a key={p.id} href={`/radar?abrir=${p.id}`}>
            <title>{`${p.titulo} (${p.dias <= 0 ? 'encerra hoje' : `faltam ${p.dias} dias`})`}</title>
            <circle cx={Math.cos(a) * r} cy={Math.sin(a) * r} r="5" fill={cor(p.dias)} stroke="#0E2238" strokeWidth="1.5" />
          </a>
        );
      })}
      <circle r="3" fill="#ffffff" />
    </svg>
  );
}
