-- Marketplace seller governance: review history, temporary public-selling
-- restrictions, and one-time seller sales milestones.
begin;

create table if not exists public.marketplace_seller_restrictions (
  id uuid primary key default gen_random_uuid(),
  seller_id text not null references public.profiles(clerk_id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'lifted')),
  reason text not null check (char_length(btrim(reason)) between 10 and 1500),
  issued_by text not null references public.profiles(clerk_id) on delete restrict,
  public_selling_was_enabled boolean not null default false,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  lifted_at timestamptz,
  lifted_by text references public.profiles(clerk_id) on delete set null,
  lift_note text check (lift_note is null or char_length(lift_note) <= 1500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at)
);

create unique index if not exists marketplace_seller_restrictions_one_active_v1
  on public.marketplace_seller_restrictions (seller_id)
  where status = 'active';
create index if not exists marketplace_seller_restrictions_active_v1
  on public.marketplace_seller_restrictions (status, expires_at);

create table if not exists public.marketplace_seller_milestones (
  seller_id text not null references public.profiles(clerk_id) on delete cascade,
  milestone_code text not null check (milestone_code in ('sales_10000', 'sales_100000', 'sales_1000000')),
  target_amount numeric(12,2) not null check (target_amount > 0),
  reached_at timestamptz not null default now(),
  primary key (seller_id, milestone_code)
);

alter table public.marketplace_seller_restrictions enable row level security;
alter table public.marketplace_seller_milestones enable row level security;
revoke all on public.marketplace_seller_restrictions, public.marketplace_seller_milestones from public, anon, authenticated;
grant all on public.marketplace_seller_restrictions, public.marketplace_seller_milestones to service_role;

commit;
