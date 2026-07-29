-- Production compatibility bridge.  Apply after wallet funding v2 and before
-- wallet commerce atomic v2 or wallet transfers/withdrawals v2.
--
-- The nullable topic column is additive and deliberately does not rewrite
-- historical messages.  V2 referral rewards are written only by
-- apply_wallet_referral_reward_v2 into wallet_commerce_rewards_v2; the three
-- confirmed legacy financial reward triggers are therefore removed so they
-- cannot credit a V2 order a second time.  Purchase-code assignment and login
-- delivery triggers are intentionally preserved.

begin;

alter table public.messages
  add column if not exists topic text;

drop trigger if exists on_order_paid_referral on public.orders;
drop trigger if exists tr_purchase_code_reward on public.orders;
drop trigger if exists tr_sync_balance on public.purchase_code_rewards;

commit;
