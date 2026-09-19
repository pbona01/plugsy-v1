-- Run after 20260919100000_marketplace_payout_recovery_v1.sql.
-- Read-only check: it does not credit wallets, change orders or release funds.
select
  to_regclass('public.marketplace_guest_orders') is not null as guest_checkout_ready,
  to_regprocedure('public.marketplace_release_due_orders_v1(integer)') is not null as wallet_payout_worker_ready,
  to_regprocedure('public.marketplace_release_due_guest_orders_v1(integer)') is not null as guest_payout_worker_ready;

select
  order_reference,
  payment_status,
  funds_status,
  amount,
  seller_amount,
  hold_expires_at at time zone 'Africa/Lagos' as protection_ends_wat,
  payout_available_at at time zone 'Africa/Lagos' as wallet_payout_at_wat,
  created_at at time zone 'Africa/Lagos' as purchased_at_wat
from public.marketplace_orders
order by created_at desc
limit 25;

select
  order_reference,
  payment_status,
  funds_status,
  amount,
  seller_amount,
  hold_expires_at at time zone 'Africa/Lagos' as protection_ends_wat,
  payout_available_at at time zone 'Africa/Lagos' as wallet_payout_at_wat,
  created_at at time zone 'Africa/Lagos' as purchased_at_wat
from public.marketplace_guest_orders
order by created_at desc
limit 25;
