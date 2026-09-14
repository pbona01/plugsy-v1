-- Records only the two-letter country code supplied by Vercel for signed-in requests.
-- No IP address or precise location is stored.
alter table public.profiles
  add column if not exists analytics_country_code text,
  add column if not exists analytics_location_updated_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_analytics_country_code_format_v1;

alter table public.profiles
  add constraint profiles_analytics_country_code_format_v1
  check (analytics_country_code is null or analytics_country_code ~ '^[A-Z]{2}$');

create index if not exists profiles_analytics_country_code_v1_idx
  on public.profiles (analytics_country_code)
  where analytics_country_code is not null;
