-- Marketplace Premium billing options and seller storage capacity.
begin;

alter table public.marketplace_premium_payments
  drop constraint if exists marketplace_premium_payments_amount_check;
alter table public.marketplace_premium_payments
  add constraint marketplace_premium_payments_amount_check check (amount in (1500, 13500));
alter table public.marketplace_premium_payments
  add column if not exists plan_code text not null default 'monthly';

create table if not exists public.marketplace_storage_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(clerk_id) on delete cascade,
  idempotency_key text not null,
  capacity_gb integer not null check (capacity_gb between 1 and 10),
  amount numeric(12,2) not null check (amount > 0),
  reference text not null unique,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
alter table public.marketplace_storage_purchases enable row level security;
revoke all on public.marketplace_storage_purchases from public, anon, authenticated;
grant all on public.marketplace_storage_purchases to service_role;

create table if not exists public.marketplace_storage_entitlements (
  user_id text primary key references public.profiles(clerk_id) on delete cascade,
  capacity_gb integer not null default 3 check (capacity_gb between 3 and 10),
  updated_at timestamptz not null default now()
);
alter table public.marketplace_storage_entitlements enable row level security;
revoke all on public.marketplace_storage_entitlements from public, anon, authenticated;
grant all on public.marketplace_storage_entitlements to service_role;

create or replace function public.marketplace_activate_premium_v2(
  p_actor_user_id text, p_actor_email text, p_idempotency_key text, p_plan_code text
)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $premium$
declare
  v_profile public.profiles%rowtype;
  v_seller public.marketplace_seller_profiles%rowtype;
  v_existing public.marketplace_premium_payments%rowtype;
  v_amount numeric(12,2);
  v_duration interval;
  v_reference text;
  v_expires timestamptz;
begin
  if p_actor_user_id is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$' then raise exception 'PREMIUM_INPUT_INVALID'; end if;
  if p_plan_code not in ('monthly','yearly') then raise exception 'PREMIUM_PLAN_INVALID'; end if;
  v_amount := case when p_plan_code = 'yearly' then 13500 else 1500 end;
  v_duration := case when p_plan_code = 'yearly' then interval '1 year' else interval '1 month' end;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id || ':premium:' || p_idempotency_key, 0));
  select * into v_existing from public.marketplace_premium_payments where user_id = p_actor_user_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('already_processed', true, 'expires_at', v_existing.expires_at, 'plan_code', v_existing.plan_code); end if;
  select * into v_profile from public.profiles where clerk_id = p_actor_user_id for update;
  if not found then raise exception 'PROFILE_REQUIRED'; end if;
  insert into public.marketplace_seller_profiles (user_id) values (p_actor_user_id) on conflict (user_id) do nothing;
  select * into v_seller from public.marketplace_seller_profiles where user_id = p_actor_user_id for update;
  if v_seller.public_selling_enabled and v_seller.public_plan_expires_at > now() then raise exception 'PREMIUM_ALREADY_ACTIVE'; end if;
  if coalesce(v_profile.balance, 0) < v_amount then raise exception 'INSUFFICIENT_FUNDS'; end if;
  v_reference := 'MP-PREMIUM-' || gen_random_uuid()::text;
  v_expires := now() + v_duration;
  update public.profiles set balance = coalesce(balance, 0) - v_amount, updated_at = now() where clerk_id = p_actor_user_id;
  insert into public.marketplace_premium_payments(user_id, idempotency_key, amount, reference, starts_at, expires_at, terms_version, plan_code)
    values(p_actor_user_id, p_idempotency_key, v_amount, v_reference, now(), v_expires, 'marketplace-premium-v1', p_plan_code);
  insert into public.wallet_transactions(user_id, user_email, type, amount, status, reference, metadata, balance_before, balance_after, idempotency_key, updated_at)
    values(p_actor_user_id, coalesce(p_actor_email, ''), 'purchase', v_amount, 'success', v_reference,
      jsonb_build_object('operation', 'marketplace_premium', 'plan_code', p_plan_code, 'expires_at', v_expires), coalesce(v_profile.balance, 0), coalesce(v_profile.balance, 0) - v_amount, 'marketplace-premium:' || p_idempotency_key, now());
  update public.marketplace_seller_profiles set public_selling_enabled = true, public_plan_expires_at = v_expires, updated_at = now() where user_id = p_actor_user_id;
  insert into public.marketplace_audit_events(actor_id, action, entity_id, details)
    values(p_actor_user_id, 'premium_activated', p_actor_user_id, jsonb_build_object('reference', v_reference, 'amount', v_amount, 'plan_code', p_plan_code, 'expires_at', v_expires));
  return jsonb_build_object('already_processed', false, 'expires_at', v_expires, 'plan_code', p_plan_code, 'amount', v_amount);
end;
$premium$;
revoke all on function public.marketplace_activate_premium_v2(text, text, text, text) from public, anon, authenticated;
grant execute on function public.marketplace_activate_premium_v2(text, text, text, text) to service_role;

create or replace function public.marketplace_activate_storage_v1(
  p_actor_user_id text, p_actor_email text, p_idempotency_key text, p_capacity_gb integer
)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $storage$
declare
  v_profile public.profiles%rowtype;
  v_seller public.marketplace_seller_profiles%rowtype;
  v_existing public.marketplace_storage_purchases%rowtype;
  v_amount numeric(12,2);
  v_premium boolean;
  v_reference text;
  v_before numeric;
begin
  if p_actor_user_id is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$' or p_capacity_gb not between 1 and 10 then raise exception 'STORAGE_PLAN_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id || ':storage:' || p_idempotency_key, 0));
  select * into v_existing from public.marketplace_storage_purchases where user_id = p_actor_user_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('already_processed', true, 'capacity_gb', v_existing.capacity_gb, 'amount', v_existing.amount); end if;
  select * into v_profile from public.profiles where clerk_id = p_actor_user_id for update;
  if not found then raise exception 'PROFILE_REQUIRED'; end if;
  select * into v_seller from public.marketplace_seller_profiles where user_id = p_actor_user_id;
  v_premium := coalesce(v_seller.public_selling_enabled, false) and coalesce(v_seller.public_plan_expires_at > now(), false);
  v_amount := p_capacity_gb * case when v_premium then 250 else 350 end;
  if coalesce(v_profile.balance, 0) < v_amount then raise exception 'INSUFFICIENT_FUNDS'; end if;
  v_before := coalesce(v_profile.balance, 0);
  v_reference := 'MP-STORAGE-' || gen_random_uuid()::text;
  update public.profiles set balance = v_before - v_amount, updated_at = now() where clerk_id = p_actor_user_id;
  insert into public.marketplace_storage_purchases(user_id, idempotency_key, capacity_gb, amount, reference) values(p_actor_user_id, p_idempotency_key, p_capacity_gb, v_amount, v_reference);
  insert into public.marketplace_storage_entitlements(user_id, capacity_gb, updated_at) values(p_actor_user_id, greatest(3, p_capacity_gb), now()) on conflict (user_id) do update set capacity_gb = greatest(public.marketplace_storage_entitlements.capacity_gb, excluded.capacity_gb), updated_at = now();
  insert into public.wallet_transactions(user_id, user_email, type, amount, status, reference, metadata, balance_before, balance_after, idempotency_key, updated_at)
    values(p_actor_user_id, coalesce(p_actor_email, ''), 'purchase', v_amount, 'success', v_reference, jsonb_build_object('operation','marketplace_storage','capacity_gb',p_capacity_gb,'premium_price',v_premium), v_before, v_before - v_amount, 'marketplace-storage:' || p_idempotency_key, now());
  return jsonb_build_object('already_processed', false, 'capacity_gb', greatest(3, p_capacity_gb), 'amount', v_amount, 'reference', v_reference);
end;
$storage$;
revoke all on function public.marketplace_activate_storage_v1(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.marketplace_activate_storage_v1(text, text, text, integer) to service_role;

create or replace function public.marketplace_reserve_asset_v1(p_asset_id uuid,p_actor_id text,p_listing_id uuid,p_object_key text,p_name text,p_type text,p_size bigint)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_capacity bigint;
begin
  perform 1 from public.profiles where clerk_id=p_actor_id for update;
  if not found then raise exception 'PROFILE_REQUIRED'; end if;
  if not exists(select 1 from public.marketplace_listings where id=p_listing_id and seller_id=p_actor_id) then raise exception 'LISTING_OWNER_REQUIRED'; end if;
  if p_type not in('application/pdf','application/zip','image/png','image/jpeg','image/webp') or p_size not between 1 and 262144000 then raise exception 'FILE_INVALID'; end if;
  if (select count(*) from public.marketplace_assets where seller_id=p_actor_id and status in('uploading','quarantined'))>=20 then raise exception 'PENDING_UPLOAD_LIMIT'; end if;
  select (coalesce(e.capacity_gb,3)::bigint * 1073741824) into v_capacity from public.marketplace_storage_entitlements e where e.user_id=p_actor_id;
  v_capacity := coalesce(v_capacity, 3::bigint * 1073741824);
  if coalesce((select sum(coalesce(actual_size,expected_size)) from public.marketplace_assets where seller_id=p_actor_id and status <> 'rejected'),0)+p_size>v_capacity then raise exception 'SELLER_STORAGE_QUOTA'; end if;
  insert into public.marketplace_assets(id,seller_id,listing_id,object_key,original_name,content_type,expected_size) values(p_asset_id,p_actor_id,p_listing_id,p_object_key,p_name,p_type,p_size);
  return true;
end;
$$;
revoke all on function public.marketplace_reserve_asset_v1(uuid,text,uuid,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_reserve_asset_v1(uuid,text,uuid,text,text,text,bigint) to service_role;

commit;
