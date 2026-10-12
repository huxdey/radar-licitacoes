import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Nav } from '@/components/Nav';
import { requireMember } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Radar de Licitações', description: 'Assistente interno de licitações' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const m = await requireMember();
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <Nav nome={m.nome} />
        <main className="mx-auto max-w-6xl px-4 py-8">
          {m.user && m.mfa && !m.member ? (
            <div className="card">
              <h1>Acesso pendente</h1>
              <p className="mt-2 text-sm">
                Sua conta ({m.user.email}) entrou, mas ainda não está autorizada. Peça para incluir seu ID na tabela
                <code className="mx-1 rounded bg-black/5 px-1">users</code>: <code className="rounded bg-black/5 px-1">{m.user.id}</code>
              </p>
            </div>
          ) : (
            children
          )}
        </main>
      </body>
    </html>
  );
}
