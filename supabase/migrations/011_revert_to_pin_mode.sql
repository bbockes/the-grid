-- Pin square mode. Safe to re-run.
-- Adds location_mode / what3words if missing, then sets pin mode constraint.

alter table public.user_locations
  add column if not exists location_mode text not null default 'gps';

alter table public.user_locations
  add column if not exists what3words text;

update public.user_locations
set location_mode = 'pin'
where location_mode in ('precise', 'what3words');

update public.user_locations
set what3words = null
where location_mode = 'pin';

alter table public.user_locations
  drop constraint if exists user_locations_location_mode_check;

alter table public.user_locations
  add constraint user_locations_location_mode_check
  check (location_mode in ('gps', 'pin'));
