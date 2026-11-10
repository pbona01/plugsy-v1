-- Seller-controlled contact methods and lightweight related-product bundles.
-- These are deliberately separate from seller profiles so marketplace setup
-- can evolve without exposing personal contact data in the public directory.

create table if not exists public.marketplace_seller_contact_preferences (
  seller_id text primary key,
  plugsy_inbox_enabled boolean not null default true,
  whatsapp_url text,
  telegram_url text,
  updated_at timestamptz not null default now(),
  constraint marketplace_seller_contact_whatsapp_url_check
    check (whatsapp_url is null or whatsapp_url ~ '^https://(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)/'),
  constraint marketplace_seller_contact_telegram_url_check
    check (telegram_url is null or telegram_url ~ '^https://(t\.me|telegram\.me)/')
);

create table if not exists public.marketplace_listing_related_products (
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  related_listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  sort_order smallint not null default 0 check (sort_order between 0 and 1),
  created_at timestamptz not null default now(),
  primary key (listing_id, related_listing_id),
  constraint marketplace_listing_related_products_no_self_check check (listing_id <> related_listing_id)
);

create index if not exists marketplace_listing_related_products_listing_idx
  on public.marketplace_listing_related_products (listing_id, sort_order);

alter table public.marketplace_seller_contact_preferences enable row level security;
alter table public.marketplace_listing_related_products enable row level security;

revoke all on public.marketplace_seller_contact_preferences from public, anon, authenticated;
revoke all on public.marketplace_listing_related_products from public, anon, authenticated;
grant all on public.marketplace_seller_contact_preferences to service_role;
grant all on public.marketplace_listing_related_products to service_role;
