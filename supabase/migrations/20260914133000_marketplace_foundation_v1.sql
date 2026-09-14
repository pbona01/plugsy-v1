-- Plugsy Marketplace v1: listings, wallet-held orders, buyer entitlements and disputes.
-- Marketplace writes are service-role/RPC only. The browser must never alter balances,
-- held funds, entitlements or trust data directly.

begin;

-- Clerk IDs are the stable identity used throughout Plugsy. A non-partial
-- unique index is required before marketplace foreign keys can reference it.
create unique index if not exists profiles_clerk_id_marketplace_v1_unique
  on public.profiles (clerk_id);

create table if not exists public.marketplace_seller_profiles (
  user_id text primary key references public.profiles(clerk_id) on delete cascade,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  verification_provider text,
  verification_reference text,
  public_selling_enabled boolean not null default false,
  public_plan_expires_at timestamptz,
  trust_score integer not null default 100 check (trust_score between 0 and 100),
  total_sales_count integer not null default 0 check (total_sales_count >= 0),
  completed_orders_count integer not null default 0 check (completed_orders_count >= 0),
  upheld_disputes_count integer not null default 0 check (upheld_disputes_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id text not null references public.profiles(clerk_id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  summary text not null default '' check (char_length(summary) <= 220),
  description text not null default '' check (char_length(description) <= 8000),
  category text not null check (category ~ '^[a-z0-9_-]{2,48}$'),
  price numeric(12,2) not null check (price >= 100),
  currency text not null default 'NGN' check (currency = 'NGN'),
  cover_image_url text,
  delivery_url text,
  delivery_label text not null default 'Open product' check (char_length(delivery_label) between 2 and 80),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  status text not null default 'draft' check (status in ('draft', 'published', 'paused', 'archived')),
  private_access_token text not null default replace(gen_random_uuid()::text, '-', '') unique,
  resale_policy text not null default 'not_allowed' check (resale_policy in ('not_allowed', 'fixed_percent', 'approval_required')),
  resale_commission_percent numeric(5,2) check (resale_commission_percent is null or resale_commission_percent between 1 and 80),
  terms_version text not null default 'marketplace-v1',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (resale_policy = 'fixed_percent' and resale_commission_percent is not null)
    or (resale_policy <> 'fixed_percent' and resale_commission_percent is null)
  )
);

create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique,
  buyer_id text not null references public.profiles(clerk_id) on delete restrict,
  seller_id text not null references public.profiles(clerk_id) on delete restrict,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  reseller_user_id text references public.profiles(clerk_id) on delete set null,
  listing_snapshot jsonb not null default '{}'::jsonb,
  amount numeric(12,2) not null check (amount >= 0),
  platform_fee numeric(12,2) not null default 0 check (platform_fee >= 0),
  seller_amount numeric(12,2) not null check (seller_amount >= 0),
  reseller_amount numeric(12,2) not null default 0 check (reseller_amount >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  payment_status text not null default 'paid' check (payment_status in ('paid', 'refunded', 'failed')),
  funds_status text not null default 'held' check (funds_status in ('held', 'disputed', 'released', 'refunded')),
  hold_expires_at timestamptz not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_id, idempotency_key),
  check (seller_amount + reseller_amount + platform_fee = amount)
);

create table if not exists public.marketplace_entitlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.marketplace_orders(id) on delete cascade,
  buyer_id text not null references public.profiles(clerk_id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  access_status text not null default 'active' check (access_status in ('active', 'revoked')),
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.marketplace_orders(id) on delete cascade,
  buyer_id text not null references public.profiles(clerk_id) on delete restrict,
  seller_id text not null references public.profiles(clerk_id) on delete restrict,
  reason_code text not null check (reason_code in ('not_as_described', 'unavailable', 'misleading', 'duplicate_charge', 'other')),
  description text not null check (char_length(btrim(description)) between 10 and 3000),
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'seller_response', 'resolved_buyer', 'resolved_seller', 'closed')),
  resolution_note text,
  resolved_by text references public.profiles(clerk_id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_resale_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  requester_id text not null references public.profiles(clerk_id) on delete cascade,
  seller_id text not null references public.profiles(clerk_id) on delete cascade,
  requested_commission_percent numeric(5,2) not null check (requested_commission_percent between 1 and 80),
  purchase_code text not null default replace(gen_random_uuid()::text,'-','') unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked')),
  seller_note text check (char_length(seller_note) <= 1000),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, requester_id)
);

create index if not exists marketplace_listings_public_browse_v1_idx
  on public.marketplace_listings (category, created_at desc)
  where status = 'published' and visibility = 'public';
create index if not exists marketplace_listings_seller_v1_idx
  on public.marketplace_listings (seller_id, updated_at desc);
create index if not exists marketplace_orders_buyer_v1_idx
  on public.marketplace_orders (buyer_id, created_at desc);
create index if not exists marketplace_orders_seller_hold_v1_idx
  on public.marketplace_orders (seller_id, funds_status, hold_expires_at);
create index if not exists marketplace_entitlements_buyer_v1_idx
  on public.marketplace_entitlements (buyer_id, granted_at desc);

alter table public.marketplace_seller_profiles enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_orders enable row level security;
alter table public.marketplace_entitlements enable row level security;
alter table public.marketplace_disputes enable row level security;
alter table public.marketplace_resale_requests enable row level security;

revoke all on public.marketplace_seller_profiles, public.marketplace_listings,
  public.marketplace_orders, public.marketplace_entitlements,
  public.marketplace_disputes, public.marketplace_resale_requests from anon, authenticated;
grant all on public.marketplace_seller_profiles, public.marketplace_listings,
  public.marketplace_orders, public.marketplace_entitlements,
  public.marketplace_disputes, public.marketplace_resale_requests to service_role;

create or replace function public.marketplace_create_wallet_order_v1(
  p_actor_user_id text,
  p_actor_email text,
  p_listing_id uuid,
  p_idempotency_key text,
  p_private_access_token text default null,
  p_reseller_user_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_listing public.marketplace_listings%rowtype;
  v_profile public.profiles%rowtype;
  v_existing public.marketplace_orders%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_balance_before numeric;
  v_balance_after numeric;
  v_reference text;
  v_reseller_percent numeric := 0;
  v_reseller_amount numeric := 0;
  v_platform_fee numeric := 0;
  v_seller_amount numeric;
begin
  if p_actor_user_id is null or btrim(p_actor_user_id) = '' then
    raise exception using errcode = '22023', message = 'ACTOR_REQUIRED';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$' then
    raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id || ':' || p_idempotency_key, 0));
  select * into v_existing from public.marketplace_orders
  where buyer_id = p_actor_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.listing_id <> p_listing_id then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return jsonb_build_object('success', true, 'already_processed', true, 'order_id', v_existing.id, 'reference', v_existing.order_reference, 'hold_expires_at', v_existing.hold_expires_at);
  end if;

  select * into v_listing from public.marketplace_listings where id = p_listing_id for update;
  if not found or v_listing.status <> 'published' then
    raise exception using errcode = 'P0002', message = 'LISTING_NOT_AVAILABLE';
  end if;
  if v_listing.seller_id = p_actor_user_id then
    raise exception using errcode = '22023', message = 'SELF_PURCHASE_NOT_ALLOWED';
  end if;
  if not exists (select 1 from public.marketplace_seller_profiles where user_id=v_listing.seller_id and verification_status='verified') then
    raise exception using errcode='42501',message='SELLER_VERIFICATION_REQUIRED';
  end if;
  if v_listing.visibility='public' and not exists(select 1 from public.marketplace_seller_profiles where user_id=v_listing.seller_id and public_selling_enabled and public_plan_expires_at>now()) then
    raise exception using errcode='42501',message='SELLER_PLAN_EXPIRED';
  end if;
  if v_listing.visibility = 'private' and coalesce(p_private_access_token, '') <> v_listing.private_access_token then
    raise exception using errcode = '42501', message = 'PRIVATE_LISTING_ACCESS_DENIED';
  end if;
  if v_listing.delivery_asset_id is not null then
    if not exists(select 1 from public.marketplace_assets where id=v_listing.delivery_asset_id and seller_id=v_listing.seller_id and status='clean') then raise exception 'FILE_NOT_READY'; end if;
  elsif coalesce(v_listing.delivery_url,'')='' then raise exception 'DELIVERY_REQUIRED'; end if;

  if p_reseller_user_id is not null then
    if p_reseller_user_id in (p_actor_user_id,v_listing.seller_id) then raise exception 'SELF_REFERRAL_NOT_ALLOWED'; end if;
    select requested_commission_percent into v_reseller_percent from public.marketplace_resale_requests
      where listing_id=v_listing.id and requester_id=p_reseller_user_id and status='approved' for share;
    if not found or v_listing.resale_policy='not_allowed' then raise exception 'RESELLER_NOT_APPROVED'; end if;
  end if;
  v_reseller_amount := round(v_listing.price * v_reseller_percent / 100, 2);
  v_seller_amount := v_listing.price - v_platform_fee - v_reseller_amount;

  select * into v_profile from public.profiles where clerk_id = p_actor_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;
  v_balance_before := coalesce(v_profile.balance, 0);
  if v_balance_before < v_listing.price then
    raise exception using errcode = '22003', message = 'INSUFFICIENT_FUNDS';
  end if;
  v_balance_after := v_balance_before - v_listing.price;
  v_reference := 'marketplace_' || md5(concat_ws('|', p_actor_user_id, p_idempotency_key));

  update public.profiles set balance = v_balance_after, updated_at = now() where clerk_id = p_actor_user_id;
  insert into public.marketplace_orders (
    order_reference, buyer_id, seller_id, listing_id, reseller_user_id, listing_snapshot,
    amount, platform_fee, seller_amount, reseller_amount, hold_expires_at, idempotency_key
  ) values (
    upper('MKT-' || substr(md5(v_reference), 1, 12)), p_actor_user_id, v_listing.seller_id, v_listing.id,
    case when v_reseller_amount > 0 then p_reseller_user_id else null end,
    jsonb_build_object('title', v_listing.title, 'slug', v_listing.slug, 'category', v_listing.category, 'price', v_listing.price, 'delivery_label', v_listing.delivery_label, 'delivery_url', v_listing.delivery_url, 'delivery_asset_id', v_listing.delivery_asset_id),
    v_listing.price, v_platform_fee, v_seller_amount, v_reseller_amount, now() + interval '10 hours', p_idempotency_key
  ) returning * into v_order;

  insert into public.marketplace_entitlements (order_id, buyer_id, listing_id)
  values (v_order.id, p_actor_user_id, v_listing.id);
  insert into public.wallet_transactions (
    user_id, user_email, type, amount, status, reference, metadata, balance_before, balance_after, idempotency_key, updated_at
  ) values (
    p_actor_user_id, coalesce(p_actor_email, ''), 'purchase', v_listing.price, 'success', v_reference,
    jsonb_build_object('operation', 'marketplace_purchase', 'marketplace_order_id', v_order.id::text, 'listing_id', v_listing.id::text, 'funds_status', 'held'),
    v_balance_before, v_balance_after, p_idempotency_key, now()
  );
  insert into public.marketplace_seller_profiles (user_id) values (v_listing.seller_id) on conflict (user_id) do nothing;
  update public.marketplace_seller_profiles
  set total_sales_count = total_sales_count + 1, updated_at = now()
  where user_id = v_listing.seller_id;

  return jsonb_build_object('success', true, 'already_processed', false, 'order_id', v_order.id, 'reference', v_order.order_reference, 'amount', v_order.amount, 'hold_expires_at', v_order.hold_expires_at);
end;
$$;

create or replace function public.marketplace_release_due_orders_v1(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_order public.marketplace_orders%rowtype;
  v_seller public.profiles%rowtype;
  v_reseller public.profiles%rowtype;
  v_released integer := 0;
begin
  -- One release batch at a time also prevents overlapping receiver-lock graphs.
  if not pg_try_advisory_xact_lock(hashtextextended('plugsy-marketplace-release-worker-v1',0)) then return 0; end if;
  for v_order in
    select o.* from public.marketplace_orders o
    where o.funds_status = 'held' and o.hold_expires_at <= now()
      and o.payment_status = 'paid'
      and not exists (select 1 from public.marketplace_disputes d where d.order_id = o.id and d.status in ('open', 'seller_response'))
    order by o.hold_expires_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    perform 1 from public.profiles where clerk_id in (v_order.seller_id,v_order.reseller_user_id) order by clerk_id for update;
    select * into v_seller from public.profiles where clerk_id = v_order.seller_id for update;
    if not found then continue; end if;
    if v_order.reseller_amount>0 then
      select * into v_reseller from public.profiles where clerk_id=v_order.reseller_user_id;
      if not found then raise exception 'RESELLER_PROFILE_NOT_FOUND'; end if;
      update public.profiles set balance=coalesce(balance,0)+v_order.reseller_amount,updated_at=now() where clerk_id=v_order.reseller_user_id;
      insert into public.wallet_transactions(user_id,user_email,type,amount,status,reference,metadata,balance_before,balance_after,idempotency_key,updated_at)
        values(v_order.reseller_user_id,coalesce(v_reseller.email,''),'commission',v_order.reseller_amount,'success','marketplace_commission_' || v_order.id,
          jsonb_build_object('operation','marketplace_reseller_commission','marketplace_order_id',v_order.id),coalesce(v_reseller.balance,0),coalesce(v_reseller.balance,0)+v_order.reseller_amount,'marketplace-commission:' || v_order.id,now());
    end if;
    update public.profiles set balance = coalesce(balance, 0) + v_order.seller_amount, updated_at = now() where clerk_id = v_order.seller_id;
    insert into public.wallet_transactions (
      user_id, user_email, type, amount, status, reference, metadata, balance_before, balance_after, idempotency_key, updated_at
    ) values (
      v_order.seller_id, coalesce(v_seller.email, ''), 'marketplace_sale', v_order.seller_amount, 'success', 'marketplace_release_' || v_order.id::text,
      jsonb_build_object('operation', 'marketplace_release', 'marketplace_order_id', v_order.id::text),
      coalesce(v_seller.balance, 0), coalesce(v_seller.balance, 0) + v_order.seller_amount, 'marketplace-release:' || v_order.id::text, now()
    );
    update public.marketplace_orders set funds_status = 'released', updated_at = now() where id = v_order.id;
    update public.marketplace_seller_profiles set completed_orders_count = completed_orders_count + 1, updated_at = now() where user_id = v_order.seller_id;
    v_released := v_released + 1;
  end loop;
  return v_released;
end;
$$;

create or replace function public.marketplace_open_dispute_v1(
  p_actor_user_id text,
  p_order_id uuid,
  p_reason_code text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_order public.marketplace_orders%rowtype;
  v_dispute_id uuid;
begin
  select * into v_order from public.marketplace_orders where id = p_order_id for update;
  if not found or v_order.buyer_id <> p_actor_user_id then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  if v_order.funds_status <> 'held' or v_order.hold_expires_at < now() then
    raise exception using errcode = '22023', message = 'DISPUTE_WINDOW_CLOSED';
  end if;
  insert into public.marketplace_disputes (order_id, buyer_id, seller_id, reason_code, description, evidence)
  values (v_order.id, p_actor_user_id, v_order.seller_id, p_reason_code, p_description, '[]'::jsonb)
  returning id into v_dispute_id;
  update public.marketplace_orders set funds_status = 'disputed', updated_at = now() where id = v_order.id;
  return jsonb_build_object('success', true, 'dispute_id', v_dispute_id);
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'DISPUTE_ALREADY_OPEN';
end;
$$;

revoke all on function public.marketplace_create_wallet_order_v1(text, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.marketplace_release_due_orders_v1(integer) from public, anon, authenticated;
revoke all on function public.marketplace_open_dispute_v1(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.marketplace_create_wallet_order_v1(text, text, uuid, text, text, text) to service_role;
grant execute on function public.marketplace_release_due_orders_v1(integer) to service_role;
grant execute on function public.marketplace_open_dispute_v1(text, uuid, text, text) to service_role;

commit;
