begin;

do $$
declare
  existing_type text;
begin
  if to_regclass('public.vp_portfolios') is null then
    raise exception
      'portfolio extra category migration requires public.vp_portfolios';
  end if;

  select columns.udt_name
    into existing_type
  from information_schema.columns as columns
  where columns.table_schema = 'public'
    and columns.table_name = 'vp_portfolios'
    and columns.column_name = 'extra_category_name';

  if existing_type is not null and existing_type <> 'text' then
    raise exception
      'extra_category_name exists with incompatible type: %',
      existing_type;
  end if;

  if existing_type is null then
    alter table public.vp_portfolios
      add column extra_category_name text null;
  end if;
end
$$;

alter table public.vp_portfolios
  drop constraint if exists vp_portfolios_extra_category_name_check;

alter table public.vp_portfolios
  add constraint vp_portfolios_extra_category_name_check
  check (
    extra_category_name is null
    or (
      extra_category_name = btrim(extra_category_name)
      and char_length(extra_category_name) between 2 and 40
      and extra_category_name !~ '[[:cntrl:]]'
      and extra_category_name ~ '[[:alnum:]]'
      and extra_category_name !~ '[<>]'
    )
  );

commit;
