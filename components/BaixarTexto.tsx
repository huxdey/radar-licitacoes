'use client';
export function BaixarTexto({ texto, nome }: { texto: string; nome: string }) {
  return (
    <button
      className="btn-secundario"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = nome;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      Baixar .txt
    </button>
  );
}
