-- Wallet commerce v2 disposable staging verification.
-- This file is intentionally not executed by local repair work.
begin;

do $$
begin
  if to_regclass('public.wallet_operation_idempotency_v2') is null
     or to_regclass('public.financial_manual_review_events_v2') is null
     or to_regclass('public.withdrawal_callback_events_v2') is null then
    raise exception 'wallet commerce v2 objects are missing';
  end if;
end $$;

select has_function_privilege(
  'public',
  'public.purchase_wallet_product_v2(text,text,text,text,text,text)',
  'execute'
) = false as product_rpc_not_public;

select has_function_privilege(
  'public',
  'public.purchase_portfolio_wallet_v2(text,text,text,text[],text,text)',
  'execute'
) = false as portfolio_rpc_not_public;

select has_function_privilege(
  'public',
  'public.transfer_wallet_p2p_v2(text,text,text,numeric,text,text)',
  'execute'
) = false as p2p_rpc_not_public;

select has_function_privilege(
  'public',
  'public.reserve_wallet_withdrawal_v2(text,text,numeric,text)',
  'execute'
) = false as withdrawal_rpc_not_public;

-- The following assertions are intended to be run inside an isolated,
-- disposable transaction with two concurrent sessions:
-- 1. Reuse one idempotency key: exactly one wallet debit and one order.
-- 2. Submit two P2P transfers with one key: exactly one sender debit.
-- 3. Deliver a success callback twice: one settlement event.
-- 4. Deliver a failure callback twice: one refund event.
-- 5. Attempt a non-CapCut product with a forged delivery status: no pending_login.
select count(*) = 0 as no_open_manual_review_events
from public.financial_manual_review_events_v2
where status = 'open';

rollback;
