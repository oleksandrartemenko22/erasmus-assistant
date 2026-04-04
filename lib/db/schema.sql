-- lib/db/schema.sql

-- Enable pgvector extension
create extension if not exists vector;

-- ─────────────────────────────────────────
-- Documents
-- ─────────────────────────────────────────
create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  source_type   text not null check (source_type in ('pdf','txt','docx','faq','url')),
  original_url  text,
  language      text not null default 'en',
  topic         text,
  faculty       text,
  valid_from    date,
  valid_to      date,
  is_active     boolean not null default true,
  version       integer not null default 1,
  storage_path  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- Document chunks (with embeddings)
-- ─────────────────────────────────────────
create table if not exists document_chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents(id) on delete cascade,
  chunk_index   integer not null,
  content       text not null,
  token_count   integer,
  embedding     vector(1536),
  created_at    timestamptz not null default now()
);

create index if not exists document_chunks_document_id_idx
  on document_chunks(document_id);

-- IVFFlat index for approximate nearest-neighbour search
-- (run AFTER initial data load for best performance)
-- create index if not exists document_chunks_embedding_idx
--   on document_chunks using ivfflat (embedding vector_cosine_ops)
--   with (lists = 100);

-- ─────────────────────────────────────────
-- Chat sessions
-- ─────────────────────────────────────────
create table if not exists chat_sessions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  language      text not null default 'en',
  user_agent    text
);

-- ─────────────────────────────────────────
-- Messages
-- ─────────────────────────────────────────
create table if not exists messages (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references chat_sessions(id) on delete cascade,
  role                text not null check (role in ('user','assistant')),
  content             text not null,
  retrieved_chunk_ids uuid[],
  confidence_flag     text not null default 'none' check (confidence_flag in ('high','medium','low','none')),
  escalation_flag     boolean not null default false,
  created_at          timestamptz not null default now()
);

create index if not exists messages_session_id_idx on messages(session_id);

-- ─────────────────────────────────────────
-- Feedback
-- ─────────────────────────────────────────
create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references messages(id) on delete cascade,
  rating      text not null check (rating in ('helpful','not_helpful')),
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- Escalation requests
-- ─────────────────────────────────────────
create table if not exists escalation_requests (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid references messages(id) on delete set null,
  reason      text,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- FAQ items (inline curated content)
-- ─────────────────────────────────────────
create table if not exists faq_items (
  id          uuid primary key default gen_random_uuid(),
  question    text not null,
  answer      text not null,
  topic       text,
  language    text not null default 'en',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- Admins (simple email+password via Supabase Auth)
-- ─────────────────────────────────────────
create table if not exists admins (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- Updated_at trigger helper
-- ─────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger documents_updated_at
  before update on documents
  for each row execute function set_updated_at();

create or replace trigger faq_items_updated_at
  before update on faq_items
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────
-- RPC: similarity search over active chunks
-- ─────────────────────────────────────────
create or replace function match_chunks(
  query_embedding vector(1536),
  match_count     int default 5,
  min_similarity  float default 0.3
)
returns table (
  id              uuid,
  document_id     uuid,
  chunk_index     int,
  content         text,
  similarity      float,
  doc_title       text,
  doc_source_type text,
  doc_language    text,
  doc_topic       text,
  doc_valid_from  date,
  doc_valid_to    date,
  doc_is_active   boolean
)
language sql stable as $$
  select
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity,
    d.title        as doc_title,
    d.source_type  as doc_source_type,
    d.language     as doc_language,
    d.topic        as doc_topic,
    d.valid_from   as doc_valid_from,
    d.valid_to     as doc_valid_to,
    d.is_active    as doc_is_active
  from document_chunks dc
  join documents d on d.id = dc.document_id
  where d.is_active = true
    and (d.valid_to is null or d.valid_to >= current_date)
    and 1 - (dc.embedding <=> query_embedding) >= min_similarity
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
