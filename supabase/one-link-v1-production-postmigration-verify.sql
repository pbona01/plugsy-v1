-- One Link v1 post-migration verification.
-- Read-only: this file performs no schema or data changes.

select
  'onelink.table_exists' as check_name,
  case
    when pg_catalog.to_regclass(
      'public.one_link_page_views_daily_v1'
    ) is not null then 'PASS'
    else 'FAIL'
  end as result;

with expected(column_name, data_type, is_nullable) as (
  values
    ('owner_user_id', 'text', 'NO'),
    ('view_date', 'date', 'NO'),
    ('view_count', 'bigint', 'NO'),
    ('created_at', 'timestamp with time zone', 'NO'),
    ('updated_at', 'timestamp with time zone', 'NO')
)
select
  'onelink.column.' || expected.column_name as check_name,
  case
    when columns.column_name is null then 'FAIL'
    when columns.data_type <> expected.data_type then 'FAIL'
    when columns.is_nullable <> expected.is_nullable then 'FAIL'
    else 'PASS'
  end as result,
  coalesce(
    columns.data_type || ', nullable=' || columns.is_nullable,
    'missing'
  ) as detail
from expected
left join information_schema.columns as columns
  on columns.table_schema = 'public'
 and columns.table_name = 'one_link_page_views_daily_v1'
 and columns.column_name = expected.column_name
order by expected.column_name;

select
  'onelink.primary_key' as check_name,
  case
    when pg_catalog.pg_get_constraintdef(constraint_row.oid)
      = 'PRIMARY KEY (owner_user_id, view_date)'
      then 'PASS'
    else 'FAIL'
  end as result,
  coalesce(
    pg_catalog.pg_get_constraintdef(constraint_row.oid),
    'missing'
  ) as detail
from (values (1)) as required(dummy)
left join pg_catalog.pg_constraint as constraint_row
  on constraint_row.conrelid = pg_catalog.to_regclass(
    'public.one_link_page_views_daily_v1'
  )
 and constraint_row.conname =
   'one_link_page_views_daily_v1_pkey';

select
  'onelink.non_negative_count_constraint' as check_name,
  case
    when pg_catalog.pg_get_constraintdef(constraint_row.oid)
      like '%view_count >= 0%'
      then 'PASS'
    else 'FAIL'
  end as result,
  coalesce(
    pg_catalog.pg_get_constraintdef(constraint_row.oid),
    'missing'
  ) as detail
from (values (1)) as required(dummy)
left join pg_catalog.pg_constraint as constraint_row
  on constraint_row.conrelid = pg_catalog.to_regclass(
    'public.one_link_page_views_daily_v1'
  )
 and constraint_row.conname =
   'one_link_page_views_daily_v1_view_count_check';

select
  'onelink.rls_enabled' as check_name,
  case
    when class_row.relrowsecurity then 'PASS'
    else 'FAIL'
  end as result
from (values (1)) as required(dummy)
left join pg_catalog.pg_class as class_row
  on class_row.oid = pg_catalog.to_regclass(
    'public.one_link_page_views_daily_v1'
  );

select
  'onelink.increment_function' as check_name,
  case
    when procedure_row.oid is not null
     and procedure_row.prosecdef
     and procedure_row.prorettype = 'pg_catalog.int8'::regtype
      then 'PASS'
    else 'FAIL'
  end as result,
  coalesce(
    pg_catalog.pg_get_functiondef(procedure_row.oid),
    'missing'
  ) as detail
from (values (1)) as required(dummy)
left join pg_catalog.pg_proc as procedure_row
  on procedure_row.oid = pg_catalog.to_regprocedure(
    'public.increment_one_link_page_view_daily_v1(text,date)'
  );

select
  'onelink.function_search_path' as check_name,
  case
    when procedure_row.proconfig @>
      array['search_path=pg_catalog, public']::text[]
      then 'PASS'
    else 'FAIL'
  end as result,
  coalesce(
    pg_catalog.array_to_string(procedure_row.proconfig, '; '),
    'missing'
  ) as detail
from (values (1)) as required(dummy)
left join pg_catalog.pg_proc as procedure_row
  on procedure_row.oid = pg_catalog.to_regprocedure(
    'public.increment_one_link_page_view_daily_v1(text,date)'
  );

with roles(role_name) as (
  values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')
)
select
  'onelink.function_execute.' || roles.role_name as check_name,
  case
    when roles.role_name = 'service_role' and exists (
      select 1
      from information_schema.routine_privileges
      where specific_schema = 'public'
        and routine_name =
          'increment_one_link_page_view_daily_v1'
        and privilege_type = 'EXECUTE'
        and grantee = roles.role_name
    ) then 'PASS'
    when roles.role_name <> 'service_role' and not exists (
      select 1
      from information_schema.routine_privileges
      where specific_schema = 'public'
        and routine_name =
          'increment_one_link_page_view_daily_v1'
        and privilege_type = 'EXECUTE'
        and grantee = roles.role_name
    ) then 'PASS'
    else 'FAIL'
  end as result
from roles
order by roles.role_name;

with roles(role_name) as (
  values ('PUBLIC'), ('anon'), ('authenticated')
),
privileges(privilege_name) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
)
select
  'onelink.table_privilege.' ||
    roles.role_name || '.' ||
    pg_catalog.lower(privileges.privilege_name)
    as check_name,
  case
    when not exists (
      select 1
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name = 'one_link_page_views_daily_v1'
        and grantee = roles.role_name
        and privilege_type = privileges.privilege_name
    ) then 'PASS'
    else 'FAIL'
  end as result
from roles
cross join privileges
order by roles.role_name, privileges.privilege_name;

with privileges(privilege_name) as (
  values ('SELECT'), ('INSERT'), ('UPDATE')
)
select
  'onelink.table_privilege.service_role.' ||
    pg_catalog.lower(privileges.privilege_name)
    as check_name,
  case
    when exists (
      select 1
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name = 'one_link_page_views_daily_v1'
        and grantee = 'service_role'
        and privilege_type = privileges.privilege_name
    ) then 'PASS'
    else 'FAIL'
  end as result
from privileges
order by privileges.privilege_name;
