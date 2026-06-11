-- Run in Supabase SQL Editor if you already ran setup.sql earlier

alter table public.user_locations
  add column if not exists is_active boolean not null default true;

update public.user_locations set is_active = true where is_active is null;
