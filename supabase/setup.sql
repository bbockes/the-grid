-- ============================================================
-- The Grid — full database setup
-- Paste this entire file into Supabase → SQL Editor → Run
-- ============================================================

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null,
  avatar_url text,
  description text,
  social_links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_locations (
  user_id uuid references auth.users on delete cascade primary key,
  world_x double precision not null,
  world_y double precision not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_locations enable row level security;

drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select to authenticated using (true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

drop policy if exists "Locations are viewable by authenticated users" on public.user_locations;
create policy "Locations are viewable by authenticated users"
  on public.user_locations for select to authenticated using (true);

drop policy if exists "Users can insert own location" on public.user_locations;
create policy "Users can insert own location"
  on public.user_locations for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own location" on public.user_locations;
create policy "Users can update own location"
  on public.user_locations for update to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can delete own location" on public.user_locations;
create policy "Users can delete own location"
  on public.user_locations for delete to authenticated using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1),
      'Anonymous'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.user_locations replica identity full;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_locations to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.user_locations;
exception
  when duplicate_object then null;
end $$;

-- Backfill profiles for users who signed up before this script ran
insert into public.profiles (id, display_name)
select
  id,
  coalesce(
    raw_user_meta_data ->> 'display_name',
    split_part(email, '@', 1),
    'Anonymous'
  )
from auth.users
on conflict (id) do nothing;

-- Profile photo uploads (Storage)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Direct messages
-- (full migration also in supabase/migrations/006_messaging.sql)

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid references public.conversations on delete cascade,
  user_id uuid references auth.users on delete cascade,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_participants_user_id_idx
  on public.conversation_participants (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations on delete cascade not null,
  sender_id uuid references auth.users on delete cascade not null,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);

create or replace function public.touch_conversation_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute function public.touch_conversation_updated_at();

create or replace function public.get_or_create_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_id uuid;
  my_id uuid := auth.uid();
begin
  if my_id is null then
    raise exception 'Not authenticated';
  end if;

  if other_user_id = my_id then
    raise exception 'Cannot message yourself';
  end if;

  select cp1.conversation_id into conv_id
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp1.conversation_id = cp2.conversation_id
  where cp1.user_id = my_id
    and cp2.user_id = other_user_id
  limit 1;

  if conv_id is not null then
    return conv_id;
  end if;

  insert into public.conversations default values returning id into conv_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (conv_id, my_id),
    (conv_id, other_user_id);

  return conv_id;
end;
$$;

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
  );
$$;

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Users view own conversations" on public.conversations;
create policy "Users view own conversations"
  on public.conversations for select to authenticated
  using (public.is_conversation_member(id));

drop policy if exists "Users view participants in their conversations" on public.conversation_participants;
create policy "Users view participants in their conversations"
  on public.conversation_participants for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Users view messages in their conversations" on public.messages;
create policy "Users view messages in their conversations"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Users send messages in their conversations" on public.messages;
create policy "Users send messages in their conversations"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

grant select on public.conversations to authenticated;
grant select on public.conversation_participants to authenticated;
grant select, insert on public.messages to authenticated;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;

alter table public.messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;
