import JSZip from 'jszip';
import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/supabase/server';
import { BUCKET } from '@/lib/supabase/admin';

export const maxDuration = 120;

/** Junta todos os arquivos públicos do edital num ZIP. */
export async function GET(_req: Request, { params }: { params: { tenderId: string } }) {
  const m = await requireMember();
  if (!m.member) return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  const { data: t } = await m.sb.from('tenders').select('numero_compra,orgao_nome').eq('id', params.tenderId).single();
  const { data: arqs } = await m.sb.from('tender_files').select('titulo,storage_path').eq('tender_id', params.tenderId).not('storage_path', 'is', null);
  const zip = new JSZip();
  const pasta = zip.folder('01 - Edital e anexos')!;
  for (const a of arqs ?? []) {
    const { data } = await m.sb.storage.from(BUCKET).download(a.storage_path!);
    if (data) pasta.file(a.storage_path!.split('/').pop()!, Buffer.from(await data.arrayBuffer()));
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const nome = `edital-${(t?.numero_compra ?? params.tenderId).replace(/[^\w-]+/g, '-')}.zip`;
  return new NextResponse(new Uint8Array(buf), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${nome}"` } });
}
