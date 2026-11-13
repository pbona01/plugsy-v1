-- Emergency protection for the wallet ledger.
--
-- The browser uses Supabase's public key, which is normal. It must never be
-- able to create ledger entries, alter a balance, or create/alter withdrawals.
-- Plugsy's trusted API uses the service_role and remains able to run the
-- existing funding, conversion, transfer, and withdrawal flows.

create or replace function public.enforce_wallet_write_boundary_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'WALLET_WRITE_NOT_ALLOWED',
      detail = 'Wallet ledger changes must be made by Plugsy’s trusted server.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$function$;

create or replace function public.enforce_profile_wallet_balance_boundary_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if (new.balance, new.funding_balance, new.withdrawable_balance)
      is distinct from
     (old.balance, old.funding_balance, old.withdrawable_balance)
     and current_user not in ('postgres', 'supabase_admin', 'service_role')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'WALLET_BALANCE_WRITE_NOT_ALLOWED',
      detail = 'Wallet balances can only be changed by Plugsy’s trusted server.';
  end if;

  return new;
end
$function$;

drop trigger if exists wallet_transactions_write_boundary_v1 on public.wallet_transactions;
create trigger wallet_transactions_write_boundary_v1
before insert or update or delete on public.wallet_transactions
for each row execute function public.enforce_wallet_write_boundary_v1();

drop trigger if exists withdrawals_write_boundary_v1 on public.withdrawals;
create trigger withdrawals_write_boundary_v1
before insert or update or delete on public.withdrawals
for each row execute function public.enforce_wallet_write_boundary_v1();

drop trigger if exists profiles_wallet_balance_boundary_v1 on public.profiles;
create trigger profiles_wallet_balance_boundary_v1
before update of balance, funding_balance, withdrawable_balance on public.profiles
for each row execute function public.enforce_profile_wallet_balance_boundary_v1();

revoke all on function public.enforce_wallet_write_boundary_v1() from public, anon, authenticated;
revoke all on function public.enforce_profile_wallet_balance_boundary_v1() from public, anon, authenticated;

-- Preserve the fraudulent ledger entries as evidence, but stop this confirmed
-- account from sending the remaining fabricated balance to a bank account.
alter table public.profiles
  add column if not exists wallet_withdrawal_hold boolean not null default false,
  add column if not exists wallet_withdrawal_hold_reason text;

update public.profiles
set
  wallet_withdrawal_hold = true,
  wallet_withdrawal_hold_reason = 'Confirmed fabricated wallet funding incident on 2026-11-12',
  updated_at = now()
where clerk_id = 'user_3M1kMEkT1weo0HnmwNDtjlVer9W'
  and lower(email) = 'plugsyc7w72zx0@fldubai.com';
