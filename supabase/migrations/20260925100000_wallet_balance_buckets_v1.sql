-- Wallet balance buckets v1
-- Funding Balance holds direct deposits. Withdrawable Balance holds earnings and transfers.
-- `profiles.balance` remains the backwards-compatible total of both buckets.

begin;

alter table public.profiles
  add column if not exists funding_balance numeric not null default 0,
  add column if not exists withdrawable_balance numeric not null default 0,
  add column if not exists wallet_balance_buckets_initialized_at timestamptz;

-- We cannot safely infer the source of every historical naira from old records.
-- Preserve every existing balance as Funding Balance rather than making any historic
-- funds unexpectedly withdrawable. New transactions are bucketed below.
update public.profiles
set funding_balance = coalesce(balance, 0),
    withdrawable_balance = 0,
    wallet_balance_buckets_initialized_at = now()
where wallet_balance_buckets_initialized_at is null;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_funding_balance_nonnegative_v1') then
    alter table public.profiles add constraint profiles_funding_balance_nonnegative_v1 check (funding_balance >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_withdrawable_balance_nonnegative_v1') then
    alter table public.profiles add constraint profiles_withdrawable_balance_nonnegative_v1 check (withdrawable_balance >= 0);
  end if;
end
$constraints$;

create or replace function public.wallet_balance_total_v1(p_funding numeric, p_withdrawable numeric)
returns numeric language sql immutable set search_path = pg_catalog as $function$
  select coalesce(p_funding, 0) + coalesce(p_withdrawable, 0)
$function$;

-- Existing product and marketplace RPCs write a wallet transaction after changing the
-- legacy total. This trigger classifies those new ledger entries into a bucket and then
-- recalculates the legacy total. It does not touch historical ledger rows.
create or replace function public.apply_wallet_transaction_buckets_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_profile public.profiles%rowtype;
  v_funding numeric;
  v_withdrawable numeric;
  v_total numeric;
  v_debit numeric;
  v_from_funding numeric;
  v_from_withdrawable numeric;
  v_source jsonb;
  v_order_id text;
  v_is_active boolean;
  v_was_active boolean;
begin
  v_is_active := new.status in ('success', 'confirmed', 'completed', 'paid')
    or (new.type = 'withdraw' and new.status = 'pending');
  v_was_active := tg_op = 'UPDATE' and (
    old.status in ('success', 'confirmed', 'completed', 'paid')
    or (old.type = 'withdraw' and old.status = 'pending')
  );

  -- A failed bank transfer refunds a previously reserved withdrawal exactly once.
  if tg_op = 'UPDATE'
     and old.type = 'withdraw'
     and old.status = 'pending'
     and new.status = 'failed' then
    select * into v_profile from public.profiles where clerk_id = new.user_id for update;
    if found then
      v_funding := coalesce(v_profile.funding_balance, 0)
        + coalesce((old.metadata #>> '{wallet_bucket_v1,funding_debit}')::numeric, 0);
      v_withdrawable := coalesce(v_profile.withdrawable_balance, 0)
        + coalesce((old.metadata #>> '{wallet_bucket_v1,withdrawable_debit}')::numeric,
          coalesce(old.metadata->>'reserved_total', (old.amount + coalesce(old.fee, 0))::text)::numeric);
      update public.profiles
      set funding_balance = v_funding,
          withdrawable_balance = v_withdrawable,
          balance = public.wallet_balance_total_v1(v_funding, v_withdrawable),
          updated_at = now()
      where clerk_id = new.user_id;
    end if;
    return new;
  end if;

  -- A status-only update is relevant only when it becomes active (for example, funding).
  if tg_op = 'UPDATE' and (v_was_active or not v_is_active) then
    return new;
  end if;
  if tg_op = 'INSERT' and not v_is_active then
    return new;
  end if;
  if coalesce(new.metadata->>'wallet_bucket_managed_v1', 'false') = 'true' then
    return new;
  end if;

  select * into v_profile from public.profiles where clerk_id = new.user_id for update;
  if not found then
    return new;
  end if;
  v_funding := coalesce(v_profile.funding_balance, 0);
  v_withdrawable := coalesce(v_profile.withdrawable_balance, 0);

  if new.type = 'fund' then
    v_funding := v_funding + new.amount;
  elsif new.type in ('p2p_receive', 'commission', 'marketplace_sale') then
    v_withdrawable := v_withdrawable + new.amount;
  elsif new.type = 'refund' then
    -- Marketplace refunds restore the same bucket mix when the original purchase is known.
    v_order_id := coalesce(new.metadata->>'marketplace_order_id', '');
    if v_order_id <> '' then
      select metadata->'wallet_bucket_v1' into v_source
      from public.wallet_transactions
      where user_id = new.user_id
        and type = 'purchase'
        and metadata->>'marketplace_order_id' = v_order_id
      order by created_at desc
      limit 1;
    end if;
    if v_source is null then
      v_funding := v_funding + new.amount;
    else
      v_funding := v_funding + least(new.amount, coalesce((v_source->>'funding_debit')::numeric, 0));
      v_withdrawable := v_withdrawable + greatest(0, new.amount - coalesce((v_source->>'funding_debit')::numeric, 0));
    end if;
  elsif new.type in ('purchase', 'p2p_send', 'withdraw') then
    v_debit := case
      when new.type = 'withdraw' then coalesce((new.metadata->>'reserved_total')::numeric, new.amount + coalesce(new.fee, 0))
      else new.amount
    end;
    v_from_funding := least(v_funding, v_debit);
    v_from_withdrawable := v_debit - v_from_funding;
    if v_from_withdrawable > v_withdrawable then
      raise exception using errcode = '22003', message = 'INSUFFICIENT_BUCKET_BALANCE';
    end if;
    v_funding := v_funding - v_from_funding;
    v_withdrawable := v_withdrawable - v_from_withdrawable;
    update public.wallet_transactions
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'wallet_bucket_v1', jsonb_build_object(
        'funding_debit', v_from_funding,
        'withdrawable_debit', v_from_withdrawable
      )
    )
    where id = new.id;
  else
    return new;
  end if;

  v_total := public.wallet_balance_total_v1(v_funding, v_withdrawable);
  update public.profiles
  set funding_balance = v_funding,
      withdrawable_balance = v_withdrawable,
      balance = v_total,
      updated_at = now()
  where clerk_id = new.user_id;
  return new;
end
$function$;

drop trigger if exists wallet_transaction_buckets_v1 on public.wallet_transactions;
create trigger wallet_transaction_buckets_v1
after insert or update of status on public.wallet_transactions
for each row execute function public.apply_wallet_transaction_buckets_v1();

-- The old referral helper credits profiles directly, so make that credit Withdrawable.
create or replace function public.apply_wallet_referral_reward_v2(
  p_source_type text,
  p_source_reference text,
  p_purchaser_user_id text,
  p_purchase_code text,
  p_purchase_amount numeric
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $function$
declare
  v_owner public.profiles%rowtype;
  v_bonus numeric := 0;
  v_reward numeric;
  v_funding numeric;
  v_withdrawable numeric;
begin
  if coalesce(btrim(p_purchase_code), '') = '' then return jsonb_build_object('applied', false, 'reason', 'no_code'); end if;
  select * into v_owner from public.profiles
  where lower(btrim(purchase_code)) = lower(btrim(p_purchase_code)) for update;
  if not found or v_owner.clerk_id = p_purchaser_user_id then return jsonb_build_object('applied', false, 'reason', 'invalid_or_self_code'); end if;
  v_bonus := case v_owner.medal_tier when 'Gold' then .20 when 'Silver' then .15 when 'Bronze' then .10 else 0 end;
  v_reward := round(p_purchase_amount * (.10 + v_bonus));
  insert into public.wallet_commerce_rewards_v2(source_type, source_reference, purchaser_user_id, recipient_user_id, purchase_code, amount)
  values(p_source_type, p_source_reference, p_purchaser_user_id, v_owner.clerk_id, upper(btrim(p_purchase_code)), v_reward)
  on conflict (source_type, source_reference) do nothing;
  if not found then return jsonb_build_object('applied', false, 'reason', 'already_processed'); end if;
  v_funding := coalesce(v_owner.funding_balance, 0);
  v_withdrawable := coalesce(v_owner.withdrawable_balance, 0) + v_reward;
  update public.profiles
  set funding_balance = v_funding,
      withdrawable_balance = v_withdrawable,
      balance = public.wallet_balance_total_v1(v_funding, v_withdrawable),
      total_referral_earnings = coalesce(total_referral_earnings, 0) + v_reward,
      referral_count = coalesce(referral_count, 0) + 1,
      updated_at = now()
  where clerk_id = v_owner.clerk_id;
  perform public.insert_wallet_notification_v2('reward:' || p_source_type || ':' || p_source_reference, v_owner.clerk_id, 'reward', 'referral', 'You earned NGN ' || v_reward::text || ' referral commission.', jsonb_build_object('source_type', p_source_type, 'source_reference', p_source_reference, 'amount', v_reward));
  return jsonb_build_object('applied', true, 'recipient_user_id', v_owner.clerk_id, 'amount', v_reward);
end
$function$;

create or replace function public.move_funding_to_withdrawable_v1(
  p_actor_user_id text,
  p_actor_email text,
  p_amount numeric,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $function$
declare
  v_profile public.profiles%rowtype;
  v_existing public.wallet_transactions%rowtype;
  v_fee numeric;
  v_net numeric;
  v_before numeric;
  v_after numeric;
  v_reference text;
begin
  if coalesce(btrim(p_actor_user_id), '') = '' or coalesce(btrim(p_idempotency_key), '') = '' or coalesce(p_amount, 0) <= 0 or round(p_amount, 2) <> p_amount then
    raise exception using errcode='22023', message='FUNDING_CONVERSION_INVALID';
  end if;
  v_reference := 'funding_to_withdrawable_' || md5(concat_ws('|', p_actor_user_id, p_idempotency_key));
  select * into v_existing from public.wallet_transactions where reference = v_reference for update;
  if found then
    return jsonb_build_object('success', true, 'already_processed', true, 'reference', v_reference, 'amount', v_existing.amount, 'fee', coalesce(v_existing.fee,0), 'net_amount', v_existing.amount - coalesce(v_existing.fee,0), 'balance_after', v_existing.balance_after);
  end if;
  select * into v_profile from public.profiles where clerk_id = p_actor_user_id for update;
  if not found then raise exception using errcode='P0002', message='PROFILE_NOT_FOUND'; end if;
  if coalesce(v_profile.funding_balance,0) < p_amount then raise exception using errcode='22003', message='INSUFFICIENT_FUNDING_BALANCE'; end if;
  v_fee := round(p_amount * .035, 2);
  v_net := p_amount - v_fee;
  if v_net <= 0 then raise exception using errcode='22023', message='FUNDING_CONVERSION_INVALID'; end if;
  v_before := coalesce(v_profile.balance,0);
  v_after := v_before - v_fee;
  update public.profiles
  set funding_balance = funding_balance - p_amount,
      withdrawable_balance = withdrawable_balance + v_net,
      balance = v_after,
      updated_at = now()
  where clerk_id = p_actor_user_id;
  insert into public.wallet_transactions(user_id,user_email,type,amount,fee,status,reference,metadata,balance_before,balance_after,idempotency_key,currency,updated_at)
  values(p_actor_user_id,p_actor_email,'funding_conversion',p_amount,v_fee,'success',v_reference,jsonb_build_object('operation','funding_to_withdrawable','wallet_bucket_managed_v1',true,'net_amount',v_net,'processing_fee_rate',.035),v_before,v_after,p_idempotency_key,'NGN',now());
  return jsonb_build_object('success',true,'already_processed',false,'reference',v_reference,'amount',p_amount,'fee',v_fee,'net_amount',v_net,'balance_after',v_after);
end
$function$;

create or replace function public.reserve_wallet_withdrawal_v3(
  p_actor_user_id text,
  p_actor_email text,
  p_amount numeric,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $function$
declare
  v_operation public.wallet_operation_idempotency_v2%rowtype;
  v_profile public.profiles%rowtype;
  v_withdrawal public.withdrawals%rowtype;
  v_fee numeric;
  v_total numeric;
  v_before numeric;
  v_after numeric;
  v_reference text;
  v_fingerprint text;
  v_result jsonb;
begin
  if coalesce(btrim(p_actor_user_id), '') = '' or coalesce(btrim(p_idempotency_key), '') = '' or coalesce(p_amount,0) < 1000 or round(p_amount,2) <> p_amount then raise exception using errcode='22023',message='WITHDRAWAL_REQUEST_INVALID'; end if;
  v_fee := case when p_amount < 10000 then 50 when p_amount < 100000 then 100 when p_amount < 1000000 then 500 else 5000 end;
  v_total := p_amount + v_fee;
  v_fingerprint := md5(concat_ws('|',p_actor_user_id,p_amount::text));
  insert into public.wallet_operation_idempotency_v2(actor_user_id,operation_type,idempotency_key,request_fingerprint)
  values(p_actor_user_id,'withdrawal',p_idempotency_key,v_fingerprint) on conflict(actor_user_id,operation_type,idempotency_key) do nothing;
  if not found then
    select * into v_operation from public.wallet_operation_idempotency_v2 where actor_user_id=p_actor_user_id and operation_type='withdrawal' and idempotency_key=p_idempotency_key for update;
    if v_operation.request_fingerprint <> v_fingerprint then raise exception using errcode='23505',message='IDEMPOTENCY_KEY_CONFLICT'; end if;
    if v_operation.status='completed' and v_operation.result is not null then return v_operation.result || jsonb_build_object('already_processed',true); end if;
    raise exception using errcode='40001',message='IDEMPOTENCY_OPERATION_INCOMPLETE';
  end if;
  select * into v_profile from public.profiles where clerk_id=p_actor_user_id for update;
  if not found then raise exception using errcode='P0002',message='PROFILE_NOT_FOUND'; end if;
  if coalesce(btrim(v_profile.bank_code),'')='' or coalesce(btrim(v_profile.bank_name),'')='' or coalesce(btrim(v_profile.account_number),'')='' or coalesce(btrim(v_profile.account_name),'')='' then raise exception using errcode='55000',message='WITHDRAWAL_BANK_REQUIRED'; end if;
  if coalesce(v_profile.withdrawable_balance,0) < v_total then raise exception using errcode='22003',message='INSUFFICIENT_WITHDRAWABLE_FUNDS'; end if;
  v_before := coalesce(v_profile.balance,0); v_after := v_before-v_total;
  v_reference := 'wallet_withdrawal_' || md5(concat_ws('|',p_actor_user_id,p_idempotency_key));
  update public.profiles set withdrawable_balance=withdrawable_balance-v_total,balance=v_after,updated_at=now() where clerk_id=p_actor_user_id;
  insert into public.wallet_transactions(user_id,user_email,type,amount,fee,status,reference,metadata,balance_before,balance_after,idempotency_key,currency,updated_at)
  values(p_actor_user_id,p_actor_email,'withdraw',p_amount,v_fee,'pending',v_reference,jsonb_build_object('operation','withdrawal_reservation','reserved_total',v_total,'wallet_bucket_managed_v1',true,'wallet_bucket_v1',jsonb_build_object('funding_debit',0,'withdrawable_debit',v_total)),v_before,v_after,p_idempotency_key,'NGN',now());
  insert into public.withdrawals(user_id,user_email,user_name,amount,fee,bank_code,bank_name,account_number,account_name,status,reference,idempotency_key,reserved_at,updated_at)
  values(p_actor_user_id,p_actor_email,coalesce(v_profile.full_name,p_actor_email),p_amount,v_fee,v_profile.bank_code,v_profile.bank_name,v_profile.account_number,v_profile.account_name,'reserved',v_reference,p_idempotency_key,now(),now()) returning * into v_withdrawal;
  v_result := jsonb_build_object('success',true,'already_processed',false,'provider_submitted',false,'reference',v_reference,'amount',p_amount,'fee',v_fee,'balance_after',v_after,'bank_code',v_withdrawal.bank_code,'account_number',v_withdrawal.account_number);
  update public.wallet_operation_idempotency_v2 set status='completed',reference=v_reference,result=v_result,completed_at=now() where actor_user_id=p_actor_user_id and operation_type='withdrawal' and idempotency_key=p_idempotency_key;
  return v_result;
end
$function$;

revoke all on function public.move_funding_to_withdrawable_v1(text,text,numeric,text) from public,anon,authenticated;
revoke all on function public.reserve_wallet_withdrawal_v3(text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.move_funding_to_withdrawable_v1(text,text,numeric,text) to service_role;
grant execute on function public.reserve_wallet_withdrawal_v3(text,text,numeric,text) to service_role;

commit;
