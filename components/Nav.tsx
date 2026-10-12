'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const itens = [
  { href: '/', rotulo: 'Painel' },
  { href: '/radar', rotulo: 'Radar' },
  { href: '/pregoes', rotulo: 'Meus pregões' },
  { href: '/empresas', rotulo: 'Empresas' },
  { href: '/configuracoes', rotulo: 'Ajustes' },
];

export function Nav({ nome }: { nome?: string }) {
  const p = usePathname();
  if (p.startsWith('/login') || p.startsWith('/mfa')) return null;
  return (
    <header className="sticky top-0 z-20 border-b border-linha bg-papel/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-4 py-3">
        <Link href="/" className="mr-4 flex items-center gap-2 whitespace-nowrap">
          {/* marca: radar simplificado */}
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="13" cy="13" r="12" fill="#0E2238" />
            <circle cx="13" cy="13" r="7.5" fill="none" stroke="#ffffff" strokeOpacity=".35" />
            <path d="M13 13 L13 1 A12 12 0 0 1 23.4 7 Z" fill="#0F9D6E" />
            <circle cx="17.5" cy="9" r="1.8" fill="#ffffff" />
          </svg>
          <span className="font-display text-lg font-bold tracking-tight">Radar</span>
        </Link>
        <nav className="flex gap-1">
          {itens.map((i) => {
            const ativo = i.href === '/' ? p === '/' : p.startsWith(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={ativo ? 'page' : undefined}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  ativo ? 'bg-tinta text-white' : 'text-nevoa hover:bg-white hover:text-tinta'
                }`}
              >
                {i.rotulo}
              </Link>
            );
          })}
        </nav>
        {nome && (
          <span className="ml-auto flex items-center gap-2 whitespace-nowrap pl-4 text-sm font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-selo text-xs text-white">{nome.slice(0, 1)}</span>
            <span className="hidden sm:inline">{nome}</span>
          </span>
        )}
      </div>
    </header>
  );
}
