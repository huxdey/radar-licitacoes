'use client';
import { useState, useTransition } from 'react';
import { marcarLicitacao } from '@/app/actions';

/** Linha expansível do radar. Ao abrir, marca como visualizada. */
export function RadarItem({ id, visto, abrir, resumo, children }: { id: string; visto: boolean; abrir?: boolean; resumo: React.ReactNode; children: React.ReactNode }) {
  const [, start] = useTransition();
  const [aberto, setAberto] = useState(!!abrir);
  const [jaVisto, setJaVisto] = useState(visto);
  return (
    <details
      open={aberto}
      className="group card p-0"
      onToggle={(e) => {
        const agora = (e.currentTarget as HTMLDetailsElement).open;
        setAberto(agora);
        if (agora && !jaVisto) {
          setJaVisto(true);
          start(() => marcarLicitacao(id, 'visualizado', true));
        }
      }}
    >
      <summary className="cursor-pointer list-none p-5">{resumo}</summary>
      <div className="border-t border-linha p-5">{children}</div>
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
