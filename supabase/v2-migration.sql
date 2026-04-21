-- ============================================================
-- Praxis AI Hub v2 Migration
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- Step 1: Enable pgvector extension
create extension if not exists vector;

-- Step 2: Create memory_chunks table
create table if not exists public.memory_chunks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  chat_id      uuid references public.chats(id) on delete set null,
  source_type  text not null default 'conversation', -- conversation | file | summary
  content      text not null,
  embedding    vector(1536),
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- Step 3: Indexes
create index if not exists idx_memory_chunks_user_id
  on public.memory_chunks (user_id);

create index if not exists idx_memory_chunks_embedding_hnsw
  on public.memory_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Step 4: Row-level security
alter table public.memory_chunks enable row level security;

create policy "memory_chunks_select_own"
  on public.memory_chunks for select
  using (auth.uid() = user_id);

create policy "memory_chunks_insert_own"
  on public.memory_chunks for insert
  with check (auth.uid() = user_id);

create policy "memory_chunks_delete_own"
  on public.memory_chunks for delete
  using (auth.uid() = user_id);

-- Step 5: Cosine similarity search function (security definer = bypasses RLS, safe because we filter by user_id inside)
create or replace function public.match_memory(
  query_embedding  vector(1536),
  target_user_id   uuid,
  match_k          integer default 5,
  match_threshold  float   default 0.70
)
returns table (
  id           uuid,
  content      text,
  source_type  text,
  chat_id      uuid,
  similarity   float,
  metadata     jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    mc.id,
    mc.content,
    mc.source_type,
    mc.chat_id,
    1 - (mc.embedding <=> query_embedding) as similarity,
    mc.metadata
  from public.memory_chunks mc
  where
    mc.user_id = target_user_id
    and mc.embedding is not null
    and 1 - (mc.embedding <=> query_embedding) >= match_threshold
  order by mc.embedding <=> query_embedding
  limit match_k;
end;
$$;

-- Step 6: Grant execute on the function to the service role and anon
grant execute on function public.match_memory to service_role;
grant execute on function public.match_memory to anon;
grant execute on function public.match_memory to authenticated;
