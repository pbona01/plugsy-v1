-- One Link v1 production preflight.
-- Read-only: this file performs no schema or data changes.

select
  'profiles.table' as check_name,
  case
    when pg_catalog.to_regclass('public.profiles') is not null
      then 'PASS'
    else 'FAIL'
  end as result,
  'public.profiles must exist' as detail;

with required_columns(column_name, expected_type) as (
  values
    ('clerk_id', 'text'),
    ('username', 'text'),
    ('full_name', 'text'),
    ('bio', 'text'),
    ('profile_pic_url', 'text'),
    ('image_url', 'text')
)
select
  'profiles.column.' || required_columns.column_name
    as check_name,
  case
    when columns.column_name is null then 'FAIL'
    when columns.data_type <> required_columns.expected_type
      then 'FAIL'
    else 'PASS'
  end as result,
  coalesce(
    columns.data_type::text,
    'missing; expected ' || required_columns.expected_type
  ) as detail
from required_columns
left join information_schema.columns as columns
  on columns.table_schema = 'public'
 and columns.table_name = 'profiles'
 and columns.column_name = required_columns.column_name
order by required_columns.column_name;

select
  'onelink.table_name_available' as check_name,
  case
    when pg_catalog.to_regclass(
      'public.one_link_page_views_daily_v1'
    ) is null then 'PASS'
    else 'FAIL'
  end as result,
  'one_link_page_views_daily_v1 must not already exist'
    as detail;

select
  'onelink.function_name_available' as check_name,
  case
    when pg_catalog.to_regprocedure(
      'public.increment_one_link_page_view_daily_v1(text,date)'
    ) is null then 'PASS'
    else 'FAIL'
  end as result,
  'increment_one_link_page_view_daily_v1(text,date) must not already exist'
    as detail;

select
  'profiles.username_case_insensitive_duplicates'
    as check_name,
  case
    when pg_catalog.to_regclass('public.profiles') is null
      then 'FAIL'
    when exists (
      select 1
      from public.profiles
      where nullif(pg_catalog.btrim(username), '') is not null
      group by pg_catalog.lower(pg_catalog.btrim(username))
      having pg_catalog.count(*) > 1
    ) then 'FAIL'
    else 'PASS'
  end as result,
  case
    when pg_catalog.to_regclass('public.profiles') is null
      then 'profiles table is missing'
    when exists (
      select 1
      from public.profiles
      where nullif(pg_catalog.btrim(username), '') is not null
      group by pg_catalog.lower(pg_catalog.btrim(username))
      having pg_catalog.count(*) > 1
    ) then 'duplicate usernames exist when compared case-insensitively'
    else 'no case-insensitive duplicate usernames found'
  end as detail;

select
  'extension.plpgsql' as check_name,
  case
    when exists (
      select 1
      from pg_catalog.pg_extension
      where extname = 'plpgsql'
    ) then 'PASS'
    else 'FAIL'
  end as result,
  'plpgsql is required for the increment function' as detail;

with required_types(type_name) as (
  values
    ('text'),
    ('date'),
    ('int8'),
    ('timestamptz')
)
select
  'type.' || required_types.type_name as check_name,
  case
    when types.oid is not null then 'PASS'
    else 'FAIL'
  end as result,
  coalesce(
    pg_catalog.format_type(types.oid, null),
    'missing'
  ) as detail
from required_types
left join pg_catalog.pg_type as types
  on types.typname = required_types.type_name
 and types.typnamespace = (
   select oid
   from pg_catalog.pg_namespace
   where nspname = 'pg_catalog'
 )
order by required_types.type_name;
