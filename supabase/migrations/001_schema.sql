-- Radar de Licitações - schema inicial
-- Rode este arquivo inteiro no SQL Editor do Supabase.

create extension if not exists pgcrypto;

-- 1. Usuários autorizados (você e seu sócio). Só quem está aqui acessa os dados.
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  created_at timestamptz default now()
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  -- exige login com segundo fator (aal2) além de estar na lista de usuários
  select coalesce(auth.jwt()->>'aal', '') = 'aal2'
     and exists (select 1 from public.users where id = auth.uid());
$$;

-- 2. Configurações gerais do radar (linha única)
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  ufs text[] not null default '{SP}',                  -- vazio = Brasil inteiro
  municipios_ibge text[] not null default '{}',        -- opcional
  modalidades int[] not null default '{6,8}',          -- 6 pregão eletrônico, 8 dispensa
  valor_min numeric,
  valor_max numeric,
  dias_minimos_proposta int not null default 3,
  somente_me_epp boolean not null default false,
  incluir_atualizados boolean not null default true,
  updated_at timestamptz default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

-- 3. Segmentos monitorados
create table if not exists public.search_categories (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  palavras_chave text[] not null default '{}',
  exclusoes text[] not null default '{}',
  complexidade text not null default 'media' check (complexidade in ('baixa','media','alta')),
  ativo boolean not null default true,
  created_at timestamptz default now()
);

-- 4. Empresas atendidas
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text,
  cnpj text not null unique,
  segmentos uuid[] not null default '{}',
  cidade text,
  uf text,
  contato_nome text,
  contato_telefone text,
  contato_email text,
  observacoes text,
  created_at timestamptz default now()
);

-- 5. Licitações encontradas (uma vez só, mesmo que várias empresas participem)
create table if not exists public.tenders (
  id uuid primary key default gen_random_uuid(),
  numero_controle_pncp text unique,             -- null quando inserida manualmente sem PNCP
  orgao_cnpj text,
  ano_compra int,
  sequencial_compra int,
  numero_compra text,
  processo text,
  orgao_nome text,
  unidade_nome text,
  municipio text,
  uf text,
  modalidade_id int,
  modalidade_nome text,
  modo_disputa text,
  objeto text,
  informacao_complementar text,
  valor_estimado numeric,
  data_publicacao timestamptz,
  data_abertura_proposta timestamptz,
  data_encerramento_proposta timestamptz,
  situacao_nome text,
  link_sistema_origem text,
  srp boolean,
  me_epp_indicio boolean not null default false, -- texto sugere exclusividade/cota ME-EPP (conferir no edital)
  categorias uuid[] not null default '{}',
  score int not null default 0,                  -- quantas palavras-chave bateram
  prioritaria boolean not null default false,
  -- marcadores (separados do andamento do pregão)
  visualizado boolean not null default false,
  favorito boolean not null default false,
  ignorado boolean not null default false,
  arquivado boolean not null default false,
  origem text not null default 'pncp' check (origem in ('pncp','manual')),
  primeira_vez_visto date not null default current_date,
  ultima_conferencia_fonte timestamptz,
  raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists tenders_encerramento_idx on public.tenders (data_encerramento_proposta);
create index if not exists tenders_primeira_idx on public.tenders (primeira_vez_visto);
create index if not exists tenders_categorias_idx on public.tenders using gin (categorias);

-- 6. Arquivos públicos do edital
create table if not exists public.tender_files (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  sequencial int,
  titulo text,
  tipo text,
  url_origem text,
  storage_path text,
  tamanho_bytes bigint,
  status text not null default 'pendente' check (status in ('pendente','baixado','falhou','manual')),
  erro text,
  created_at timestamptz default now()
);

-- 7. Processos (pregão + empresa)
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  status text not null default 'separado' check (status in (
    'em_analise','separado','documentacao_solicitada','conferencia_documental','com_pendencias',
    'pronto_revisao_final','preparado_envio','proposta_enviada','em_disputa','em_resultado',
    'ganho','perdido','cancelado')),
  prazo_interno date,
  resumo jsonb,                 -- saída A da IA
  solicitacao_texto text,       -- saída B (checklist pro contador e empresa)
  analise_em timestamptz,
  viabilidade jsonb,            -- custos, capacidade, preço mínimo aprovado, riscos
  observacoes text,
  aprovado_por uuid references public.users(id),
  aprovado_em timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tender_id, company_id)
);

-- 8. Exigências extraídas do edital, por processo
create table if not exists public.requirements (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  categoria text not null check (categoria in ('juridica','fiscal','trabalhista','economico_financeira','tecnica','declaracao','proposta','outra')),
  descricao text not null,
  responsavel text not null default 'empresa' check (responsavel in ('contador','empresa','assessoria')),
  referencia text,              -- cláusula e página
  arquivo_origem text,
  revisao_humana boolean not null default false,
  ordem int not null default 0,
  created_at timestamptz default now()
);

-- 9. Documentos enviados pela empresa/contador (com versões)
create table if not exists public.company_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  nome_arquivo text not null,
  storage_path text not null,
  mime text,
  tamanho_bytes bigint,
  versao int not null default 1,
  substituido_por uuid references public.company_documents(id),
  ativo boolean not null default true,
  enviado_por uuid references public.users(id),
  created_at timestamptz default now()
);

-- 10. Resultado das auditorias
create table if not exists public.document_checks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  run_id uuid not null,
  requirement_id uuid references public.requirements(id) on delete set null,
  document_id uuid references public.company_documents(id) on delete set null,
  status text not null check (status in ('ok','faltando','vencido','divergente','ilegivel','revisao_humana')),
  titulo text not null,
  detalhe text,
  evidencia text,
  validade date,
  created_at timestamptz default now()
);
create index if not exists document_checks_run_idx on public.document_checks (case_id, run_id);

-- 11. Relatórios diários do radar
create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  modo text not null default 'diario',
  status text not null default 'rodando' check (status in ('rodando','concluido','falhou','parcial')),
  encontradas int not null default 0,
  pre_filtradas int not null default 0,
  prioritarias int not null default 0,
  por_segmento jsonb not null default '{}',
  erros jsonb not null default '[]',
  iniciado_em timestamptz default now(),
  concluido_em timestamptz
);

-- 12. Histórico de alterações
create table if not exists public.activity_logs (
  id bigserial primary key,
  user_id uuid references public.users(id) on delete set null,
  entidade text not null,
  entidade_id uuid,
  acao text not null,
  detalhe jsonb,
  created_at timestamptz default now()
);

-- RLS: tudo fechado, só membros
do $$
declare t text;
begin
  foreach t in array array['users','settings','search_categories','companies','tenders','tender_files','cases',
                           'requirements','company_documents','document_checks','daily_reports','activity_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists membros on public.%I', t);
    execute format('create policy membros on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
  end loop;
end $$;

-- Armazenamento privado
insert into storage.buckets (id, name, public) values ('licitacoes', 'licitacoes', false)
on conflict (id) do nothing;

drop policy if exists "membros leem" on storage.objects;
create policy "membros leem" on storage.objects for select to authenticated
  using (bucket_id = 'licitacoes' and public.is_member());
drop policy if exists "membros gravam" on storage.objects;
create policy "membros gravam" on storage.objects for insert to authenticated
  with check (bucket_id = 'licitacoes' and public.is_member());
drop policy if exists "membros alteram" on storage.objects;
create policy "membros alteram" on storage.objects for update to authenticated
  using (bucket_id = 'licitacoes' and public.is_member());

-- 12 segmentos iniciais
insert into public.search_categories (nome, palavras_chave, exclusoes, complexidade) values
('Limpeza e conservação', '{limpeza predial,limpeza e conservacao,higienizacao,conservacao predial,servicos gerais,servicos de limpeza}', '{limpeza urbana,coleta de lixo,residuos solidos,limpeza de fossa}', 'media'),
('Portaria', '{portaria,porteiro,recepcao,recepcionista,controle de acesso,controlador de acesso}', '{vigilancia armada,seguranca armada}', 'media'),
('Ar-condicionado', '{climatizacao,ar condicionado,ar-condicionado,instalacao de split,refrigeracao,split}', '{veicular,automotivo}', 'media'),
('Jardinagem', '{jardinagem,rocagem,rocada,paisagismo,areas verdes,poda de arvores}', '{}', 'media'),
('Gráficas', '{impressao,materiais graficos,material grafico,banner,banners,panfletos,adesivos,servicos graficos,comunicacao visual}', '{impressora,outsourcing de impressao}', 'baixa'),
('Uniformes', '{uniformes escolares,uniformes profissionais,uniforme,camisetas,confeccao}', '{}', 'media'),
('Material de escritório', '{papelaria,material de expediente,material de escritorio,suprimentos,papel a4,papel sulfite}', '{}', 'baixa'),
('Distribuidoras', '{material de limpeza,produtos de limpeza,descartaveis,fornecimento de materiais,copos descartaveis}', '{}', 'baixa'),
('Mecânica automotiva', '{manutencao de veiculos,manutencao veicular,oficina mecanica,pecas automotivas,pneus,manutencao de frota,manutencao da frota}', '{locacao de veiculos}', 'media'),
('Informática', '{computadores,notebooks,perifericos,suprimentos de informatica,microcomputadores,monitores}', '{desenvolvimento de software,fabrica de software,infraestrutura de rede}', 'media'),
('Buffet e eventos', '{buffet,coffee break,alimentacao para eventos,servicos de buffet}', '{}', 'media'),
('Controle de pragas', '{dedetizacao,desratizacao,desinsetizacao,controle de vetores,controle de pragas,descupinizacao}', '{}', 'media')
on conflict (nome) do nothing;
