-- Only a confirmed buyer can review a Marketplace product. Guest buyers use
-- their private delivery link; their email address is never shown publicly.
begin;

create table if not exists public.marketplace_product_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  seller_id text not null references public.profiles(clerk_id) on delete restrict,
  order_id uuid unique references public.marketplace_orders(id) on delete cascade,
  guest_order_id uuid unique references public.marketplace_guest_orders(id) on delete cascade,
  buyer_id text references public.profiles(clerk_id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 2 and 1200),
  seller_response text check (seller_response is null or char_length(btrim(seller_response)) between 2 and 1200),
  status text not null default 'published' check (status in ('published','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_product_reviews_one_paid_order check (
    (order_id is not null and guest_order_id is null)
    or (order_id is null and guest_order_id is not null)
  )
);

create index if not exists marketplace_product_reviews_listing_v1_idx
  on public.marketplace_product_reviews (listing_id, status, created_at desc);

alter table public.marketplace_product_reviews enable row level security;
revoke all on public.marketplace_product_reviews from public, anon, authenticated;
grant all on public.marketplace_product_reviews to service_role;

commit;
