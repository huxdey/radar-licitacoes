import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { STATUS_CASO, brl, dataBR, diasAte, statusInfo } from '@/lib/status';

export const dynamic = 'force-dynamic';

const ABAS = [
  ['todos', 'Todos'],
  ['analise', 'Análise'],
  ['andamento', 'Andamento'],
  ['concluido', 'Concluídos'],
] as const;

export default async function Pregoes({ searchParams }: { searchParams: { aba?: string; empresa?: string } }) {
  const sb = supabaseServer();
  const aba = searchParams.aba ?? 'todos';
  let q = sb
    .from('cases')
    .select('id,status,prazo_interno,updated_at,company_id,tender:tenders(objeto,numero_compra,modalidade_nome,orgao_nome,municipio,uf,valor_estimado,data_encerramento_proposta),company:companies(razao_social,nome_fantasia)')
    .order('updated_at', { ascending: false });
  if (aba !== 'todos') q = q.in('status', STATUS_CASO.filter((s) => s.grupo === aba).map((s) => s.id));
  if (searchParams.empresa) q = q.eq('company_id', searchParams.empresa);
  const [{ data: casos }, { data: empresas }] = await Promise.all([q, sb.from('companies').select('id,razao_social,nome_fantasia').order('razao_social')]);

  return (
    <div className="space-y-4">
      <h1>Meus Pregões</h1>
      <div className="flex flex-wrap items-center gap-2">
        {ABAS.map(([id, r]) => (
          <Link key={id} href={`/pregoes?aba=${id}${searchParams.empresa ? `&empresa=${searchParams.empresa}` : ''}`} className={`chip px-3 py-1 text-sm ${aba === id ? 'bg-tinta text-white' : 'border border-black/10 bg-white'}`}>
            {r}
          </Link>
        ))}
        <form action="/pregoes" className="ml-auto flex gap-2">
          <input type="hidden" name="aba" value={aba} />
          <select name="empresa" defaultValue={searchParams.empresa ?? ''} className="input">
            <option value="">Todas as empresas</option>
            {empresas?.map((e) => <option key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</option>)}
          </select>
          <button className="btn-secundario">Filtrar</button>
        </form>
      </div>
      {!casos?.length && <div className="card text-sm text-black/50">Nenhum processo aqui. No Radar, abra uma oportunidade e clique em "Iniciar processo".</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {casos?.map((c: any) => {
          const dias = diasAte(c.tender?.data_encerramento_proposta);
          const s = statusInfo(c.status);
          return (
            <Link key={c.id} href={`/pregoes/${c.id}`} className="card block transition hover:border-tinta/40">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold">{c.tender?.modalidade_nome} {c.tender?.numero_compra}</div>
                <span className={`chip ${s.cor}`}>{s.rotulo}</span>
              </div>
              <div className="mt-1 line-clamp-2 text-sm">{c.tender?.objeto}</div>
              <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-black/60">
                <span className="font-medium text-tinta">{c.company?.nome_fantasia || c.company?.razao_social}</span>
                <span>{c.tender?.municipio}/{c.tender?.uf}</span>
                <span>{brl(c.tender?.valor_estimado)}</span>
                <span className={dias !== null && dias <= 3 && s.grupo !== 'concluido' ? 'font-semibold text-alerta' : ''}>Encerra {dataBR(c.tender?.data_encerramento_proposta)}</span>
                {c.prazo_interno && <span>Prazo interno {dataBR(c.prazo_interno + 'T12:00:00')}</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
