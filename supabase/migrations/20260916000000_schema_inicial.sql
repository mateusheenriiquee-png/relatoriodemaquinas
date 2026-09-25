-- =============================================================================
-- Esquema inicial — migração do Firestore (suportetecnico-api2) para Supabase.
--
-- Nomes em snake_case: o motivo da migração inclui relatórios em SQL, e é
-- assim que quem escreve SQL espera encontrar as colunas. O painel continua
-- em camelCase; a conversão fica na camada de serviço do front e do Worker.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent() não é IMMUTABLE e por isso não pode entrar em índice nem em coluna
-- gerada. O wrapper fixa o dicionário, o que torna o resultado estável.
create or replace function public.sem_acento(texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(texto, ''));
$$;

-- -----------------------------------------------------------------------------
-- usuarios — perfil do painel, 1:1 com auth.users.
-- O cargo daqui (e não do token) é a fonte da verdade para permissão.
-- -----------------------------------------------------------------------------
create table public.usuarios (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null default '',
  cargo        text not null default 'Operador'
               check (cargo in ('Operador', 'Atendente', 'Supervisor', 'Administrador')),
  status       text not null default 'ativo',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- suportes — era a coleção suportes_tecnicos.
--
-- id é TEXT de propósito: os IDs do Firestore são preservados. O webhook do
-- Kommo grava em `kommo_lead_<id>` e a importação de planilha em
-- `support_<protocolo>_<cpf>_<data>`; trocar por uuid faria o próximo evento
-- do Kommo duplicar o chamado em vez de atualizá-lo.
-- -----------------------------------------------------------------------------
create table public.suportes (
  id                      text primary key default gen_random_uuid()::text,

  -- identificação e cliente
  protocolo               text not null default '',
  nome_cliente            text not null default '',
  responsavel_abertura    text not null default '',
  cpf_cnpj                text not null default '',
  contato                 text not null default '',

  -- atendimento
  tipo                    text not null default '',
  ac                      text not null default '',
  tecnico                 text not null default '',
  turno                   text not null default '',
  status                  text not null default 'EM ABERTO'
                          check (status in ('EM ABERTO', 'EM ANDAMENTO', 'FINALIZADO', 'SEM RETORNO', 'REAGENDADO')),
  status_abertura         text not null default '',
  descricao               text not null default '',
  observacao_tecnico      text not null default '',
  anotacoes               text not null default '',
  motivo                  text not null default '',        -- motivo do "sem retorno"
  motivo_indevido         text not null default '',

  -- classificação das métricas
  motivo_cat              text not null default '',
  motivo_detalhe          text not null default '',
  uso_cat                 text not null default '',
  uso_plat                text not null default '',
  excluir_da_media        boolean not null default false,
  justificativa_media     text not null default '',
  fora_da_media           boolean not null default false,
  followups_importados    integer not null default 0,

  -- linha do tempo (listas de {em, texto, por} e de tentativas de contato)
  historico               jsonb not null default '[]'::jsonb,
  followups               jsonb not null default '[]'::jsonb,

  -- datas: no Firestore eram strings ISO; aqui são timestamps de verdade, o que
  -- é o que torna os relatórios por período possíveis em SQL.
  data_abertura           timestamptz,
  data_inicio_atendimento timestamptz,
  data_finalizacao        timestamptz,
  data_reagendamento      timestamptz,

  -- venda ligada ao chamado
  valor_venda             numeric(12, 2) not null default 0,
  venda_status            text check (venda_status in ('GANHO', 'PERDIDO')),

  -- Campos que o webhook recebe e o esquema não conhece. O Firestore aceitava
  -- qualquer campo; sem esta coluna, o que vier a mais seria descartado.
  extras                  jsonb not null default '{}'::jsonb,

  -- origem e integração
  origem_integracao       text not null default '',
  idempotency_key         text,
  kommo_lead_id           text unique,
  kommo_pipeline_id       text,
  kommo_status_id         text,
  kommo_responsible_id    text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Texto de busca: sem acento e em minúsculas, gerado pelo próprio banco.
  -- Substitui o nomeClienteKey/tecnicoKey que o front precisava calcular e
  -- gravar à mão — aqui não há como esquecer de atualizar.
  busca text generated always as (
    lower(public.sem_acento(
      protocolo || ' ' || nome_cliente || ' ' || cpf_cnpj || ' ' || contato || ' ' || responsavel_abertura
    ))
  ) stored
);

create index suportes_data_abertura_idx on public.suportes (data_abertura desc);
create index suportes_status_idx        on public.suportes (status);
create index suportes_tecnico_idx       on public.suportes (tecnico);
create index suportes_ac_idx            on public.suportes (ac);
create index suportes_finalizacao_idx   on public.suportes (data_finalizacao desc);
-- Trigrama: busca por TRECHO no banco inteiro ("ramos" acha "Bruno Ramos").
-- No Firestore só dava por prefixo.
create index suportes_busca_trgm_idx    on public.suportes using gin (busca extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- config — era a coleção config (metricas, kommo, admin_email).
-- -----------------------------------------------------------------------------
create table public.config (
  chave      text primary key,
  valor      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- audit_logs — escrito só pelo backend.
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  dados      jsonb not null default '{}'::jsonb
);

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger usuarios_updated_at before update on public.usuarios
  for each row execute function public.tocar_updated_at();
create trigger suportes_updated_at before update on public.suportes
  for each row execute function public.tocar_updated_at();
create trigger config_updated_at before update on public.config
  for each row execute function public.tocar_updated_at();

-- =============================================================================
-- Permissões (RLS) — tradução do firestore.rules.
-- =============================================================================

-- SECURITY DEFINER para ler o cargo sem esbarrar na própria RLS de usuarios.
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.usuarios
    where id = (select auth.uid()) and cargo = 'Administrador'
  );
$$;

-- Cargo de quem está logado. Existe por um motivo: uma política de `usuarios`
-- que consultasse `usuarios` diretamente dá "infinite recursion detected in
-- policy" — o Postgres reavalia a política ao expandir a própria subconsulta.
-- SECURITY DEFINER lê a linha sem passar pela RLS e quebra o ciclo.
create or replace function public.meu_cargo()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select cargo from public.usuarios where id = (select auth.uid());
$$;

alter table public.usuarios   enable row level security;
alter table public.suportes   enable row level security;
alter table public.config     enable row level security;
alter table public.audit_logs enable row level security;

-- usuarios: todo logado lê; só admin cria e exclui; cada um edita o próprio
-- perfil, mas sem mexer no cargo (era a auto-promoção que as regras barravam).
create policy usuarios_leitura on public.usuarios
  for select to authenticated using (true);
create policy usuarios_criacao on public.usuarios
  for insert to authenticated with check (public.eh_admin());
create policy usuarios_exclusao on public.usuarios
  for delete to authenticated using (public.eh_admin());
create policy usuarios_edicao_admin on public.usuarios
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy usuarios_edicao_propria on public.usuarios
  for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and cargo = public.meu_cargo()
  );

-- suportes: todo logado lê, cria e edita; excluir é só de admin.
create policy suportes_leitura on public.suportes
  for select to authenticated using (true);
create policy suportes_criacao on public.suportes
  for insert to authenticated with check (true);
create policy suportes_edicao on public.suportes
  for update to authenticated using (true) with check (true);
create policy suportes_exclusao on public.suportes
  for delete to authenticated using (public.eh_admin());

-- config: todo logado lê; só admin escreve.
create policy config_leitura on public.config
  for select to authenticated using (true);
create policy config_escrita on public.config
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- audit_logs: só admin lê; ninguém escreve pelo cliente (o backend usa a
-- service_role, que ignora RLS).
create policy audit_logs_leitura on public.audit_logs
  for select to authenticated using (public.eh_admin());

-- =============================================================================
-- Tempo real — o painel escuta suportes, usuarios e config ao vivo,
-- como fazia com onSnapshot.
-- =============================================================================
alter publication supabase_realtime add table public.suportes, public.usuarios, public.config;
