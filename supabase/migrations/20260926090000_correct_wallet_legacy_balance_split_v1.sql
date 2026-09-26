-- Correct wallet balance buckets v1
-- One-time repair for the first bucket migration. Historic wallet balances existed
-- before Plugsy could identify their source, so this repair preserves them as
-- Withdrawable rather than making legacy funds look like fresh deposits.

begin;

alter table public.profiles
  add column if not exists wallet_balance_legacy_reclassified_at timestamptz;

update public.profiles
set withdrawable_balance = coalesce(withdrawable_balance, 0) + coalesce(funding_balance, 0),
    funding_balance = 0,
    balance = coalesce(withdrawable_balance, 0) + coalesce(funding_balance, 0),
    wallet_balance_legacy_reclassified_at = now(),
    updated_at = now()
where wallet_balance_buckets_initialized_at is not null
  and wallet_balance_legacy_reclassified_at is null;

-- P2P transfers may spend either balance. Prefer earnings/withdrawable money
-- first so a user keeps their direct deposits available for Plugsy purchases.
create or replace function public.apply_p2p_send_bucket_priority_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_profile public.profiles%rowtype;
  v_funding numeric;
  v_withdrawable numeric;
  v_from_funding numeric;
  v_from_withdrawable numeric;
  v_is_active boolean;
  v_was_active boolean;
begin
  v_is_active := new.status in ('success', 'confirmed', 'completed', 'paid');
  v_was_active := tg_op = 'UPDATE' and old.status in ('success', 'confirmed', 'completed', 'paid');

  if new.type <> 'p2p_send'
     or not v_is_active
     or v_was_active
     or coalesce(new.metadata->>'wallet_bucket_managed_v1', 'false') = 'true' then
    return new;
  end if;

  select * into v_profile
  from public.profiles
  where clerk_id = new.user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;

  v_funding := coalesce(v_profile.funding_balance, 0);
  v_withdrawable := coalesce(v_profile.withdrawable_balance, 0);
  v_from_withdrawable := least(v_withdrawable, new.amount);
  v_from_funding := new.amount - v_from_withdrawable;

  if v_from_funding > v_funding then
    raise exception using errcode = '22003', message = 'INSUFFICIENT_BUCKET_BALANCE';
  end if;

  v_funding := v_funding - v_from_funding;
  v_withdrawable := v_withdrawable - v_from_withdrawable;

  update public.profiles
  set funding_balance = v_funding,
      withdrawable_balance = v_withdrawable,
      balance = public.wallet_balance_total_v1(v_funding, v_withdrawable),
      updated_at = now()
  where clerk_id = new.user_id;

  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'wallet_bucket_managed_v1', true,
    'wallet_bucket_v1', jsonb_build_object(
      'funding_debit', v_from_funding,
      'withdrawable_debit', v_from_withdrawable,
      'priority', 'withdrawable_first'
    )
  );
  return new;
end
$function$;

drop trigger if exists wallet_transaction_p2p_bucket_priority_v1 on public.wallet_transactions;
create trigger wallet_transaction_p2p_bucket_priority_v1
before insert or update of status on public.wallet_transactions
for each row execute function public.apply_p2p_send_bucket_priority_v1();

revoke all on function public.apply_p2p_send_bucket_priority_v1() from public, anon, authenticated;

commit;
