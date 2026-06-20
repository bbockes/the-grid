-- Replace what3words mode with free click-to-pin mode. Safe to re-run.

update public.user_locations
set location_mode = 'pin'
where location_mode = 'what3words';

alter table public.user_locations
  drop constraint if exists user_locations_location_mode_check;

alter table public.user_locations
  add constraint user_locations_location_mode_check
  check (location_mode in ('gps', 'pin'));
