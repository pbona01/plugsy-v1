begin;
create table if not exists public.marketplace_assets(
  id uuid primary key default gen_random_uuid(),
  seller_id text not null references public.profiles(clerk_id) on delete restrict,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  object_key text not null unique,
  original_name text not null,
  content_type text not null,
  expected_size bigint not null check(expected_size between 1 and 262144000),
  actual_size bigint,
  status text not null default 'uploading' check(status in ('uploading','quarantined','clean','rejected')),
  scan_reference text,
  created_at timestamptz not null default now(),
  scanned_at timestamptz
);
alter table public.marketplace_assets enable row level security;
revoke all on public.marketplace_assets from anon,authenticated;
grant all on public.marketplace_assets to service_role;
alter table public.marketplace_listings add column if not exists delivery_asset_id uuid references public.marketplace_assets(id) on delete restrict;

create or replace function public.marketplace_reserve_asset_v1(p_asset_id uuid,p_actor_id text,p_listing_id uuid,p_object_key text,p_name text,p_type text,p_size bigint)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  perform 1 from public.profiles where clerk_id=p_actor_id for update;
  if not found then raise exception 'PROFILE_REQUIRED'; end if;
  if not exists(select 1 from public.marketplace_listings where id=p_listing_id and seller_id=p_actor_id) then raise exception 'LISTING_OWNER_REQUIRED'; end if;
  if p_type not in('application/pdf','application/zip','image/png','image/jpeg','image/webp') or p_size not between 1 and 262144000 then raise exception 'FILE_INVALID'; end if;
  if (select count(*) from public.marketplace_assets where seller_id=p_actor_id and status in('uploading','quarantined'))>=20 then raise exception 'PENDING_UPLOAD_LIMIT'; end if;
  if coalesce((select sum(expected_size) from public.marketplace_assets where seller_id=p_actor_id),0)+p_size>1073741824 then raise exception 'SELLER_STORAGE_QUOTA'; end if;
  insert into public.marketplace_assets(id,seller_id,listing_id,object_key,original_name,content_type,expected_size) values(p_asset_id,p_actor_id,p_listing_id,p_object_key,p_name,p_type,p_size);
  return true;
end;
$$;
revoke all on function public.marketplace_reserve_asset_v1(uuid,text,uuid,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_reserve_asset_v1(uuid,text,uuid,text,text,text,bigint) to service_role;

create or replace function public.marketplace_complete_asset_v1(p_actor_id text,p_asset_id uuid,p_size bigint)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_asset public.marketplace_assets%rowtype;
begin
  select * into v_asset from public.marketplace_assets where id=p_asset_id for update;
  if not found or v_asset.seller_id<>p_actor_id or v_asset.status not in('uploading','quarantined') or v_asset.expected_size<>p_size then raise exception 'UPLOAD_UNAVAILABLE'; end if;
  update public.marketplace_listings set delivery_asset_id=v_asset.id,status='draft',updated_at=now() where id=v_asset.listing_id and seller_id=p_actor_id;
  if not found then raise exception 'LISTING_OWNER_REQUIRED'; end if;
  update public.marketplace_assets set status='quarantined',actual_size=p_size where id=v_asset.id;
  return true;
end;
$$;
revoke all on function public.marketplace_complete_asset_v1(text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_complete_asset_v1(text,uuid,bigint) to service_role;
commit;
