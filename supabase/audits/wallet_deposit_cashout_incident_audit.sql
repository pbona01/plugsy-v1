-- Read-only incident audit. Run this before changing any user balance.
-- It identifies the affected account's deposit, conversion, and withdrawal trail.

with target as (
  select clerk_id, email, full_name, balance, funding_balance, withdrawable_balance, updated_at
  from public.profiles
  where lower(email) = lower('plugsyc7w72zx0@fldubai.com')
), ledger as (
  select
    t.created_at,
    t.type,
    t.status,
    t.amount,
    coalesce(t.fee, 0) as fee,
    t.reference,
    t.provider_transaction_id,
    t.balance_before,
    t.balance_after,
    t.metadata
  from public.wallet_transactions t
  join target p on p.clerk_id = t.user_id
), withdrawal_attempts as (
  select
    w.created_at,
    w.status,
    w.amount,
    coalesce(w.fee, 0) as fee,
    w.reference,
    w.provider_transaction_id,
    w.provider_status,
    w.submitted_at,
    w.settled_at,
    w.refunded_at
  from public.withdrawals w
  join target p on p.clerk_id = w.user_id
)
select 'profile' as record_type, to_jsonb(target) as record from target
union all
select 'wallet_transaction', to_jsonb(ledger) from ledger
union all
select 'withdrawal', to_jsonb(withdrawal_attempts) from withdrawal_attempts
order by record_type, record->>'created_at';
