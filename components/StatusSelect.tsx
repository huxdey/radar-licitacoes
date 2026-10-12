'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { mudarStatus } from '@/app/actions';
import { STATUS_CASO } from '@/lib/status';

export function StatusSelect({ caseId, atual }: { caseId: string; atual: string }) {
  const [pend, start] = useTransition();
  const router = useRouter();
  return (
    <select
      className="input w-auto"
      value={atual}
      disabled={pend}
      onChange={(e) => {
        const novo = e.target.value;
        if (novo === 'preparado_envio' && !window.confirm('Confirmar aprovação interna para envio? Fica registrado em seu nome.')) return;
        start(async () => {
          await mudarStatus(caseId, novo);
          router.refresh();
        });
      }}
    >
      {STATUS_CASO.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
    </select>
  );
}
