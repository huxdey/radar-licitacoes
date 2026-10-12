'use client';
import { useState } from 'react';

export function CopiarBotao({ texto, rotulo = 'Copiar' }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="btn-secundario"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setOk(true);
        setTimeout(() => setOk(false), 2000);
      }}
    >
      {ok ? 'Copiado!' : rotulo}
    </button>
  );
}
