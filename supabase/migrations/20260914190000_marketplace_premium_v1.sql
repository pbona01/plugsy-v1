-- Apply AFTER the first four marketplace migrations. No charge occurs on installation.
begin;
create table if not exists public.marketplace_premium_payments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(clerk_id),
  idempotency_key text not null,
  amount numeric(12,2) not null check (amount = 1500),
  reference text not null unique,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  terms_version text not null,
  created_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
alter table public.marketplace_premium_payments enable row level security;
revoke all on public.marketplace_premium_payments from public, anon, authenticated;
grant all on public.marketplace_premium_payments to service_role;

create or replace function public.marketplace_activate_premium_v1(p_actor_user_id text, p_actor_email text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $premium$
declare
  v_profile public.profiles%rowtype;
  v_seller public.marketplace_seller_profiles%rowtype;
  v_existing public.marketplace_premium_payments%rowtype;
  v_reference text;
  v_expires timestamptz;
begin
  if p_actor_user_id is null or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$' then
    raise exception 'PREMIUM_INPUT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id || ':premium:' || p_idempotency_key, 0));
  select * into v_existing from public.marketplace_premium_payments where user_id=p_actor_user_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('already_processed',true,'expires_at',v_existing.expires_at); end if;
  select * into v_profile from public.profiles where clerk_id=p_actor_user_id for update;
  if not found then raise exception 'PROFILE_REQUIRED'; end if;
  select * into v_seller from public.marketplace_seller_profiles where user_id=p_actor_user_id for update;
  if not found or v_seller.verification_status <> 'verified' then raise exception 'SELLER_VERIFICATION_REQUIRED'; end if;
  if v_seller.public_selling_enabled and v_seller.public_plan_expires_at > now() then raise exception 'PREMIUM_ALREADY_ACTIVE'; end if;
  if coalesce(v_profile.balance,0) < 1500 then raise exception 'INSUFFICIENT_FUNDS'; end if;
  v_reference := 'MP-PREMIUM-' || gen_random_uuid()::text;
  v_expires := now() + interval '1 month';
  update public.profiles set balance=coalesce(balance,0)-1500,updated_at=now() where clerk_id=p_actor_user_id;
  insert into public.marketplace_premium_payments(user_id,idempotency_key,amount,reference,starts_at,expires_at,terms_version)
    values(p_actor_user_id,p_idempotency_key,1500,v_reference,now(),v_expires,'marketplace-premium-v1');
  insert into public.wallet_transactions(user_id,user_email,type,amount,status,reference,metadata,balance_before,balance_after,idempotency_key,updated_at)
    values(p_actor_user_id,coalesce(p_actor_email,''),'purchase',1500,'success',v_reference,
      jsonb_build_object('operation','marketplace_premium','expires_at',v_expires),coalesce(v_profile.balance,0),coalesce(v_profile.balance,0)-1500,'marketplace-premium:' || p_idempotency_key,now());
  update public.marketplace_seller_profiles set public_selling_enabled=true,public_plan_expires_at=v_expires,updated_at=now() where user_id=p_actor_user_id;
  insert into public.marketplace_audit_events(actor_id,action,entity_id,details)
    values(p_actor_user_id,'premium_activated',p_actor_user_id,jsonb_build_object('reference',v_reference,'amount',1500,'expires_at',v_expires));
  return jsonb_build_object('already_processed',false,'expires_at',v_expires);
end;
$premium$;
revoke all on function public.marketplace_activate_premium_v1(text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_activate_premium_v1(text,text,text) to service_role;
commit;
