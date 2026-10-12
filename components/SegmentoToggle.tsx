'use client';
import { useState, useTransition } from 'react';
import { alternarSegmento } from '@/app/actions';

/** Botão de segmento que liga/desliga na hora. */
export function SegmentoToggle({ id, nome, ativo, qtd }: { id: string; nome: string; ativo: boolean; qtd: number }) {
  const [, start] = useTransition();
  const [ligado, setLigado] = useState(ativo);
  return (
    <button
      type="button"
      aria-pressed={ligado}
      onClick={() =>
        {
          const novo = !ligado;
          setLigado(novo);
          start(() => alternarSegmento(id, novo));
        }
      }
      className={`group inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selo ${
        ligado ? 'border-tinta bg-tinta text-white' : 'border-linha bg-white text-nevoa hover:border-tinta/40 hover:text-tinta'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${ligado ? 'bg-selo' : 'bg-linha'}`} />
      {nome}
      {ligado && <span className="rounded-full bg-white/15 px-1.5 text-xs">{qtd}</span>}
    </button>
  );
}
