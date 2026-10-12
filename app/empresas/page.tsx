import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { statusInfo } from '@/lib/status';
import { FormAcao } from '@/components/FormAcao';
import { salvarEmpresa } from '../actions';

export const dynamic = 'force-dynamic';

const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

export default async function Empresas({ searchParams }: { searchParams: { editar?: string } }) {
  const sb = supabaseServer();
  const [{ data: empresas }, { data: cats }, { data: casos }] = await Promise.all([
    sb.from('companies').select('*').order('razao_social'),
    sb.from('search_categories').select('id,nome').order('nome'),
    sb.from('cases').select('id,company_id,status,tender:tenders(objeto,numero_compra)').order('created_at', { ascending: false }),
  ]);
  const editar = empresas?.find((e) => e.id === searchParams.editar);
  const nomeCat = new Map((cats ?? []).map((c) => [c.id, c.nome]));

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <section className="space-y-3 lg:col-span-3">
        <h1>Empresas ({empresas?.length ?? 0})</h1>
        {!empresas?.length && <div className="card text-sm text-black/50">Nenhuma empresa cadastrada. Comece pela MRJ Serviços.</div>}
        {empresas?.map((e) => {
          const hist = (casos ?? []).filter((c: any) => c.company_id === e.id);
          return (
            <div key={e.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{e.nome_fantasia || e.razao_social}</div>
                  <div className="text-xs text-black/60">{e.razao_social} · CNPJ {cnpjFmt(e.cnpj)}</div>
                  <div className="text-xs text-black/60">{[e.cidade, e.uf].filter(Boolean).join('/')} {e.contato_nome && `· ${e.contato_nome}`} {e.contato_telefone && `· ${e.contato_telefone}`}</div>
                </div>
                <Link href={`/empresas?editar=${e.id}`} className="btn-secundario">Editar</Link>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(e.segmentos as string[]).map((s) => <span key={s} className="chip bg-black/5">{nomeCat.get(s)}</span>)}
              </div>
              {e.observacoes && <p className="mt-2 whitespace-pre-line text-sm text-black/70">{e.observacoes}</p>}
              {hist.length > 0 && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-black/60">{hist.length} licitação(ões) vinculada(s)</summary>
                  <ul className="mt-1 space-y-1">
                    {hist.map((c: any) => (
                      <li key={c.id}>
                        <Link href={`/pregoes/${c.id}`} className="underline">{c.tender?.numero_compra || 'Pregão'}</Link>{' '}
                        <span className={`chip ${statusInfo(c.status).cor}`}>{statusInfo(c.status).rotulo}</span>{' '}
                        <span className="text-black/60">{c.tender?.objeto?.slice(0, 80)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </section>

      <section className="lg:col-span-2">
        <div className="card sticky top-16">
          <div className="mb-3 flex items-center justify-between">
            <h2>{editar ? 'Editar empresa' : 'Nova empresa'}</h2>
            {editar && <Link href="/empresas" className="text-sm underline">cancelar</Link>}
          </div>
          <FormAcao acao={salvarEmpresa} limpar={!editar} key={editar?.id ?? 'nova'}>
            <input type="hidden" name="id" value={editar?.id ?? ''} />
            <div><label className="label">Razão social *</label><input name="razao_social" className="input" defaultValue={editar?.razao_social} required /></div>
            <div><label className="label">Nome fantasia</label><input name="nome_fantasia" className="input" defaultValue={editar?.nome_fantasia ?? ''} /></div>
            <div><label className="label">CNPJ *</label><input name="cnpj" className="input" defaultValue={editar?.cnpj} required /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2"><label className="label">Cidade</label><input name="cidade" className="input" defaultValue={editar?.cidade ?? ''} /></div>
              <div><label className="label">UF</label><input name="uf" maxLength={2} className="input" defaultValue={editar?.uf ?? ''} /></div>
            </div>
            <div>
              <label className="label">Segmentos em que atua</label>
              <div className="grid grid-cols-2 gap-1 text-sm">
                {cats?.map((c) => (
                  <label key={c.id} className="flex items-center gap-1">
                    <input type="checkbox" name="segmentos" value={c.id} defaultChecked={(editar?.segmentos as string[] | undefined)?.includes(c.id)} /> {c.nome}
                  </label>
                ))}
              </div>
            </div>
            <div><label className="label">Responsável</label><input name="contato_nome" className="input" defaultValue={editar?.contato_nome ?? ''} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Telefone</label><input name="contato_telefone" className="input" defaultValue={editar?.contato_telefone ?? ''} /></div>
              <div><label className="label">E-mail</label><input name="contato_email" type="email" className="input" defaultValue={editar?.contato_email ?? ''} /></div>
            </div>
            <div><label className="label">Observações e documentos já disponíveis</label><textarea name="observacoes" rows={4} className="input" defaultValue={editar?.observacoes ?? ''} /></div>
          </FormAcao>
        </div>
      </section>
    </div>
  );
}
