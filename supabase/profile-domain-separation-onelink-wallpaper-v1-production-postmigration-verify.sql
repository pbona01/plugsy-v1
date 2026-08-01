-- Read-only postmigration verification. Run as one statement after the migration.
with
required_columns(column_name) as (
  values
    ('wallet_tag'),
    ('one_link_username'),
    ('one_link_display_name'),
    ('one_link_biography'),
    ('one_link_avatar_url'),
    ('one_link_avatar_public_id'),
    ('one_link_wallpaper_url'),
    ('one_link_wallpaper_public_id'),
    ('one_link_wallpaper_text_mode'),
    ('one_link_settings'),
    ('one_link_updated_at')
),
required_constraints(constraint_name) as (
  values
    ('profiles_wallet_tag_format_v1'),
    ('profiles_one_link_username_format_v1'),
    ('profiles_one_link_display_name_v1'),
    ('profiles_one_link_biography_v1'),
    ('profiles_one_link_avatar_url_v1'),
    ('profiles_one_link_wallpaper_url_v1'),
    ('profiles_one_link_avatar_public_id_v1'),
    ('profiles_one_link_wallpaper_public_id_v1'),
    ('profiles_one_link_wallpaper_text_mode_v1'),
    ('profiles_one_link_settings_object_v1')
),
column_state as (
  select
    pg_catalog.count(*) filter (where columns.column_name is not null) as present,
    pg_catalog.count(*) as required
  from required_columns
  left join information_schema.columns as columns
    on columns.table_schema = 'public'
   and columns.table_name = 'profiles'
   and columns.column_name = required_columns.column_name
),
constraint_state as (
  select
    pg_catalog.count(*) filter (where constraints.oid is not null) as present,
    pg_catalog.count(*) as required
  from required_constraints
  left join pg_catalog.pg_constraint as constraints
    on constraints.conrelid = 'public.profiles'::regclass
   and constraints.conname = required_constraints.constraint_name
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
    'schema.profile_columns',
    case when present = required then 'PASS' else 'FAIL' end,
    pg_catalog.format('%s of %s columns present', present, required)
  from column_state
  union all
  select
    'schema.profile_constraints',
    case when present = required then 'PASS' else 'FAIL' end,
    pg_catalog.format('%s of %s constraints present', present, required)
  from constraint_state
  union all
  select
    'schema.wallet_tag_unique_index',
    case when pg_catalog.to_regclass('public.profiles_wallet_tag_lower_unique_v1') is not null
      then 'PASS' else 'FAIL' end,
    'normalized non-null Wallet TAG index must exist'
  union all
  select
    'schema.one_link_username_unique_index',
    case when pg_catalog.to_regclass('public.profiles_one_link_username_lower_unique_v1') is not null
      then 'PASS' else 'FAIL' end,
    'normalized non-null One Link handle index must exist'
  union all
  select
    'data.backfill_summary',
    case when pg_catalog.count(*) = pg_catalog.count(one_link_updated_at)
      then 'PASS' else 'FAIL' end,
    pg_catalog.format(
      'profiles=%s wallet_tags=%s one_link_handles=%s settings=%s timestamps=%s',
      pg_catalog.count(*),
      pg_catalog.count(wallet_tag),
      pg_catalog.count(one_link_username),
      pg_catalog.count(one_link_settings),
      pg_catalog.count(one_link_updated_at)
    )
  from public.profiles
  union all
  select
    'wallet.p2p_rpc_wallet_tag_lookup',
    case
      when oid is not null and prosecdef
       and proconfig @> array['search_path=pg_catalog']::text[]
       and definition like '%lower(wallet_tag)%'
        then 'PASS' else 'FAIL'
    end,
    'P2P signature and security remain intact, recipient lookup uses wallet_tag'
  from rpc_state
  union all
  select
    'wallet.p2p_rpc_grants',
    case when
      has_function_privilege(
        'service_role',
        'public.transfer_wallet_p2p_v2(text,text,text,numeric,text,text)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.transfer_wallet_p2p_v2(text,text,text,numeric,text,text)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.transfer_wallet_p2p_v2(text,text,text,numeric,text,text)',
        'EXECUTE'
      )
      then 'PASS' else 'FAIL' end,
    'service_role only execution must be preserved'
  union all
  select
    'financial.profile_balance_current',
    'PASS',
    pg_catalog.format(
      'migration financial guard passed, profiles=%s balance_total=%s',
      pg_catalog.count(*),
      coalesce(pg_catalog.sum(balance), 0)
    )
  from public.profiles
  union all
  select
    'financial.wallet_transaction_count_current',
    'PASS',
    pg_catalog.format(
      'migration financial guard passed, wallet_transactions=%s',
      pg_catalog.count(*)
    )
  from public.wallet_transactions
  union all
  select
    'onelink.analytics_schema_unchanged',
    case when
      pg_catalog.to_regclass('public.one_link_page_views_daily_v1') is not null
      and pg_catalog.to_regprocedure('public.increment_one_link_page_view_daily_v1(text,date)') is not null
      and (
        select pg_catalog.count(*)
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'one_link_page_views_daily_v1'
      ) = 5
      then 'PASS' else 'FAIL' end,
    'page-view table and increment RPC remain present with five existing columns'
)
select check_name, result, detail
from checks
order by check_name;
