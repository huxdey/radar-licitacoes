'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { buscarAgora } from '@/app/actions';

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
const PERIODOS = [7, 15, 30, 60];
const MODALIDADES: [number, string][] = [[6, 'Pregão eletrônico'], [8, 'Dispensa'], [4, 'Concorrência eletrônica']];

type Seg = { id: string; nome: string };

export function BuscaForm({ segmentos, inicial }: { segmentos: Seg[]; inicial: { segs: string[]; ufs: string[]; dias: number; mods: number[] } }) {
  const [segs, setSegs] = useState<string[]>(inicial.segs);
  const [ufs, setUfs] = useState<string[]>(inicial.ufs);
  const [dias, setDias] = useState(inicial.dias);
  const [mods, setMods] = useState<number[]>(inicial.mods);
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pend, start] = useTransition();
  const router = useRouter();

  const alterna = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  const pill = (on: boolean) =>
    `rounded-full border px-3.5 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selo ${
      on ? 'border-tinta bg-tinta text-white' : 'border-linha bg-white text-tinta hover:border-tinta/40'
    }`;
  const pronto = segs.length > 0 && ufs.length > 0;

  function buscar(forcar = false) {
    setMsg(null);
    start(async () => {
      const r = await buscarAgora(ufs, mods, forcar);
      setMsg(r);
      const qs = new URLSearchParams({ segs: segs.join(','), ufs: ufs.join(','), dias: String(dias), mods: mods.join(',') });
      router.push(`/radar?${qs}`);
      router.refresh();
    });
  }

  return (
    <div className="card space-y-5">
      <fieldset>
        <legend className="mb-2 font-display text-base font-bold">1. Segmento</legend>
        <div className="flex flex-wrap gap-2">
          {segmentos.map((s) => (
            <button key={s.id} type="button" aria-pressed={segs.includes(s.id)} className={pill(segs.includes(s.id))} onClick={() => setSegs(alterna(segs, s.id))}>
              {s.nome}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-display text-base font-bold">2. Estado</legend>
        <div className="flex flex-wrap gap-1.5">
          {UFS.map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={ufs.includes(u)}
              onClick={() => setUfs(alterna(ufs, u))}
              className={`w-12 rounded-lg border py-1.5 text-sm font-semibold transition ${ufs.includes(u) ? 'border-selo bg-selo text-white' : 'border-linha bg-white text-tinta hover:border-tinta/40'}`}
            >
              {u}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-2 font-display text-base font-bold">3. Publicadas nos últimos</legend>
          <div className="flex flex-wrap gap-2">
            {PERIODOS.map((p) => (
              <button key={p} type="button" aria-pressed={dias === p} className={pill(dias === p)} onClick={() => setDias(p)}>
                {p} dias
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 font-display text-base font-bold">Modalidade</legend>
          <div className="flex flex-wrap gap-2">
            {MODALIDADES.map(([id, nome]) => (
              <button key={id} type="button" aria-pressed={mods.includes(id)} className={pill(mods.includes(id))} onClick={() => setMods(alterna(mods, id))}>
                {nome}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-linha pt-4">
        <button type="button" className="btn bg-selo px-6 py-3 text-base text-white hover:bg-selo/90" disabled={!pronto || pend} onClick={() => buscar(false)}>
          {pend ? 'Buscando no governo...' : 'Buscar'}
        </button>
        {!pronto && <span className="text-sm text-nevoa">Escolha pelo menos um segmento e um estado.</span>}
        {pend && <span className="text-sm text-nevoa">Cada estado leva de 30 segundos a 2 minutos na primeira vez. Depois fica guardado por 6 horas.</span>}
        {msg && !pend && <span className={`text-sm font-semibold ${msg.ok ? 'text-selo' : 'text-alerta'}`}>{msg.msg}</span>}
        {msg && !pend && (
          <button type="button" className="ml-auto text-sm font-semibold text-nevoa underline hover:text-tinta" onClick={() => buscar(true)}>
            Buscar de novo no governo
          </button>
        )}
      </div>
    </div>
  );
}
