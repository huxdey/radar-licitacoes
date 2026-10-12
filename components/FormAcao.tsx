'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Resultado } from '@/app/actions';

/** Formulário que envia para uma server action e mostra o resultado. */
export function FormAcao({
  acao,
  children,
  botao = 'Salvar',
  processando = 'Salvando...',
  limpar = false,
  className = 'space-y-3',
}: {
  acao: (fd: FormData) => Promise<Resultado>;
  children: React.ReactNode;
  botao?: string;
  processando?: string;
  limpar?: boolean;
  className?: string;
}) {
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<Resultado | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await acao(fd);
          setMsg(r);
          if (r.ok && limpar) ref.current?.reset();
          router.refresh();
        });
      }}
    >
      {children}
      <div className="flex items-center gap-3">
        <button className="btn-primario" disabled={pend}>
          {pend ? processando : botao}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? 'text-selo' : 'text-alerta'}`}>{msg.msg}</span>}
      </div>
    </form>
  );
}
