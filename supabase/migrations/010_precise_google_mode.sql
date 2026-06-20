-- Precise mode: automatic GPS + Google geocoding (replaces manual pin). Safe to re-run.

update public.user_locations
set location_mode = 'precise'
where location_mode in ('pin', 'what3words');

alter table public.user_locations
  drop constraint if exists user_locations_location_mode_check;

alter table public.user_locations
  add constraint user_locations_location_mode_check
  check (location_mode in ('gps', 'precise'));
