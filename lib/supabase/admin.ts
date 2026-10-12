import { createClient } from '@supabase/supabase-js';

/** Cliente com service role: só para rotinas do servidor (cron, downloads, IA). */
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const BUCKET = 'licitacoes';
