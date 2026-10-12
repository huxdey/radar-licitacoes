import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function supabaseServer() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            /* chamado em Server Component: o middleware renova a sessão */
          }
        },
      },
    },
  );
}

/** Garante usuário logado E autorizado (presente em public.users). */
export async function requireMember() {
  const sb = supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return { sb, user: null, member: false, mfa: false } as const;
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  const mfa = aal?.currentLevel === 'aal2';
  if (!mfa) return { sb, user: data.user, member: false, mfa } as const;
  const { data: m } = await sb.from('users').select('id,nome').eq('id', data.user.id).maybeSingle();
  return { sb, user: data.user, member: !!m, mfa, nome: m?.nome as string | undefined } as const;
}
