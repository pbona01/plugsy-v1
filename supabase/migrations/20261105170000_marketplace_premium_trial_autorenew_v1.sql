-- First-time Marketplace Premium trial and wallet auto-renewal.
begin;

alter table public.marketplace_seller_profiles
  add column if not exists premium_trial_claimed_at timestamptz,
  add column if not exists premium_auto_renew boolean not null default false,
  add column if not exists premium_plan_code text not null default 'monthly',
  add column if not exists premium_last_renewal_attempt_at timestamptz,
  add column if not exists premium_renewal_failure text;

alter table public.marketplace_seller_profiles
  drop constraint if exists marketplace_seller_profiles_premium_plan_code_check;
alter table public.marketplace_seller_profiles
  add constraint marketplace_seller_profiles_premium_plan_code_check
  check (premium_plan_code in ('monthly', 'yearly'));

create or replace function public.marketplace_start_premium_trial_v1(
  p_actor_user_id text,
  p_plan_code text default 'monthly'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_seller public.marketplace_seller_profiles%rowtype;
  v_expires timestamptz;
begin
  if p_actor_user_id is null or p_plan_code not in ('monthly', 'yearly') then
    raise exception 'PREMIUM_TRIAL_INPUT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id || ':marketplace-premium-trial', 0));
  if not exists (select 1 from public.profiles where clerk_id = p_actor_user_id) then
    raise exception 'PROFILE_REQUIRED';
  end if;
  insert into public.marketplace_seller_profiles (user_id)
    values (p_actor_user_id) on conflict (user_id) do nothing;
  select * into v_seller from public.marketplace_seller_profiles
    where user_id = p_actor_user_id for update;
  if v_seller.premium_trial_claimed_at is not null
     or exists (select 1 from public.marketplace_premium_payments where user_id = p_actor_user_id) then
    raise exception 'PREMIUM_TRIAL_ALREADY_USED';
  end if;
  v_expires := now() + interval '1 month';
  update public.marketplace_seller_profiles set
    public_selling_enabled = true,
    public_plan_expires_at = v_expires,
    premium_trial_claimed_at = now(),
    premium_auto_renew = true,
    premium_plan_code = p_plan_code,
    premium_renewal_failure = null,
    updated_at = now()
  where user_id = p_actor_user_id;
  insert into public.marketplace_audit_events(actor_id, action, entity_id, details)
    values (p_actor_user_id, 'premium_trial_started', p_actor_user_id,
      jsonb_build_object('expires_at', v_expires, 'auto_renew', true, 'plan_code', p_plan_code));
  return jsonb_build_object('trial', true, 'expires_at', v_expires, 'auto_renew', true, 'plan_code', p_plan_code);
end;
$$;

create or replace function public.marketplace_set_premium_auto_renew_v1(
  p_actor_user_id text,
  p_enabled boolean,
  p_plan_code text default 'monthly'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_actor_user_id is null or p_plan_code not in ('monthly', 'yearly') then
    raise exception 'PREMIUM_RENEWAL_INPUT_INVALID';
  end if;
  update public.marketplace_seller_profiles set
    premium_auto_renew = coalesce(p_enabled, false),
    premium_plan_code = p_plan_code,
    premium_renewal_failure = case when p_enabled then null else premium_renewal_failure end,
    updated_at = now()
  where user_id = p_actor_user_id;
  if not found then raise exception 'SELLER_REQUIRED'; end if;
  insert into public.marketplace_audit_events(actor_id, action, entity_id, details)
    values (p_actor_user_id, 'premium_auto_renew_changed', p_actor_user_id,
      jsonb_build_object('enabled', coalesce(p_enabled, false), 'plan_code', p_plan_code));
  return jsonb_build_object('auto_renew', coalesce(p_enabled, false), 'plan_code', p_plan_code);
end;
$$;

create or replace function public.marketplace_process_premium_renewals_v1(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_seller public.marketplace_seller_profiles%rowtype;
  v_profile public.profiles%rowtype;
  v_amount numeric(12,2);
  v_duration interval;
  v_expires timestamptz;
  v_reference text;
  v_idempotency text;
  v_renewed integer := 0;
  v_insufficient integer := 0;
begin
  for v_seller in
    select * from public.marketplace_seller_profiles
    where premium_auto_renew = true
      and public_plan_expires_at is not null
      and public_plan_expires_at <= now()
      and (premium_last_renewal_attempt_at is null or premium_last_renewal_attempt_at < now() - interval '12 hours')
    order by public_plan_expires_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  loop
    update public.marketplace_seller_profiles set premium_last_renewal_attempt_at = now(), updated_at = now()
      where user_id = v_seller.user_id;
    select * into v_profile from public.profiles where clerk_id = v_seller.user_id for update;
    v_amount := case when v_seller.premium_plan_code = 'yearly' then 13500 else 1500 end;
    v_duration := case when v_seller.premium_plan_code = 'yearly' then interval '1 year' else interval '1 month' end;
    if not found or coalesce(v_profile.balance, 0) < v_amount then
      update public.marketplace_seller_profiles set
        public_selling_enabled = false,
        premium_renewal_failure = 'INSUFFICIENT_FUNDS',
        updated_at = now()
      where user_id = v_seller.user_id;
      v_insufficient := v_insufficient + 1;
      continue;
    end if;
    v_reference := 'MP-PREMIUM-AUTO-' || gen_random_uuid()::text;
    v_idempotency := 'premium-auto:' || v_seller.user_id || ':' || to_char(v_seller.public_plan_expires_at at time zone 'UTC', 'YYYYMMDDHH24MISS');
    v_expires := greatest(now(), v_seller.public_plan_expires_at) + v_duration;
    update public.profiles set balance = coalesce(balance, 0) - v_amount, updated_at = now()
      where clerk_id = v_seller.user_id;
    insert into public.marketplace_premium_payments(user_id, idempotency_key, amount, reference, starts_at, expires_at, terms_version, plan_code)
      values(v_seller.user_id, v_idempotency, v_amount, v_reference, now(), v_expires, 'marketplace-premium-v1', v_seller.premium_plan_code);
    insert into public.wallet_transactions(user_id, user_email, type, amount, status, reference, metadata, balance_before, balance_after, idempotency_key, updated_at)
      values(v_seller.user_id, coalesce(v_profile.email, ''), 'purchase', v_amount, 'success', v_reference,
        jsonb_build_object('operation','marketplace_premium_auto_renew','plan_code',v_seller.premium_plan_code,'expires_at',v_expires),
        coalesce(v_profile.balance, 0), coalesce(v_profile.balance, 0) - v_amount, v_idempotency, now());
    update public.marketplace_seller_profiles set
      public_selling_enabled = true,
      public_plan_expires_at = v_expires,
      premium_renewal_failure = null,
      updated_at = now()
    where user_id = v_seller.user_id;
    insert into public.marketplace_audit_events(actor_id, action, entity_id, details)
      values(v_seller.user_id, 'premium_auto_renewed', v_seller.user_id,
        jsonb_build_object('reference',v_reference,'amount',v_amount,'plan_code',v_seller.premium_plan_code,'expires_at',v_expires));
    v_renewed := v_renewed + 1;
  end loop;
  return jsonb_build_object('renewed', v_renewed, 'insufficient_funds', v_insufficient);
end;
$$;

alter table public.portfolio_ad_events_v1
  drop constraint if exists portfolio_ad_events_v1_event_name;
alter table public.portfolio_ad_events_v1
  add constraint portfolio_ad_events_v1_event_name check (
    event_name in ('ViewContent', 'InitiateCheckout', 'ClickButton', 'Contact', 'SubmitForm', 'CompleteRegistration', 'Purchase')
  );

revoke all on function public.marketplace_start_premium_trial_v1(text, text) from public, anon, authenticated;
revoke all on function public.marketplace_set_premium_auto_renew_v1(text, boolean, text) from public, anon, authenticated;
revoke all on function public.marketplace_process_premium_renewals_v1(integer) from public, anon, authenticated;
grant execute on function public.marketplace_start_premium_trial_v1(text, text) to service_role;
grant execute on function public.marketplace_set_premium_auto_renew_v1(text, boolean, text) to service_role;
grant execute on function public.marketplace_process_premium_renewals_v1(integer) to service_role;

commit;
