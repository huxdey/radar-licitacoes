'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const itens = [
  { href: '/', rotulo: 'Painel' },
  { href: '/radar', rotulo: 'Radar' },
  { href: '/empresas', rotulo: 'Empresas' },
  { href: '/pregoes', rotulo: 'Meus Pregões' },
  { href: '/configuracoes', rotulo: 'Configurações' },
];

export function Nav({ nome }: { nome?: string }) {
  const p = usePathname();
  if (p.startsWith('/login') || p.startsWith('/mfa')) return null;
  return (
    <header className="sticky top-0 z-10 border-b border-black/10 bg-tinta text-white">
      <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2">
        <span className="mr-4 whitespace-nowrap font-bold tracking-tight">Radar de Licitações</span>
        {itens.map((i) => {
          const ativo = i.href === '/' ? p === '/' : p.startsWith(i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${ativo ? 'bg-white/15 font-semibold' : 'text-white/75 hover:text-white'}`}
            >
              {i.rotulo}
            </Link>
          );
        })}
        {nome && <span className="ml-auto whitespace-nowrap pl-4 text-xs text-white/60">{nome}</span>}
      </div>
    </header>
  );
}
