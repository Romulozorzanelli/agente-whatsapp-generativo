-- =====================================================================
-- Agente de WhatsApp Generativo — base de conhecimento (RAG) + dúvidas
-- Aplicar como migration: agente_conhecimento
-- Embeddings: OpenAI text-embedding-3-small (1536 dimensões)
-- =====================================================================

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------
-- Conhecimento: perguntas e respostas + situações
-- ---------------------------------------------------------------------
create table if not exists public.conhecimento (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('pergunta_resposta', 'situacao')),
  titulo      text not null,          -- pergunta OU situação
  conteudo    text not null,          -- resposta OU como lidar
  observacao  text,
  tags        text[] not null default '{}',
  ativo       boolean not null default true,
  embedding   extensions.vector(1536),
  criado_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists conhecimento_embedding_idx
  on public.conhecimento using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists conhecimento_tipo_idx on public.conhecimento (tipo, ativo);

-- ---------------------------------------------------------------------
-- Dúvidas: o que o agente não soube responder
-- ---------------------------------------------------------------------
create table if not exists public.duvidas (
  id                 uuid primary key default gen_random_uuid(),
  pergunta           text not null,
  contexto           text,
  contato            text,
  ocorrencias        integer not null default 1,
  status             text not null default 'pendente'
                     check (status in ('pendente', 'respondida', 'descartada')),
  conhecimento_id    uuid references public.conhecimento(id) on delete set null,
  embedding          extensions.vector(1536),
  created_at         timestamptz not null default now(),
  ultima_ocorrencia  timestamptz not null default now()
);

create index if not exists duvidas_status_idx on public.duvidas (status, ocorrencias desc);
create index if not exists duvidas_embedding_idx
  on public.duvidas using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------
-- Busca semântica na base
-- ---------------------------------------------------------------------
create or replace function public.buscar_conhecimento(
  query_embedding      extensions.vector(1536),
  limite_similaridade  float default 0.45,
  quantidade           int   default 5
)
returns table (
  id uuid, tipo text, titulo text, conteudo text, observacao text, similaridade float
)
language sql stable
set search_path = public, extensions
as $$
  select c.id, c.tipo, c.titulo, c.conteudo, c.observacao,
         1 - (c.embedding <=> query_embedding) as similaridade
  from public.conhecimento c
  where c.ativo
    and c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) >= limite_similaridade
  order by c.embedding <=> query_embedding
  limit quantidade;
$$;

-- ---------------------------------------------------------------------
-- Dúvida pendente parecida (para não duplicar)
-- ---------------------------------------------------------------------
create or replace function public.duvida_parecida(
  query_embedding  extensions.vector(1536),
  limite           float default 0.88
)
returns table (id uuid, ocorrencias int, similaridade float)
language sql stable
set search_path = public, extensions
as $$
  select d.id, d.ocorrencias, 1 - (d.embedding <=> query_embedding) as similaridade
  from public.duvidas d
  where d.status = 'pendente'
    and d.embedding is not null
    and 1 - (d.embedding <=> query_embedding) >= limite
  order by d.embedding <=> query_embedding
  limit 1;
$$;

-- As funções só são chamadas pela Edge Function (service_role)
revoke execute on function public.buscar_conhecimento(extensions.vector, float, int) from public, anon, authenticated;
revoke execute on function public.duvida_parecida(extensions.vector, float) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS: só usuários logados (equipe) acessam pelo painel.
-- Cadastro público deve ficar DESATIVADO no Supabase Auth.
-- ---------------------------------------------------------------------
alter table public.conhecimento enable row level security;
alter table public.duvidas      enable row level security;

drop policy if exists "equipe_conhecimento" on public.conhecimento;
create policy "equipe_conhecimento" on public.conhecimento
  for all to authenticated using (true) with check (true);

drop policy if exists "equipe_duvidas" on public.duvidas;
create policy "equipe_duvidas" on public.duvidas
  for all to authenticated using (true) with check (true);

-- Ao editar o texto direto no banco, o embedding precisa ser refeito:
-- limpa o embedding para o botão "Indexar pendentes" reprocessar.
create or replace function public.conhecimento_limpa_embedding()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if (new.titulo is distinct from old.titulo
      or new.conteudo is distinct from old.conteudo
      or new.observacao is distinct from old.observacao)
     and new.embedding is not distinct from old.embedding then
    new.embedding := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists conhecimento_limpa_embedding on public.conhecimento;
create trigger conhecimento_limpa_embedding
  before update on public.conhecimento
  for each row execute function public.conhecimento_limpa_embedding();
