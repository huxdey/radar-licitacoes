export const STATUS_CASO: { id: string; rotulo: string; grupo: 'analise' | 'andamento' | 'concluido'; cor: string }[] = [
  { id: 'em_analise', rotulo: 'Em análise', grupo: 'analise', cor: 'bg-slate-100 text-slate-700' },
  { id: 'separado', rotulo: 'Separado', grupo: 'analise', cor: 'bg-slate-100 text-slate-700' },
  { id: 'documentacao_solicitada', rotulo: 'Documentação solicitada', grupo: 'andamento', cor: 'bg-amber-100 text-amber-800' },
  { id: 'conferencia_documental', rotulo: 'Conferência documental', grupo: 'andamento', cor: 'bg-sky-100 text-sky-800' },
  { id: 'com_pendencias', rotulo: 'Com pendências', grupo: 'andamento', cor: 'bg-orange-100 text-orange-800' },
  { id: 'pronto_revisao_final', rotulo: 'Pronto para revisão final', grupo: 'andamento', cor: 'bg-emerald-100 text-emerald-800' },
  { id: 'preparado_envio', rotulo: 'Preparado para envio', grupo: 'andamento', cor: 'bg-emerald-100 text-emerald-800' },
  { id: 'proposta_enviada', rotulo: 'Proposta enviada', grupo: 'andamento', cor: 'bg-indigo-100 text-indigo-800' },
  { id: 'em_disputa', rotulo: 'Em disputa', grupo: 'andamento', cor: 'bg-indigo-100 text-indigo-800' },
  { id: 'em_resultado', rotulo: 'Em resultado', grupo: 'andamento', cor: 'bg-violet-100 text-violet-800' },
  { id: 'ganho', rotulo: 'Ganho', grupo: 'concluido', cor: 'bg-green-600 text-white' },
  { id: 'perdido', rotulo: 'Perdido', grupo: 'concluido', cor: 'bg-red-100 text-red-700' },
  { id: 'cancelado', rotulo: 'Cancelado', grupo: 'concluido', cor: 'bg-zinc-200 text-zinc-600' },
];
export const statusInfo = (id: string) => STATUS_CASO.find((s) => s.id === id) ?? STATUS_CASO[0];

export const STATUS_CHECK: Record<string, { rotulo: string; cor: string }> = {
  ok: { rotulo: 'Conferido', cor: 'bg-emerald-100 text-emerald-800' },
  faltando: { rotulo: 'Faltando', cor: 'bg-red-100 text-red-700' },
  vencido: { rotulo: 'Vencido', cor: 'bg-red-100 text-red-700' },
  divergente: { rotulo: 'Divergente', cor: 'bg-orange-100 text-orange-800' },
  ilegivel: { rotulo: 'Ilegível', cor: 'bg-orange-100 text-orange-800' },
  revisao_humana: { rotulo: 'Revisar', cor: 'bg-amber-100 text-amber-800' },
};

export const brl = (v?: number | string | null) =>
  v === null || v === undefined || v === '' ? 'Não informado' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const dataBR = (d?: string | null, hora = false) =>
  d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', ...(hora ? { timeStyle: 'short' } : {}) }) : 'Não informado';

export const diasAte = (d?: string | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000) : null);
