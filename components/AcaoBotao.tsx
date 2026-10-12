'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Resultado } from '@/app/actions';

/** Botão que chama uma server action, mostra "processando" e a mensagem de retorno. */
export function AcaoBotao({
  acao,
  children,
  classe = 'btn-secundario',
  processando = 'Processando...',
  confirmar,
}: {
  acao: () => Promise<Resultado | void>;
  children: React.ReactNode;
  classe?: string;
  processando?: string;
  confirmar?: string;
}) {
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<Resultado | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className={classe}
        disabled={pend}
        onClick={() => {
          if (confirmar && !window.confirm(confirmar)) return;
          setMsg(null);
          start(async () => {
            try {
              const r = await acao();
              if (r) setMsg(r);
            } catch (e) {
              setMsg({ ok: false, msg: e instanceof Error ? e.message : 'Erro inesperado' });
            }
            router.refresh();
          });
        }}
      >
        {pend ? processando : children}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? 'text-selo' : 'text-alerta'}`}>{msg.msg}</span>}
    </span>
  );
}
