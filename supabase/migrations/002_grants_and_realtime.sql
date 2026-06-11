-- Run this if location sharing shows "1 online" but peers never appear.
-- Safe to re-run (uses IF NOT EXISTS / DO blocks where needed).

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_locations to authenticated;

alter table public.user_locations replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.user_locations;
exception
  when duplicate_object then null;
end $$;
