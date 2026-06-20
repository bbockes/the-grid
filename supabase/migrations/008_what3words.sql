-- what3words precise placement. Safe to re-run.

alter table public.user_locations
  add column if not exists location_mode text not null default 'gps';

alter table public.user_locations
  add column if not exists what3words text;

alter table public.user_locations
  drop constraint if exists user_locations_location_mode_check;

alter table public.user_locations
  add constraint user_locations_location_mode_check
  check (location_mode in ('gps', 'what3words'));
