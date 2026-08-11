-- Keep financial dashboard aggregates in PostgreSQL and return only aggregate
-- values to the service-role API. Raw ledger rows remain paged in the handler.
create or replace function public.admin_financial_summary_v1()
returns table (
  total_liquidity numeric,
  pending_withdrawal_total numeric,
  pending_withdrawal_count bigint
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    coalesce((select sum(coalesce(p.balance, 0)) from public.profiles p), 0)::numeric,
    coalesce((select sum(coalesce(t.amount, 0)) from public.wallet_transactions t where lower(coalesce(t.type, '')) in ('withdraw', 'withdrawal') and lower(coalesce(t.status, '')) = 'pending'), 0)::numeric,
    coalesce((select count(*) from public.wallet_transactions t where lower(coalesce(t.type, '')) in ('withdraw', 'withdrawal') and lower(coalesce(t.status, '')) = 'pending'), 0)::bigint;
$$;

revoke all on function public.admin_financial_summary_v1() from public, anon, authenticated;
grant execute on function public.admin_financial_summary_v1() to service_role;
