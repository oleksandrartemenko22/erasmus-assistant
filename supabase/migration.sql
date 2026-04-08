-- supabase/migration.sql
-- Run this in the Supabase SQL editor to set up the Erasmus Assistant schema.
-- Requires the pgvector extension (enabled by default on Supabase).

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists vector;

-- ============================================================
-- documents
-- ============================================================
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  source_type text not null check (source_type in ('pdf', 'txt', 'docx', 'faq', 'webpage')),
  original_url text,
  language    text not null default 'en',
  topic       text,
  faculty     text,
  valid_from  date,
  valid_to    date,
  is_active   boolean not null default true,
  version     integer not null default 1,
  storage_path text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_documents_is_active on documents (is_active);

-- Auto-update updated_at
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_documents_updated_at on documents;
create trigger trg_documents_updated_at
  before update on documents
  for each row execute function update_updated_at_column();

-- ============================================================
-- document_chunks
-- ============================================================
create table if not exists document_chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents (id) on delete cascade,
  chunk_index   integer not null,
  content       text not null,
  token_count   integer not null default 0,
  -- text-embedding-3-small produces 1536-dimensional vectors
  embedding     vector(1536),
  created_at    timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists idx_chunks_document_id on document_chunks (document_id);
-- IVFFlat index for approximate nearest-neighbour search (tune lists based on row count)
create index if not exists idx_chunks_embedding on document_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================================
-- chat_sessions
-- ============================================================
create table if not exists chat_sessions (
  id         uuid primary key default gen_random_uuid(),
  language   text not null default 'en',
  user_agent text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- messages
-- ============================================================
create table if not exists messages (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references chat_sessions (id) on delete cascade,
  role                 text not null check (role in ('user', 'assistant')),
  content              text not null,
  retrieved_chunk_ids  uuid[],
  confidence_flag      text check (confidence_flag in ('high', 'low', 'none')),
  escalation_flag      boolean not null default false,
  created_at           timestamptz not null default now()
);

create index if not exists idx_messages_session_id on messages (session_id);
create index if not exists idx_messages_role on messages (role);
create index if not exists idx_messages_escalation on messages (escalation_flag);

-- ============================================================
-- feedback
-- ============================================================
create table if not exists feedback (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages (id) on delete cascade,
  rating     text not null check (rating in ('helpful', 'not_helpful')),
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_message_id on feedback (message_id);

-- ============================================================
-- escalation_requests
-- ============================================================
create table if not exists escalation_requests (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid references messages (id) on delete set null,
  reason     text check (reason in ('no_sources', 'low_confidence', 'conflicting_sources', 'legal_visa_topic', 'user_request')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- faq_items
-- ============================================================
create table if not exists faq_items (
  id         uuid primary key default gen_random_uuid(),
  question   text not null,
  answer     text not null,
  language   text not null default 'en',
  topic      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_faq_updated_at on faq_items;
create trigger trg_faq_updated_at
  before update on faq_items
  for each row execute function update_updated_at_column();

-- ============================================================
-- admins (simple table for future auth expansion)
-- ============================================================
create table if not exists admins (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- match_chunks RPC
-- Called by SupabaseRetriever to find nearest-neighbour chunks
-- Only returns chunks from active, non-expired documents
-- ============================================================
create or replace function match_chunks(
  query_embedding vector(1536),
  match_count     integer default 5,
  min_score       float   default 0.5
)
returns table (
  id              uuid,
  document_id     uuid,
  content         text,
  similarity      float,
  document_title  text,
  document_url    text,
  valid_from      date,
  valid_to        date
)
language sql stable as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity,
    d.title as document_title,
    d.original_url as document_url,
    d.valid_from,
    d.valid_to
  from document_chunks dc
  join documents d on d.id = dc.document_id
  where d.is_active = true
    and (d.valid_from is null or d.valid_from <= current_date)
    and (d.valid_to   is null or d.valid_to   >= current_date)
    and 1 - (dc.embedding <=> query_embedding) >= min_score
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- Row Level Security
-- The backend connects with the service_role key, which carries
-- BYPASSRLS in PostgreSQL — enabling RLS is therefore enough to
-- block anon/public access entirely.  The explicit policies below
-- make the intent unambiguous and future-proof against any change
-- in how the connection role is configured.
-- ============================================================

-- Enable RLS on every table
ALTER TABLE documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback            ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins              ENABLE ROW LEVEL SECURITY;

-- Grant service_role full access; all other roles are denied by default
CREATE POLICY "service_role_all" ON documents
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON document_chunks
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON chat_sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON messages
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON feedback
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON escalation_requests
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON faq_items
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON admins
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- Storage bucket (run separately in Supabase dashboard or CLI)
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('documents', 'documents', false);
