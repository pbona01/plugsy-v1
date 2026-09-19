-- Marketplace payout recovery:
-- 1) restores the guest-checkout objects if the original migration was missed;
-- 2) records the next permitted payout time for every sale; and
-- 3) only releases money after both the 10-hour protection period and the
--    next 11:00 AM Africa/Lagos business-day payout window.
-- This migration never releases or credits an order by itself.
begin;

alter table public.marketplace_orders
  add column if not exists payout_available_at timestamptz;

create or replace function public.marketplace_next_payout_at_v1(p_hold_expires_at timestamptz)
returns timestamptz
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_local timestamp;
  v_day date;
  v_time time;
begin
  if p_hold_expires_at is null then return null; end if;
  v_local := p_hold_expires_at at time zone 'Africa/Lagos';
  v_day := v_local::date;
  v_time := v_local::time;

  while extract(isodow from v_day)::integer in (6, 7) loop
    v_day := v_day + 1;
  end loop;

  if v_day = v_local::date and v_time <= time '11:00' then
    return (v_day + time '11:00') at time zone 'Africa/Lagos';
  end if;

  v_day := v_day + 1;
  while extract(isodow from v_day)::integer in (6, 7) loop
    v_day := v_day + 1;
  end loop;
  return (v_day + time '11:00') at time zone 'Africa/Lagos';
end;
$$;

update public.marketplace_orders
set payout_available_at = public.marketplace_next_payout_at_v1(hold_expires_at)
where payout_available_at is null;

create index if not exists marketplace_orders_payout_due_v1_idx
  on public.marketplace_orders (payout_available_at, hold_expires_at)
  where payment_status = 'paid' and funds_status = 'held';

create table if not exists public.marketplace_guest_orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  seller_id text not null references public.profiles(clerk_id) on delete restrict,
  buyer_email text not null check (char_length(buyer_email) <= 254),
  listing_snapshot jsonb not null default '{}'::jsonb,
  amount numeric(12,2) not null check (amount >= 100),
  platform_fee numeric(12,2) not null default 0 check (platform_fee >= 0),
  seller_amount numeric(12,2) not null check (seller_amount >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed')),
  funds_status text not null default 'pending' check (funds_status in ('pending','held','released')),
  provider_transaction_id text unique,
  delivery_token text not null unique default replace(gen_random_uuid()::text,'-',''),
  receipt_email_sent_at timestamptz,
  hold_expires_at timestamptz,
  payout_available_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_guest_orders
  add column if not exists platform_fee numeric(12,2) not null default 0,
  add column if not exists payout_available_at timestamptz;

update public.marketplace_guest_orders
set payout_available_at = public.marketplace_next_payout_at_v1(hold_expires_at)
where hold_expires_at is not null and payout_available_at is null;

create index if not exists marketplace_guest_orders_reference_idx
  on public.marketplace_guest_orders(order_reference);
create index if not exists marketplace_guest_orders_payout_due_v1_idx
  on public.marketplace_guest_orders(payout_available_at, hold_expires_at)
  where payment_status = 'paid' and funds_status = 'held';

alter table public.marketplace_guest_orders enable row level security;
revoke all on public.marketplace_guest_orders from anon, authenticated;
grant all on public.marketplace_guest_orders to service_role;

create or replace function public.marketplace_create_wallet_order_v1(
  p_actor_user_id text, p_actor_email text, p_listing_id uuid, p_idempotency_key text,
  p_private_access_token text default null, p_reseller_user_id text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_listing public.marketplace_listings%rowtype; v_profile public.profiles%rowtype;
  v_seller public.marketplace_seller_profiles%rowtype; v_existing public.marketplace_orders%rowtype; v_order public.marketplace_orders%rowtype;
  v_balance_before numeric; v_balance_after numeric; v_reference text; v_fee_rate numeric; v_total numeric;
  v_reseller_percent numeric := 0; v_reseller_amount numeric := 0; v_platform_fee numeric := 0; v_seller_amount numeric;
  v_hold_expires_at timestamptz; v_payout_available_at timestamptz;
begin
  if p_actor_user_id is null or btrim(p_actor_user_id) = '' then raise exception using errcode='22023',message='ACTOR_REQUIRED'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$' then raise exception using errcode='22023',message='IDEMPOTENCY_KEY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id || ':' || p_idempotency_key, 0));
  select * into v_existing from public.marketplace_orders where buyer_id=p_actor_user_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.listing_id<>p_listing_id then raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REUSED'; end if;
    return jsonb_build_object('success',true,'already_processed',true,'order_id',v_existing.id,'reference',v_existing.order_reference,'amount',v_existing.amount,'hold_expires_at',v_existing.hold_expires_at,'payout_available_at',v_existing.payout_available_at);
  end if;
  select * into v_listing from public.marketplace_listings where id=p_listing_id for update;
  if not found or v_listing.status<>'published' then raise exception using errcode='P0002',message='LISTING_NOT_AVAILABLE'; end if;
  if v_listing.seller_id=p_actor_user_id then raise exception using errcode='22023',message='SELF_PURCHASE_NOT_ALLOWED'; end if;
  select * into v_seller from public.marketplace_seller_profiles where user_id=v_listing.seller_id;
  if v_listing.visibility='public' and (not found or v_seller.verification_status<>'verified') then raise exception using errcode='42501',message='SELLER_VERIFICATION_REQUIRED'; end if;
  if v_listing.visibility='public' and (not v_seller.public_selling_enabled or v_seller.public_plan_expires_at<=now()) then raise exception using errcode='42501',message='SELLER_PLAN_EXPIRED'; end if;
  if v_listing.visibility='private' and coalesce(p_private_access_token,'')<>v_listing.private_access_token then raise exception using errcode='42501',message='PRIVATE_LISTING_ACCESS_DENIED'; end if;
  if v_listing.delivery_asset_id is not null and not exists(select 1 from public.marketplace_assets where id=v_listing.delivery_asset_id and seller_id=v_listing.seller_id and status='clean') then raise exception 'FILE_NOT_READY'; end if;
  if v_listing.delivery_asset_id is null and coalesce(v_listing.delivery_url,'')='' then raise exception 'DELIVERY_REQUIRED'; end if;
  if p_reseller_user_id is not null then
    if p_reseller_user_id in (p_actor_user_id,v_listing.seller_id) then raise exception 'SELF_REFERRAL_NOT_ALLOWED'; end if;
    select requested_commission_percent into v_reseller_percent from public.marketplace_resale_requests where listing_id=v_listing.id and requester_id=p_reseller_user_id and status='approved' for share;
    if not found or v_listing.resale_policy='not_allowed' then raise exception 'RESELLER_NOT_APPROVED'; end if;
  end if;
  v_fee_rate := case when coalesce(v_seller.public_selling_enabled,false) and v_seller.public_plan_expires_at > now() then 0.03 else 0.06 end;
  v_platform_fee := round(v_listing.price * v_fee_rate, 2);
  v_reseller_amount := round(v_listing.price * v_reseller_percent / 100, 2);
  v_total := case when coalesce(v_seller.marketplace_fee_paid_by,'buyer') = 'seller' then v_listing.price else v_listing.price + v_platform_fee end;
  v_seller_amount := case when coalesce(v_seller.marketplace_fee_paid_by,'buyer') = 'seller' then v_listing.price - v_platform_fee - v_reseller_amount else v_listing.price - v_reseller_amount end;
  if v_seller_amount < 0 then raise exception 'SELLER_FEE_CONFIGURATION_INVALID'; end if;
  select * into v_profile from public.profiles where clerk_id=p_actor_user_id for update;
  if not found then raise exception using errcode='P0002',message='PROFILE_NOT_FOUND'; end if;
  v_balance_before:=coalesce(v_profile.balance,0); if v_balance_before<v_total then raise exception using errcode='22003',message='INSUFFICIENT_FUNDS'; end if;
  v_balance_after:=v_balance_before-v_total; v_reference:='marketplace_'||md5(concat_ws('|',p_actor_user_id,p_idempotency_key));
  v_hold_expires_at:=now()+interval '10 hours'; v_payout_available_at:=public.marketplace_next_payout_at_v1(v_hold_expires_at);
  update public.profiles set balance=v_balance_after,updated_at=now() where clerk_id=p_actor_user_id;
  insert into public.marketplace_orders(order_reference,buyer_id,seller_id,listing_id,reseller_user_id,listing_snapshot,amount,platform_fee,seller_amount,reseller_amount,hold_expires_at,payout_available_at,idempotency_key)
    values(upper('MKT-'||substr(md5(v_reference),1,12)),p_actor_user_id,v_listing.seller_id,v_listing.id,case when v_reseller_amount>0 then p_reseller_user_id else null end,jsonb_build_object('title',v_listing.title,'slug',v_listing.slug,'category',v_listing.category,'price',v_listing.price,'platform_fee',v_platform_fee,'platform_fee_percent',v_fee_rate*100,'marketplace_fee_paid_by',coalesce(v_seller.marketplace_fee_paid_by,'buyer'),'delivery_label',v_listing.delivery_label,'delivery_url',v_listing.delivery_url,'delivery_asset_id',v_listing.delivery_asset_id),v_total,v_platform_fee,v_seller_amount,v_reseller_amount,v_hold_expires_at,v_payout_available_at,p_idempotency_key) returning * into v_order;
  insert into public.marketplace_entitlements(order_id,buyer_id,listing_id) values(v_order.id,p_actor_user_id,v_listing.id);
  insert into public.wallet_transactions(user_id,user_email,type,amount,status,reference,metadata,balance_before,balance_after,idempotency_key,updated_at)
    values(p_actor_user_id,coalesce(p_actor_email,''),'purchase',v_total,'success',v_reference,jsonb_build_object('operation','marketplace_purchase','marketplace_order_id',v_order.id::text,'listing_id',v_listing.id::text,'base_price',v_listing.price,'platform_fee',v_platform_fee,'funds_status','held'),v_balance_before,v_balance_after,p_idempotency_key,now());
  insert into public.marketplace_seller_profiles(user_id) values(v_listing.seller_id) on conflict(user_id) do nothing;
  update public.marketplace_seller_profiles set total_sales_count=total_sales_count+1,updated_at=now() where user_id=v_listing.seller_id;
  return jsonb_build_object('success',true,'already_processed',false,'order_id',v_order.id,'reference',v_order.order_reference,'amount',v_order.amount,'platform_fee',v_platform_fee,'hold_expires_at',v_order.hold_expires_at,'payout_available_at',v_order.payout_available_at);
end;
$$;

create or replace function public.marketplace_create_guest_checkout_v1(
  p_listing_id uuid, p_email text, p_reference text, p_private_access_token text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  v_listing public.marketplace_listings%rowtype; v_seller public.marketplace_seller_profiles%rowtype; v_order public.marketplace_guest_orders%rowtype;
  v_fee_rate numeric; v_platform_fee numeric; v_total numeric; v_seller_amount numeric;
begin
  if p_reference !~ '^mkt_guest_[A-Za-z0-9_-]{20,100}$' then raise exception 'GUEST_REFERENCE_INVALID'; end if;
  if char_length(btrim(coalesce(p_email,''))) not between 5 and 254 then raise exception 'GUEST_EMAIL_INVALID'; end if;
  select * into v_listing from public.marketplace_listings where id=p_listing_id for update;
  if not found or v_listing.status<>'published' then raise exception 'LISTING_NOT_AVAILABLE'; end if;
  select * into v_seller from public.marketplace_seller_profiles where user_id=v_listing.seller_id;
  if v_listing.visibility='public' and (not found or v_seller.verification_status<>'verified') then raise exception 'SELLER_VERIFICATION_REQUIRED'; end if;
  if v_listing.visibility='public' and (not v_seller.public_selling_enabled or v_seller.public_plan_expires_at<=now()) then raise exception 'SELLER_PLAN_EXPIRED'; end if;
  if v_listing.visibility='private' and coalesce(p_private_access_token,'')<>v_listing.private_access_token then raise exception 'PRIVATE_LISTING_ACCESS_DENIED'; end if;
  if v_listing.delivery_asset_id is not null and not exists(select 1 from public.marketplace_assets where id=v_listing.delivery_asset_id and status='clean') then raise exception 'FILE_NOT_READY'; end if;
  if v_listing.delivery_asset_id is null and coalesce(v_listing.delivery_url,'')='' then raise exception 'DELIVERY_REQUIRED'; end if;
  v_fee_rate := case when coalesce(v_seller.public_selling_enabled,false) and v_seller.public_plan_expires_at > now() then 0.03 else 0.06 end;
  v_platform_fee := round(v_listing.price * v_fee_rate, 2);
  v_total := case when coalesce(v_seller.marketplace_fee_paid_by,'buyer') = 'seller' then v_listing.price else v_listing.price + v_platform_fee end;
  v_seller_amount := case when coalesce(v_seller.marketplace_fee_paid_by,'buyer') = 'seller' then v_listing.price-v_platform_fee else v_listing.price end;
  insert into public.marketplace_guest_orders(order_reference,listing_id,seller_id,buyer_email,listing_snapshot,amount,platform_fee,seller_amount)
    values(p_reference,v_listing.id,v_listing.seller_id,lower(btrim(p_email)),jsonb_build_object('title',v_listing.title,'slug',v_listing.slug,'category',v_listing.category,'price',v_listing.price,'platform_fee',v_platform_fee,'platform_fee_percent',v_fee_rate*100,'marketplace_fee_paid_by',coalesce(v_seller.marketplace_fee_paid_by,'buyer'),'delivery_label',v_listing.delivery_label,'delivery_url',v_listing.delivery_url,'delivery_asset_id',v_listing.delivery_asset_id),v_total,v_platform_fee,v_seller_amount) returning * into v_order;
  return jsonb_build_object('success',true,'reference',v_order.order_reference,'amount',v_order.amount,'platform_fee',v_platform_fee);
end;
$$;

create or replace function public.marketplace_fulfill_guest_checkout_v1(
  p_reference text, p_provider_transaction_id text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_order public.marketplace_guest_orders%rowtype; v_hold_expires_at timestamptz; v_payout_available_at timestamptz;
begin
  select * into v_order from public.marketplace_guest_orders where order_reference=p_reference for update;
  if not found then raise exception 'GUEST_ORDER_NOT_FOUND'; end if;
  if v_order.payment_status='paid' then return jsonb_build_object('success',true,'already_processed',true,'delivery_token',v_order.delivery_token); end if;
  if v_order.payment_status<>'pending' then raise exception 'GUEST_ORDER_NOT_PENDING'; end if;
  v_hold_expires_at:=now()+interval '10 hours'; v_payout_available_at:=public.marketplace_next_payout_at_v1(v_hold_expires_at);
  update public.marketplace_guest_orders set payment_status='paid',funds_status='held',provider_transaction_id=p_provider_transaction_id,hold_expires_at=v_hold_expires_at,payout_available_at=v_payout_available_at,updated_at=now() where id=v_order.id returning * into v_order;
  update public.marketplace_seller_profiles set total_sales_count=total_sales_count+1,updated_at=now() where user_id=v_order.seller_id;
  return jsonb_build_object('success',true,'already_processed',false,'delivery_token',v_order.delivery_token,'buyer_email',v_order.buyer_email,'title',v_order.listing_snapshot->>'title','amount',v_order.amount,'payout_available_at',v_order.payout_available_at);
end;
$$;

create or replace function public.marketplace_release_due_orders_v1(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  v_order public.marketplace_orders%rowtype; v_seller public.profiles%rowtype; v_reseller public.profiles%rowtype; v_released integer:=0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('plugsy-marketplace-release-worker-v1',0)) then return 0; end if;
  for v_order in
    select o.* from public.marketplace_orders o
    where o.funds_status='held' and o.payment_status='paid' and o.hold_expires_at<=now()
      and coalesce(o.payout_available_at,public.marketplace_next_payout_at_v1(o.hold_expires_at))<=now()
      and not exists(select 1 from public.marketplace_disputes d where d.order_id=o.id and d.status in ('open','seller_response'))
    order by coalesce(o.payout_available_at,o.hold_expires_at) asc
    for update skip locked limit greatest(1,least(coalesce(p_limit,100),500))
  loop
    perform 1 from public.profiles where clerk_id in(v_order.seller_id,v_order.reseller_user_id) order by clerk_id for update;
    select * into v_seller from public.profiles where clerk_id=v_order.seller_id for update; if not found then continue; end if;
    if v_order.reseller_amount>0 then
      select * into v_reseller from public.profiles where clerk_id=v_order.reseller_user_id; if not found then raise exception 'RESELLER_PROFILE_NOT_FOUND'; end if;
      update public.profiles set balance=coalesce(balance,0)+v_order.reseller_amount,updated_at=now() where clerk_id=v_order.reseller_user_id;
      insert into public.wallet_transactions(user_id,user_email,type,amount,status,reference,metadata,balance_before,balance_after,idempotency_key,updated_at)
        values(v_order.reseller_user_id,coalesce(v_reseller.email,''),'commission',v_order.reseller_amount,'success','marketplace_commission_'||v_order.id,jsonb_build_object('operation','marketplace_reseller_commission','marketplace_order_id',v_order.id),coalesce(v_reseller.balance,0),coalesce(v_reseller.balance,0)+v_order.reseller_amount,'marketplace-commission:'||v_order.id,now());
    end if;
    update public.profiles set balance=coalesce(balance,0)+v_order.seller_amount,updated_at=now() where clerk_id=v_order.seller_id;
    insert into public.wallet_transactions(user_id,user_email,type,amount,status,reference,metadata,balance_before,balance_after,idempotency_key,updated_at)
      values(v_order.seller_id,coalesce(v_seller.email,''),'marketplace_sale',v_order.seller_amount,'success','marketplace_release_'||v_order.id::text,jsonb_build_object('operation','marketplace_release','marketplace_order_id',v_order.id::text),coalesce(v_seller.balance,0),coalesce(v_seller.balance,0)+v_order.seller_amount,'marketplace-release:'||v_order.id::text,now());
    update public.marketplace_orders set funds_status='released',payout_available_at=coalesce(payout_available_at,public.marketplace_next_payout_at_v1(hold_expires_at)),updated_at=now() where id=v_order.id;
    update public.marketplace_seller_profiles set completed_orders_count=completed_orders_count+1,updated_at=now() where user_id=v_order.seller_id;
    v_released:=v_released+1;
  end loop;
  return v_released;
end;
$$;

create or replace function public.marketplace_release_due_guest_orders_v1(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_order public.marketplace_guest_orders%rowtype; v_seller public.profiles%rowtype; v_released integer:=0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('plugsy-marketplace-guest-release-worker-v1',0)) then return 0; end if;
  for v_order in
    select o.* from public.marketplace_guest_orders o
    where o.payment_status='paid' and o.funds_status='held' and o.hold_expires_at<=now()
      and coalesce(o.payout_available_at,public.marketplace_next_payout_at_v1(o.hold_expires_at))<=now()
    order by coalesce(o.payout_available_at,o.hold_expires_at) asc
    for update skip locked limit greatest(1,least(coalesce(p_limit,100),500))
  loop
    select * into v_seller from public.profiles where clerk_id=v_order.seller_id for update; if not found then continue; end if;
    update public.profiles set balance=coalesce(balance,0)+v_order.seller_amount,updated_at=now() where clerk_id=v_order.seller_id;
    insert into public.wallet_transactions(user_id,user_email,type,amount,status,reference,metadata,balance_before,balance_after,idempotency_key,updated_at)
      values(v_order.seller_id,coalesce(v_seller.email,''),'marketplace_sale',v_order.seller_amount,'success','marketplace_guest_release_'||v_order.id::text,jsonb_build_object('operation','marketplace_guest_release','guest_order_id',v_order.id::text),coalesce(v_seller.balance,0),coalesce(v_seller.balance,0)+v_order.seller_amount,'marketplace-guest-release:'||v_order.id::text,now());
    update public.marketplace_guest_orders set funds_status='released',payout_available_at=coalesce(payout_available_at,public.marketplace_next_payout_at_v1(hold_expires_at)),updated_at=now() where id=v_order.id;
    update public.marketplace_seller_profiles set completed_orders_count=completed_orders_count+1,updated_at=now() where user_id=v_order.seller_id;
    v_released:=v_released+1;
  end loop;
  return v_released;
end;
$$;

revoke all on function public.marketplace_next_payout_at_v1(timestamptz) from public,anon,authenticated;
revoke all on function public.marketplace_create_wallet_order_v1(text,text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.marketplace_create_guest_checkout_v1(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.marketplace_fulfill_guest_checkout_v1(text,text) from public,anon,authenticated;
revoke all on function public.marketplace_release_due_orders_v1(integer) from public,anon,authenticated;
revoke all on function public.marketplace_release_due_guest_orders_v1(integer) from public,anon,authenticated;
grant execute on function public.marketplace_create_wallet_order_v1(text,text,uuid,text,text,text) to service_role;
grant execute on function public.marketplace_create_guest_checkout_v1(uuid,text,text,text) to service_role;
grant execute on function public.marketplace_fulfill_guest_checkout_v1(text,text) to service_role;
grant execute on function public.marketplace_release_due_orders_v1(integer) to service_role;
grant execute on function public.marketplace_release_due_guest_orders_v1(integer) to service_role;

commit;
