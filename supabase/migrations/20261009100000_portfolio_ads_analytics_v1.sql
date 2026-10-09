begin;

create table if not exists public.portfolio_ad_settings_v1 (
  id text primary key default 'primary',
  tiktok_pixel_id text,
  tiktok_access_token_encrypted text,
  enabled boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint portfolio_ad_settings_v1_singleton check (id = 'primary'),
  constraint portfolio_ad_settings_v1_pixel_format check (
    tiktok_pixel_id is null or tiktok_pixel_id ~ '^[A-Za-z0-9_-]{5,80}$'
  )
);

create table if not exists public.portfolio_ad_events_v1 (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  occurred_at timestamptz not null default now(),
  event_name text not null,
  portfolio_id uuid not null,
  portfolio_slug text not null,
  session_id_hash text not null,
  source text not null default 'direct',
  medium text not null default 'none',
  campaign text not null default '(not set)',
  content text,
  term text,
  click_id_hash text,
  referrer_host text,
  device_type text not null default 'unknown',
  country_code text,
  marketing_consent boolean not null default false,
  provider_delivery_status text not null default 'not_requested',
  created_at timestamptz not null default now(),
  constraint portfolio_ad_events_v1_event_name check (
    event_name in ('ViewContent', 'ClickButton', 'Contact', 'SubmitForm', 'CompleteRegistration', 'Purchase')
  ),
  constraint portfolio_ad_events_v1_session_hash check (session_id_hash ~ '^[a-f0-9]{64}$'),
  constraint portfolio_ad_events_v1_click_hash check (click_id_hash is null or click_id_hash ~ '^[a-f0-9]{64}$'),
  constraint portfolio_ad_events_v1_country check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint portfolio_ad_events_v1_provider_status check (
    provider_delivery_status in ('not_requested', 'pending', 'sent', 'failed', 'disabled')
  )
);

create index if not exists portfolio_ad_events_v1_occurred_at_idx
  on public.portfolio_ad_events_v1 (occurred_at desc);
create index if not exists portfolio_ad_events_v1_campaign_idx
  on public.portfolio_ad_events_v1 (source, campaign, occurred_at desc);
create index if not exists portfolio_ad_events_v1_portfolio_idx
  on public.portfolio_ad_events_v1 (portfolio_id, occurred_at desc);
create index if not exists portfolio_ad_events_v1_session_idx
  on public.portfolio_ad_events_v1 (session_id_hash, occurred_at desc);

alter table public.portfolio_ad_settings_v1 enable row level security;
alter table public.portfolio_ad_events_v1 enable row level security;

revoke all on table public.portfolio_ad_settings_v1 from anon, authenticated;
revoke all on table public.portfolio_ad_events_v1 from anon, authenticated;

comment on table public.portfolio_ad_events_v1 is
  'Consent-gated, pseudonymous first-party portfolio campaign events. Raw IP, user agent, email, and TikTok click IDs are not stored.';

commit;
