-- Run this in the Supabase SQL editor (Dashboard → SQL → New query)

create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.user_locations (
  user_id uuid references auth.users on delete cascade primary key,
  world_x double precision not null,
  world_y double precision not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_locations enable row level security;

create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "Locations are viewable by authenticated users"
  on public.user_locations for select
  to authenticated
  using (true);

create policy "Users can insert own location"
  on public.user_locations for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own location"
  on public.user_locations for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete own location"
  on public.user_locations for delete
  to authenticated
  using (auth.uid() = user_id);

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
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.user_locations replica identity full;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_locations to authenticated;

alter publication supabase_realtime add table public.user_locations;
