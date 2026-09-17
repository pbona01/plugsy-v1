-- Buyer follows for Marketplace. All writes are performed by the trusted API.

begin;

create table if not exists public.marketplace_seller_follows (
  follower_id text not null references public.profiles(clerk_id) on delete cascade,
  seller_id text not null references public.profiles(clerk_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, seller_id),
  check (follower_id <> seller_id)
);

create index if not exists marketplace_seller_follows_seller_v1_idx
  on public.marketplace_seller_follows (seller_id, created_at desc);

alter table public.marketplace_seller_follows enable row level security;
revoke all on public.marketplace_seller_follows from anon, authenticated;
grant all on public.marketplace_seller_follows to service_role;

commit;
