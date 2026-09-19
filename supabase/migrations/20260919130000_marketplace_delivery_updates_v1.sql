-- Multiple files/links per listing and buyer update notifications.
begin;

create table if not exists public.marketplace_listing_deliveries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  seller_id text not null references public.profiles(clerk_id) on delete cascade,
  kind text not null check (kind in ('file','link')),
  asset_id uuid references public.marketplace_assets(id) on delete restrict,
  delivery_url text,
  label text not null check (char_length(btrim(label)) between 1 and 120),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'file' and asset_id is not null and delivery_url is null) or (kind = 'link' and asset_id is null and delivery_url is not null))
);

create index if not exists marketplace_listing_deliveries_listing_idx
  on public.marketplace_listing_deliveries(listing_id, sort_order, created_at);
alter table public.marketplace_listing_deliveries enable row level security;
revoke all on public.marketplace_listing_deliveries from anon, authenticated;
grant all on public.marketplace_listing_deliveries to service_role;

create table if not exists public.marketplace_product_update_notifications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_id text references public.profiles(clerk_id) on delete cascade,
  buyer_email text,
  title text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check (buyer_id is not null or buyer_email is not null)
);

create unique index if not exists marketplace_product_update_notification_once_idx
  on public.marketplace_product_update_notifications(listing_id, buyer_id, created_at);
create index if not exists marketplace_product_update_notifications_due_idx
  on public.marketplace_product_update_notifications(next_attempt_at)
  where status in ('pending','failed');
alter table public.marketplace_product_update_notifications enable row level security;
revoke all on public.marketplace_product_update_notifications from anon, authenticated;
grant all on public.marketplace_product_update_notifications to service_role;

commit;
