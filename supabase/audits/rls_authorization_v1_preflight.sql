-- Run in Supabase SQL Editor before release. This checks the tables that are
-- accessed directly from the browser and reports any missing RLS coverage.
with protected_tables(table_name) as (
  values
    ('profiles'), ('chats'), ('chat_members'), ('messages'),
    ('statuses'), ('status_views'), ('orders'), ('vp_portfolio_items'),
    ('vp_portfolios')
), table_state as (
  select
    protected_tables.table_name,
    coalesce(public_tables.relrowsecurity, false) as rls_enabled
  from protected_tables
  left join (
    select pg_class.relname, pg_class.relrowsecurity
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
  ) public_tables on public_tables.relname = protected_tables.table_name
)
select
  table_name,
  rls_enabled,
  count(pg_policies.policyname) as policy_count,
  array_agg(pg_policies.policyname order by pg_policies.policyname)
    filter (where pg_policies.policyname is not null) as policies,
  case
    when not rls_enabled then 'FAIL: RLS_DISABLED'
    when count(pg_policies.policyname) = 0 then 'FAIL: NO_POLICIES'
    else 'REVIEW: verify each policy is actor-scoped'
  end as result
from table_state
left join pg_policies
  on pg_policies.schemaname = 'public'
  and pg_policies.tablename = table_state.table_name
group by table_name, rls_enabled
order by table_name;

-- Expected result: no FAIL rows. Do not replace existing live policies without
-- exporting and reviewing them: these tables have different owner/member/admin
-- rules and a blanket policy would create an authorization regression.
