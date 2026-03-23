-- Enable extensions
create extension if not exists "pgcrypto";

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Chats
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Chat',
  model text not null default 'qwen-max',
  temperature numeric(4,3) not null default 0.2,
  max_tokens integer not null default 4096,
  system_prompt text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chats_user_id_created_at on public.chats (user_id, created_at desc);

-- Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content text not null,
  model text,
  tokens_input integer,
  tokens_output integer,
  latency_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_chat_id_created_at on public.messages (chat_id, created_at asc);

-- Update timestamp trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_chats_updated_at on public.chats;
create trigger trg_chats_updated_at
before update on public.chats
for each row execute function public.set_updated_at();

-- Row-level security
alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;

-- Profiles policies
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Chats policies
drop policy if exists "chats_select_own" on public.chats;
create policy "chats_select_own"
on public.chats for select
using (auth.uid() = user_id);

drop policy if exists "chats_insert_own" on public.chats;
create policy "chats_insert_own"
on public.chats for insert
with check (auth.uid() = user_id);

drop policy if exists "chats_update_own" on public.chats;
create policy "chats_update_own"
on public.chats for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "chats_delete_own" on public.chats;
create policy "chats_delete_own"
on public.chats for delete
using (auth.uid() = user_id);

-- Messages policies
drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own"
on public.messages for select
using (
  exists (
    select 1 from public.chats c
    where c.id = messages.chat_id and c.user_id = auth.uid()
  )
);

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
on public.messages for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.chats c
    where c.id = messages.chat_id and c.user_id = auth.uid()
  )
);

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own"
on public.messages for delete
using (
  exists (
    select 1 from public.chats c
    where c.id = messages.chat_id and c.user_id = auth.uid()
  )
);

-- Realtime publication (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chats'
  ) then
    alter publication supabase_realtime add table public.chats;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
