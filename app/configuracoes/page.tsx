import { supabaseServer } from '@/lib/supabase/server';
import { MODALIDADES } from '@/lib/pncp';
import { dataBR } from '@/lib/status';
import { FormAcao } from '@/components/FormAcao';
import { AcaoBotao } from '@/components/AcaoBotao';
import { rodarRadarAgora, salvarCategoria, salvarConfiguracoes } from '../actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export default async function Configuracoes() {
  const sb = supabaseServer();
  const [{ data: cfg }, { data: cats }, { data: users }, { data: rels }] = await Promise.all([
    sb.from('settings').select('*').eq('id', 1).single(),
    sb.from('search_categories').select('*').order('nome'),
    sb.from('users').select('*'),
    sb.from('daily_reports').select('*').order('iniciado_em', { ascending: false }).limit(10),
  ]);

  return (
    <div className="space-y-6">
      <h1>Configurações</h1>

      <section className="card">
        <h2 className="mb-3">Regras de busca</h2>
        <FormAcao acao={salvarConfiguracoes}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Estados (UF), separados por vírgula. Vazio = Brasil inteiro</label>
              <input name="ufs" className="input" defaultValue={(cfg?.ufs ?? []).join(', ')} />
            </div>
            <div>
              <label className="label">Municípios (código IBGE), opcional. Se preenchido, substitui os estados</label>
              <input name="municipios_ibge" className="input" defaultValue={(cfg?.municipios_ibge ?? []).join(', ')} placeholder="ex.: 3550308 (São Paulo)" />
            </div>
          </div>
          <div>
            <label className="label">Modalidades monitoradas</label>
            <div className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
              {Object.entries(MODALIDADES).map(([id, nome]) => (
                <label key={id} className="flex items-center gap-1">
                  <input type="checkbox" name="modalidades" value={id} defaultChecked={(cfg?.modalidades ?? []).includes(Number(id))} /> {nome}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label">Valor mínimo (R$)</label><input name="valor_min" className="input" defaultValue={cfg?.valor_min ?? ''} /></div>
            <div><label className="label">Valor máximo (R$)</label><input name="valor_max" className="input" defaultValue={cfg?.valor_max ?? ''} /></div>
            <div><label className="label">Prazo mínimo restante (dias)</label><input name="dias_minimos_proposta" type="number" min={0} className="input" defaultValue={cfg?.dias_minimos_proposta ?? 3} /></div>
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-1"><input type="checkbox" name="somente_me_epp" defaultChecked={cfg?.somente_me_epp} /> Somente com indício de benefício ME/EPP</label>
            <label className="flex items-center gap-1"><input type="checkbox" name="incluir_atualizados" defaultChecked={cfg?.incluir_atualizados} /> Incluir editais atualizados (retificações)</label>
          </div>
        </FormAcao>
        <div className="mt-4 border-t border-black/5 pt-4 text-sm">
          <p className="mb-2 text-black/60">
            A busca diária pega o que foi publicado ou atualizado ontem e hoje. Na primeira vez, rode a carga completa para trazer tudo que ainda está recebendo propostas.
          </p>
          <AcaoBotao acao={rodarRadarAgora.bind(null, 'completo')} processando="Carregando tudo que está aberto (pode levar minutos)...">
            Rodar carga completa
          </AcaoBotao>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-1">Segmentos ({cats?.filter((c) => c.ativo).length} ativos)</h2>
        <p className="mb-3 text-xs text-black/50">Palavras separadas por vírgula. Acentos são ignorados na busca. Exclusões descartam o edital mesmo que uma palavra-chave bata.</p>
        <div className="space-y-2">
          {cats?.map((c) => (
            <details key={c.id} className="rounded-lg border border-black/10">
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${c.ativo ? 'bg-selo' : 'bg-black/20'}`} />
                <span className="font-medium">{c.nome}</span>
                <span className="truncate text-black/40">{(c.palavras_chave as string[]).join(', ')}</span>
              </summary>
              <div className="border-t border-black/5 p-3">
                <FormAcao acao={salvarCategoria}>
                  <input type="hidden" name="id" value={c.id} />
                  <SegmentoCampos c={c} />
                </FormAcao>
              </div>
            </details>
          ))}
          <details className="rounded-lg border border-dashed border-black/20">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">+ Novo segmento</summary>
            <div className="p-3">
              <FormAcao acao={salvarCategoria} limpar>
                <SegmentoCampos />
              </FormAcao>
            </div>
          </details>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-2">Usuários autorizados</h2>
        <ul className="text-sm">{users?.map((u) => <li key={u.id}>{u.nome} <span className="text-xs text-black/40">{u.id}</span></li>)}</ul>
        <p className="mt-2 text-xs text-black/50">Para incluir alguém: crie o login em Supabase &gt; Authentication e adicione o ID na tabela users (passo a passo no README).</p>
      </section>

      <section className="card">
        <h2 className="mb-2">Últimas buscas</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-black/50">
            <tr><th className="py-1">Quando</th><th>Modo</th><th>Status</th><th>Encontradas</th><th>Segmentos</th><th>Erros</th></tr>
          </thead>
          <tbody>
            {rels?.map((r) => (
              <tr key={r.id} className="border-t border-black/5">
                <td className="py-1">{dataBR(r.iniciado_em, true)}</td>
                <td>{r.modo}</td>
                <td>{r.status}</td>
                <td>{r.encontradas}</td>
                <td>{r.pre_filtradas}</td>
                <td title={JSON.stringify(r.erros)}>{(r.erros as unknown[]).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function SegmentoCampos({ c }: { c?: any }) {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="sm:col-span-2"><label className="label">Nome</label><input name="nome" className="input" defaultValue={c?.nome} required /></div>
        <div>
          <label className="label">Complexidade (triagem)</label>
          <select name="complexidade" className="input" defaultValue={c?.complexidade ?? 'media'}>
            <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option>
          </select>
        </div>
      </div>
      <div><label className="label">Palavras-chave</label><textarea name="palavras_chave" rows={2} className="input" defaultValue={(c?.palavras_chave ?? []).join(', ')} /></div>
      <div><label className="label">Termos a excluir</label><textarea name="exclusoes" rows={2} className="input" defaultValue={(c?.exclusoes ?? []).join(', ')} /></div>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="ativo" defaultChecked={c?.ativo ?? true} /> Ativo</label>
    </>
  );
}
