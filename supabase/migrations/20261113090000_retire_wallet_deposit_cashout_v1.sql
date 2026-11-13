-- Emergency wallet safety fix: deposits are spend-only funds and must not be
-- transformed into bank-withdrawable funds.
--
-- This preserves all historical records. It only disables the conversion RPC
-- that was exposed by the application and therefore prevents new cash-out.

create or replace function public.move_funding_to_withdrawable_v1(
  p_actor_user_id text,
  p_actor_email text,
  p_amount numeric,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  raise exception using
    errcode = '0A000',
    message = 'DEPOSIT_WITHDRAWAL_DISABLED',
    detail = 'Wallet deposits are spend-only and cannot be moved to a bank-withdrawable balance.';
end
$function$;

revoke all on function public.move_funding_to_withdrawable_v1(text, text, numeric, text)
from public, anon, authenticated, service_role;

-- Preserve the ledger and temporarily prevent bank cash-out for any account
-- that used the retired flow. An administrator can clear this hold only after
-- confirming the source of funds and any related payout attempt.
alter table public.profiles
  add column if not exists wallet_cashout_hold boolean not null default false,
  add column if not exists wallet_cashout_hold_reason text;

update public.profiles profile
set
  wallet_cashout_hold = true,
  wallet_cashout_hold_reason = 'Deposit-to-withdrawable conversion requires review',
  updated_at = now()
where exists (
  select 1
  from public.wallet_transactions transaction
  where transaction.user_id = profile.clerk_id
    and transaction.type = 'funding_conversion'
    and transaction.status = 'success'
);

