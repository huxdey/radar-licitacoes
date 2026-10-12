import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/supabase/server';
import { BUCKET } from '@/lib/supabase/admin';

/** Abre um arquivo privado com link temporário (5 minutos). */
export async function GET(req: Request) {
  const m = await requireMember();
  if (!m.member) return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  const path = new URL(req.url).searchParams.get('path');
  if (!path) return NextResponse.json({ erro: 'arquivo não informado' }, { status: 400 });
  const { data, error } = await m.sb.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data) return NextResponse.json({ erro: 'arquivo não encontrado' }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
