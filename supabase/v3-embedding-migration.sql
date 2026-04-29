-- Migration: switch memory_chunks from vector(1536) to vector(1024)
-- Run this in Supabase SQL Editor AFTER deploying text-embedding-v3.
-- WARNING: clears all existing embeddings (1536-dim vectors are unusable with 1024-dim model).

-- 1. Drop the HNSW index (required before altering column type)
drop index if exists idx_memory_chunks_embedding_hnsw;
drop index if exists memory_chunks_embedding_idx;

-- 2. Clear existing embeddings (dimension mismatch makes old vectors unusable)
update public.memory_chunks set embedding = null;

-- 3. Change column type to 1024 dims
alter table public.memory_chunks
  alter column embedding type vector(1024);

-- 4. Recreate HNSW index for 1024 dims
create index idx_memory_chunks_embedding_hnsw
  on public.memory_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- 5. Drop ALL overloaded versions of match_memory (avoids "function name is not unique" error)
do $$
declare
  r record;
begin
  for r in
    select oid::regprocedure::text as sig
    from pg_proc
    where proname = 'match_memory'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end;
$$;

-- 6. Recreate match_memory() with updated vector dimension.
--    Parameter names and return columns are kept identical to v2 so rag.ts needs no changes.
create or replace function public.match_memory(
  query_embedding  vector(1024),
  target_user_id   uuid,
  match_k          integer default 5,
  match_threshold  float   default 0.60
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

-- 7. Re-grant execute permissions
grant execute on function public.match_memory to service_role;
grant execute on function public.match_memory to anon;
grant execute on function public.match_memory to authenticated;
