begin;

create table public.one_link_page_views_daily_v1 (
  owner_user_id text not null,
  view_date date not null,
  view_count bigint not null default 0,
  created_at timestamp with time zone not null
    default pg_catalog.now(),
  updated_at timestamp with time zone not null
    default pg_catalog.now(),
  constraint one_link_page_views_daily_v1_pkey
    primary key (owner_user_id, view_date),
  constraint one_link_page_views_daily_v1_owner_user_id_check
    check (
      pg_catalog.length(pg_catalog.btrim(owner_user_id))
      between 1 and 255
    ),
  constraint one_link_page_views_daily_v1_view_count_check
    check (view_count >= 0)
);

alter table public.one_link_page_views_daily_v1
  enable row level security;

revoke all on table public.one_link_page_views_daily_v1
  from public, anon, authenticated;

grant select, insert, update
  on table public.one_link_page_views_daily_v1
  to service_role;

create function public.increment_one_link_page_view_daily_v1(
  p_owner_user_id text,
  p_view_date date
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_owner_user_id text :=
    pg_catalog.btrim(p_owner_user_id);
  v_view_count bigint;
begin
  if v_owner_user_id is null
     or v_owner_user_id = ''
     or pg_catalog.length(v_owner_user_id) > 255
     or p_view_date is null then
    raise exception 'invalid one link page-view input'
      using errcode = '22023';
  end if;

  insert into public.one_link_page_views_daily_v1 (
    owner_user_id,
    view_date,
    view_count,
    created_at,
    updated_at
  )
  values (
    v_owner_user_id,
    p_view_date,
    1,
    pg_catalog.now(),
    pg_catalog.now()
  )
  on conflict (owner_user_id, view_date)
  do update
    set view_count =
          public.one_link_page_views_daily_v1.view_count + 1,
        updated_at = pg_catalog.now()
  returning view_count into v_view_count;

  return v_view_count;
end;
$function$;

revoke all on function
  public.increment_one_link_page_view_daily_v1(text, date)
  from public, anon, authenticated;

grant execute on function
  public.increment_one_link_page_view_daily_v1(text, date)
  to service_role;

commit;
