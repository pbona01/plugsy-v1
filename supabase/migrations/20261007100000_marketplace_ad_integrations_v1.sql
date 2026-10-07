begin;

create table if not exists public.marketplace_ad_integrations (
  seller_id text primary key references public.profiles(clerk_id) on delete cascade,
  meta_pixel_id text,
  meta_access_token_encrypted text,
  tiktok_pixel_id text,
  tiktok_access_token_encrypted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_ad_integrations_meta_id_check check (meta_pixel_id is null or meta_pixel_id ~ '^[0-9]{5,30}$'),
  constraint marketplace_ad_integrations_tiktok_id_check check (tiktok_pixel_id is null or tiktok_pixel_id ~ '^[A-Za-z0-9_-]{5,80}$')
);

alter table public.marketplace_ad_integrations enable row level security;
revoke all on public.marketplace_ad_integrations from anon, authenticated;
grant all on public.marketplace_ad_integrations to service_role;

alter table public.marketplace_guest_orders
  add column if not exists ad_marketing_consent boolean not null default false;

commit;
