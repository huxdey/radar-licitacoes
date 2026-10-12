'use client';
import { useTransition } from 'react';
import { marcarLicitacao } from '@/app/actions';

/** Linha expansível do radar. Ao abrir, marca como visualizada. */
export function RadarItem({ id, visto, abrir, resumo, children }: { id: string; visto: boolean; abrir?: boolean; resumo: React.ReactNode; children: React.ReactNode }) {
  const [, start] = useTransition();
  return (
    <details
      open={abrir}
      className="group card p-0"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && !visto) start(() => marcarLicitacao(id, 'visualizado', true));
      }}
    >
      <summary className="cursor-pointer list-none p-4">{resumo}</summary>
      <div className="border-t border-black/5 p-4">{children}</div>
    </details>
  );
}

export function MarcadorBotao({ id, campo, valor, children, classe = 'btn-secundario' }: { id: string; campo: 'favorito' | 'ignorado' | 'arquivado' | 'visualizado'; valor: boolean; children: React.ReactNode; classe?: string }) {
  const [pend, start] = useTransition();
  return (
    <button className={classe} disabled={pend} onClick={() => start(() => marcarLicitacao(id, campo, valor))}>
      {children}
    </button>
  );
}
