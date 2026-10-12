import { NextResponse } from 'next/server';
import { runRadar } from '@/lib/radar';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Chamado pela Vercel Cron todo dia (vercel.json).
 * ?retry=1 é a segunda chamada do dia: só roda se a primeira não concluiu.
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  }
  const url = new URL(req.url);
  if (url.searchParams.get('retry')) {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const { data } = await supabaseAdmin().from('daily_reports').select('status').eq('data', hoje).eq('status', 'concluido').limit(1);
    if (data?.length) return NextResponse.json({ ok: true, pulado: 'busca de hoje já concluída' });
  }
  const modo = url.searchParams.get('modo') === 'completo' ? 'completo' : 'diario';
  try {
    const r = await runRadar(modo);
    return NextResponse.json(r, { status: r.status === 'falhou' ? 502 : 200 });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
