-- Read-only verification for the portfolio extra category badge migration.

with
run_context as (
  select CURRENT_TIMESTAMP as checked_at
),
constraint_info as (
  select
    constraints.oid,
    constraints.convalidated,
    pg_get_constraintdef(constraints.oid) as definition
  from pg_catalog.pg_constraint as constraints
  where constraints.conrelid = to_regclass('public.vp_portfolios')
    and constraints.conname = 'vp_portfolios_extra_category_name_check'
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
    'portfolio.column.extra_category_name' as check_name,
    case
      when columns.column_name is not null
        and columns.data_type = 'text'
        and columns.is_nullable = 'YES'
        and columns.column_default is null
        then 'PASS'
      else 'FAIL'
    end as result,
    coalesce(
      columns.data_type::text
        || '; nullable=' || columns.is_nullable
        || '; default=' || coalesce(columns.column_default, 'NULL'),
      'missing; expected nullable text with no default'
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
    'portfolio.constraint.extra_category_name.exists' as check_name,
    case when constraint_info.oid is not null then 'PASS' else 'FAIL' end as result,
    coalesce(
      constraint_info.oid::text,
      'missing; expected vp_portfolios_extra_category_name_check'
    ) as detail
  from (
    select 1 as marker
  ) as expected
  left join constraint_info on true

  union all

  select
    'portfolio.constraint.extra_category_name.validated' as check_name,
    case
      when constraint_info.convalidated is true then 'PASS'
      else 'FAIL'
    end as result,
    coalesce(
      constraint_info.convalidated::text,
      'missing; expected pg_constraint.convalidated = true'
    ) as detail
  from (
    select 1 as marker
  ) as expected
  left join constraint_info on true

  union all

  select
    'portfolio.constraint.extra_category_name.definition' as check_name,
    case
      when constraint_info.definition like '%extra_category_name%'
        and constraint_info.definition like '%btrim%'
        and constraint_info.definition like '%char_length%'
        and constraint_info.definition like '%40%'
        and constraint_info.definition not like '%240%'
        and constraint_info.definition like '%cntrl%'
        and constraint_info.definition like '%alnum%'
        and position('[<>]' in constraint_info.definition) > 0
        then 'PASS'
      else 'FAIL'
    end as result,
    coalesce(
      constraint_info.definition,
      'missing; expected trim, 40-character, control, alphanumeric and [<>] protections'
    ) as detail
  from (
    select 1 as marker
  ) as expected
  left join constraint_info on true

  union all

  select
    'portfolio.purchased_categories.columns' as check_name,
    case
      when category.column_name is not null
        and categories.column_name is not null
        then 'PASS'
      else 'FAIL'
    end as result,
    coalesce(
      category.data_type || ', ' || categories.data_type,
      'category/categories columns must remain present'
    ) as detail
  from (
    select 1 as marker
  ) as expected
  left join information_schema.columns as category
    on category.table_schema = 'public'
   and category.table_name = 'vp_portfolios'
   and category.column_name = 'category'
  left join information_schema.columns as categories
    on categories.table_schema = 'public'
   and categories.table_name = 'vp_portfolios'
   and categories.column_name = 'categories'
)
select
  checks.check_name,
  checks.result,
  checks.detail || ' (checked at ' || run_context.checked_at || ')' as detail
from checks
cross join run_context
order by checks.check_name;
