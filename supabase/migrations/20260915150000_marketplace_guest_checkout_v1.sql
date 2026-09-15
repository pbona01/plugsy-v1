-- Guest checkout is deliberately separate from wallet orders: it has no Clerk
-- account, but still gets a payment reference, a short-lived delivery token and
-- the same seller-fund hold before earnings are released.
begin;

create table if not exists public.marketplace_guest_orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  seller_id text not null references public.profiles(clerk_id) on delete restrict,
  buyer_email text not null check (char_length(buyer_email) <= 254),
  listing_snapshot jsonb not null default '{}'::jsonb,
  amount numeric(12,2) not null check (amount >= 100),
  seller_amount numeric(12,2) not null check (seller_amount >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed')),
  funds_status text not null default 'pending' check (funds_status in ('pending','held','released')),
  provider_transaction_id text unique,
  delivery_token text not null unique default replace(gen_random_uuid()::text,'-',''),
  receipt_email_sent_at timestamptz,
  hold_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_guest_orders_reference_idx on public.marketplace_guest_orders(order_reference);
create index if not exists marketplace_guest_orders_release_idx on public.marketplace_guest_orders(funds_status, hold_expires_at) where payment_status = 'paid';
alter table public.marketplace_guest_orders enable row level security;
revoke all on public.marketplace_guest_orders from anon, authenticated;
grant all on public.marketplace_guest_orders to service_role;

create or replace function public.marketplace_create_guest_checkout_v1(
  p_listing_id uuid, p_email text, p_reference text, p_private_access_token text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_listing public.marketplace_listings%rowtype; v_seller public.marketplace_seller_profiles%rowtype; v_order public.marketplace_guest_orders%rowtype;
begin
  if p_reference !~ '^mkt_guest_[A-Za-z0-9_-]{20,100}$' then raise exception 'GUEST_REFERENCE_INVALID'; end if;
  if char_length(btrim(coalesce(p_email,''))) not between 5 and 254 then raise exception 'GUEST_EMAIL_INVALID'; end if;
  select * into v_listing from public.marketplace_listings where id=p_listing_id for update;
  if not found or v_listing.status <> 'published' then raise exception 'LISTING_NOT_AVAILABLE'; end if;
  select * into v_seller from public.marketplace_seller_profiles where user_id=v_listing.seller_id;
  if not found or v_seller.verification_status <> 'verified' then raise exception 'SELLER_VERIFICATION_REQUIRED'; end if;
  if v_listing.visibility='public' and (not v_seller.public_selling_enabled or v_seller.public_plan_expires_at <= now()) then raise exception 'SELLER_PLAN_EXPIRED'; end if;
  if v_listing.visibility='private' and coalesce(p_private_access_token,'') <> v_listing.private_access_token then raise exception 'PRIVATE_LISTING_ACCESS_DENIED'; end if;
  if v_listing.delivery_asset_id is not null and not exists(select 1 from public.marketplace_assets where id=v_listing.delivery_asset_id and status='clean') then raise exception 'FILE_NOT_READY'; end if;
  if v_listing.delivery_asset_id is null and coalesce(v_listing.delivery_url,'')='' then raise exception 'DELIVERY_REQUIRED'; end if;
  insert into public.marketplace_guest_orders(order_reference,listing_id,seller_id,buyer_email,listing_snapshot,amount,seller_amount)
  values(p_reference,v_listing.id,v_listing.seller_id,lower(btrim(p_email)),jsonb_build_object('title',v_listing.title,'delivery_label',v_listing.delivery_label,'delivery_url',v_listing.delivery_url,'delivery_asset_id',v_listing.delivery_asset_id),v_listing.price,v_listing.price)
  returning * into v_order;
  return jsonb_build_object('success',true,'reference',v_order.order_reference,'amount',v_order.amount);
end; $$;

create or replace function public.marketplace_fulfill_guest_checkout_v1(
  p_reference text, p_provider_transaction_id text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_order public.marketplace_guest_orders%rowtype;
begin
  select * into v_order from public.marketplace_guest_orders where order_reference=p_reference for update;
  if not found then raise exception 'GUEST_ORDER_NOT_FOUND'; end if;
  if v_order.payment_status='paid' then return jsonb_build_object('success',true,'already_processed',true,'delivery_token',v_order.delivery_token); end if;
  if v_order.payment_status <> 'pending' then raise exception 'GUEST_ORDER_NOT_PENDING'; end if;
  update public.marketplace_guest_orders set payment_status='paid',funds_status='held',provider_transaction_id=p_provider_transaction_id,hold_expires_at=now()+interval '10 hours',updated_at=now() where id=v_order.id returning * into v_order;
  update public.marketplace_seller_profiles set total_sales_count=total_sales_count+1,updated_at=now() where user_id=v_order.seller_id;
  return jsonb_build_object('success',true,'already_processed',false,'delivery_token',v_order.delivery_token,'buyer_email',v_order.buyer_email,'title',v_order.listing_snapshot->>'title','amount',v_order.amount);
end; $$;

create or replace function public.marketplace_release_due_guest_orders_v1(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_order public.marketplace_guest_orders%rowtype; v_seller public.profiles%rowtype; v_released integer:=0;
begin
  for v_order in select * from public.marketplace_guest_orders where payment_status='paid' and funds_status='held' and hold_expires_at<=now() order by hold_expires_at asc for update skip locked limit greatest(1,least(coalesce(p_limit,100),500)) loop
    select * into v_seller from public.profiles where clerk_id=v_order.seller_id for update; if not found then continue; end if;
    update public.profiles set balance=coalesce(balance,0)+v_order.seller_amount,updated_at=now() where clerk_id=v_order.seller_id;
    insert into public.wallet_transactions(user_id,user_email,type,amount,status,reference,metadata,balance_before,balance_after,idempotency_key,updated_at)
      values(v_order.seller_id,coalesce(v_seller.email,''),'marketplace_sale',v_order.seller_amount,'success','marketplace_guest_release_'||v_order.id::text,jsonb_build_object('operation','marketplace_guest_release','guest_order_id',v_order.id::text),coalesce(v_seller.balance,0),coalesce(v_seller.balance,0)+v_order.seller_amount,'marketplace-guest-release:'||v_order.id::text,now());
    update public.marketplace_guest_orders set funds_status='released',updated_at=now() where id=v_order.id;
    update public.marketplace_seller_profiles set completed_orders_count=completed_orders_count+1,updated_at=now() where user_id=v_order.seller_id;
    v_released:=v_released+1;
  end loop;
  return v_released;
end; $$;

revoke all on function public.marketplace_create_guest_checkout_v1(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.marketplace_fulfill_guest_checkout_v1(text,text) from public,anon,authenticated;
revoke all on function public.marketplace_release_due_guest_orders_v1(integer) from public,anon,authenticated;
grant execute on function public.marketplace_create_guest_checkout_v1(uuid,text,text,text) to service_role;
grant execute on function public.marketplace_fulfill_guest_checkout_v1(text,text) to service_role;
grant execute on function public.marketplace_release_due_guest_orders_v1(integer) to service_role;
commit;
