-- GPS-only: drop pin/precise location columns. Safe to re-run.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_locations'
      and column_name = 'location_mode'
  ) then
    update public.user_locations
    set location_mode = 'gps'
    where location_mode is distinct from 'gps';
  end if;
end $$;

alter table public.user_locations
  drop constraint if exists user_locations_location_mode_check;

alter table public.user_locations
  drop column if exists what3words;

alter table public.user_locations
  drop column if exists location_mode;
