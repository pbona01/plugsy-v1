-- Read-only production preflight. Run as one statement before the migration.
with
required_profile_columns(column_name, data_type) as (
  values
    ('id', null::text),
    ('clerk_id', 'text'),
    ('email', 'text'),
    ('full_name', 'text'),
    ('username', 'text'),
    ('bio', 'text'),
    ('profile_pic_url', 'text'),
    ('image_url', 'text'),
    ('balance', 'numeric'),
    ('updated_at', 'timestamp with time zone')
),
profile_column_state as (
  select pg_catalog.count(*) filter (
    where columns.column_name is not null
      and (
        required_profile_columns.data_type is null
        or columns.data_type = required_profile_columns.data_type
      )
  ) as matching,
  pg_catalog.count(*) as required
  from required_profile_columns
  left join information_schema.columns as columns
    on columns.table_schema = 'public'
   and columns.table_name = 'profiles'
   and columns.column_name = required_profile_columns.column_name
),
wallet_tag_duplicates as (
  select pg_catalog.count(*) as groups
  from (
    select pg_catalog.lower(pg_catalog.btrim(username))
    from public.profiles
    where pg_catalog.lower(pg_catalog.btrim(username)) ~ '^[a-z0-9_]{3,30}$'
    group by pg_catalog.lower(pg_catalog.btrim(username))
    having pg_catalog.count(*) > 1
  ) duplicate_groups
),
one_link_duplicates as (
  select pg_catalog.count(*) as groups
  from (
    select pg_catalog.lower(pg_catalog.btrim(username))
    from public.profiles
    where pg_catalog.lower(pg_catalog.btrim(username)) ~ '^[a-z0-9_]{1,64}$'
    group by pg_catalog.lower(pg_catalog.btrim(username))
    having pg_catalog.count(*) > 1
  ) duplicate_groups
),
rpc_state as (
  select
    procedure_row.oid,
    procedure_row.prosecdef,
    procedure_row.proconfig,
    case when procedure_row.oid is null then ''
      else pg_catalog.pg_get_functiondef(procedure_row.oid)
    end as definition
  from (values (1)) required(dummy)
  left join pg_catalog.pg_proc as procedure_row
    on procedure_row.oid = pg_catalog.to_regprocedure(
      'public.transfer_wallet_p2p_v2(text,text,text,numeric,text,text)'
    )
),
checks(check_name, result, detail) as (
  select
    'schema.profiles_exists',
    case when pg_catalog.to_regclass('public.profiles') is not null
      then 'PASS' else 'FAIL' end,
    'public.profiles must exist'
  union all
  select
    'schema.required_profile_columns',
    case when matching = required then 'PASS' else 'FAIL' end,
    pg_catalog.format('%s of %s required columns match expected types', matching, required)
  from profile_column_state
  union all
  select
    'schema.wallet_transactions_exists',
    case when pg_catalog.to_regclass('public.wallet_transactions') is not null
      then 'PASS' else 'FAIL' end,
    'public.wallet_transactions must exist'
  union all
  select
    'data.wallet_tag_candidates_unique',
    case when groups = 0 then 'PASS' else 'FAIL' end,
    pg_catalog.format('%s duplicate normalized candidate groups', groups)
  from wallet_tag_duplicates
  union all
  select
    'data.one_link_username_candidates_unique',
    case when groups = 0 then 'PASS' else 'FAIL' end,
    pg_catalog.format('%s duplicate normalized candidate groups', groups)
  from one_link_duplicates
  union all
  select
    'wallet.p2p_rpc_shape',
    case
      when oid is not null and prosecdef
       and proconfig @> array['search_path=pg_catalog']::text[]
       and (definition like '%lower(username)%' or definition like '%lower(wallet_tag)%')
        then 'PASS' else 'FAIL'
    end,
    'transfer_wallet_p2p_v2 signature, security definer, search path and recipient lookup must be recognized'
  from rpc_state
  union all
  select
    'wallet.p2p_rpc_service_role_grant',
    case when has_function_privilege(
      'service_role',
      'public.transfer_wallet_p2p_v2(text,text,text,numeric,text,text)',
      'EXECUTE'
    ) then 'PASS' else 'FAIL' end,
    'service_role must retain EXECUTE'
  union all
  select
    'wallet.protected_rpcs_present',
    case when
      pg_catalog.to_regprocedure('public.reserve_wallet_withdrawal_v2(text,text,numeric,text)') is not null
      and pg_catalog.to_regprocedure('public.refund_wallet_withdrawal_v2(text,text,text,text,numeric,text)') is not null
      and pg_catalog.to_regprocedure('public.fulfill_wallet_funding_v2(text,text,text,text,numeric)') is not null
      then 'PASS' else 'FAIL' end,
    'withdrawal and funding RPCs must exist and are not altered by this release'
  union all
  select
    'onelink.analytics_objects_present',
    case when
      pg_catalog.to_regclass('public.one_link_page_views_daily_v1') is not null
      and pg_catalog.to_regprocedure('public.increment_one_link_page_view_daily_v1(text,date)') is not null
      then 'PASS' else 'FAIL' end,
    'existing One Link page-view storage and RPC must exist'
  union all
  select
    'baseline.profile_balance',
    'PASS',
    pg_catalog.format(
      'record before migration: profiles=%s, balance_total=%s',
      pg_catalog.count(*),
      coalesce(pg_catalog.sum(balance), 0)
    )
  from public.profiles
  union all
  select
    'baseline.wallet_transaction_count',
    'PASS',
    pg_catalog.format(
      'record before migration: wallet_transactions=%s',
      pg_catalog.count(*)
    )
  from public.wallet_transactions
)
select check_name, result, detail
from checks
order by check_name;
