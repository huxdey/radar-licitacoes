-- Controle da busca sob encomenda: quando cada estado+modalidade foi baixado pela última vez
create table if not exists public.buscas_cache (
  uf text not null,
  modalidade int not null,
  feito_em timestamptz not null default now(),
  primary key (uf, modalidade)
);
alter table public.buscas_cache enable row level security;
drop policy if exists membros on public.buscas_cache;
create policy membros on public.buscas_cache for all to authenticated using (public.is_member()) with check (public.is_member());
create index if not exists tenders_uf_pub_idx on public.tenders (uf, data_publicacao);
