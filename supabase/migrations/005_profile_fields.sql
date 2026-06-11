-- Run in Supabase SQL Editor to add description and social links

alter table public.profiles
  add column if not exists description text;

alter table public.profiles
  add column if not exists social_links jsonb not null default '[]'::jsonb;
