-- Read-only preflight for the portfolio extra category badge migration.

with
run_context as (
  select CURRENT_TIMESTAMP as checked_at
),
required_columns(column_name, expected_type) as (
  values
    ('id', 'uuid'),
    ('user_id', 'text'),
    ('category', 'text'),
    ('categories', 'ARRAY')
),
checks as (
  select
    'portfolio.table.vp_portfolios' as check_name,
    case
      when to_regclass('public.vp_portfolios') is not null then 'PASS'
      else 'FAIL'
    end as result,
    coalesce(
      to_regclass('public.vp_portfolios')::text,
      'missing; expected public.vp_portfolios'
    ) as detail

  union all

  select
    'portfolio.column.' || required_columns.column_name as check_name,
    case
      when columns.column_name is null then 'FAIL'
      when columns.data_type = required_columns.expected_type then 'PASS'
      else 'FAIL'
    end as result,
    coalesce(
      columns.data_type::text,
      'missing; expected ' || required_columns.expected_type
    ) as detail
  from required_columns
  left join information_schema.columns as columns
    on columns.table_schema = 'public'
   and columns.table_name = 'vp_portfolios'
   and columns.column_name = required_columns.column_name

  union all

  select
    'portfolio.column.extra_category_name' as check_name,
    case
      when columns.column_name is null then 'PASS'
      when columns.data_type = 'text'
        and columns.is_nullable = 'YES'
        and columns.column_default is null
        then 'PASS'
      else 'FAIL'
    end as result,
    coalesce(
      columns.data_type::text || '; nullable=' || columns.is_nullable,
      'missing; migration will add nullable text with no default'
    ) as detail
  from (
    select 1 as marker
  ) as expected
  left join information_schema.columns as columns
    on columns.table_schema = 'public'
   and columns.table_name = 'vp_portfolios'
   and columns.column_name = 'extra_category_name'

  union all

  select
    'portfolio.constraint.extra_category_name' as check_name,
    case
      when constraints.oid is null then 'PASS'
      when pg_get_constraintdef(constraints.oid) like '%extra_category_name%'
        then 'PASS'
      else 'FAIL'
    end as result,
    coalesce(
      pg_get_constraintdef(constraints.oid),
      'not present; migration will create the validated check'
    ) as detail
  from (
    select 1 as marker
  ) as expected
  left join pg_catalog.pg_constraint as constraints
    on constraints.conrelid = to_regclass('public.vp_portfolios')
   and constraints.conname = 'vp_portfolios_extra_category_name_check'
)
select
  checks.check_name,
  checks.result,
  checks.detail || ' (checked at ' || run_context.checked_at || ')' as detail
from checks
cross join run_context
order by checks.check_name;
