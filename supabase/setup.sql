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
