begin;

-- Allow common, downloadable video formats as protected marketplace delivery assets.
create or replace function public.marketplace_reserve_asset_v1(
  p_asset_id uuid,
  p_actor_id text,
  p_listing_id uuid,
  p_object_key text,
  p_name text,
  p_type text,
  p_size bigint
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_capacity bigint;
begin
  perform 1 from public.profiles where clerk_id = p_actor_id for update;
  if not found then raise exception 'PROFILE_REQUIRED'; end if;
  if not exists(select 1 from public.marketplace_listings where id = p_listing_id and seller_id = p_actor_id) then
    raise exception 'LISTING_OWNER_REQUIRED';
  end if;
  if p_type not in (
    'application/pdf', 'application/zip', 'image/png', 'image/jpeg', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime'
  ) or p_size not between 1 and 262144000 then
    raise exception 'FILE_INVALID';
  end if;
  if (select count(*) from public.marketplace_assets where seller_id = p_actor_id and status in ('uploading', 'quarantined')) >= 20 then
    raise exception 'PENDING_UPLOAD_LIMIT';
  end if;
  select coalesce(entitlement.capacity_gb, 3)::bigint * 1073741824
    into v_capacity
    from public.marketplace_storage_entitlements as entitlement
    where entitlement.user_id = p_actor_id;
  v_capacity := coalesce(v_capacity, 3::bigint * 1073741824);
  if coalesce((
    select sum(coalesce(actual_size, expected_size))
    from public.marketplace_assets
    where seller_id = p_actor_id and status <> 'rejected'
  ), 0) + p_size > v_capacity then
    raise exception 'SELLER_STORAGE_QUOTA';
  end if;
  insert into public.marketplace_assets(id, seller_id, listing_id, object_key, original_name, content_type, expected_size)
  values(p_asset_id, p_actor_id, p_listing_id, p_object_key, p_name, p_type, p_size);
  return true;
end;
$$;

revoke all on function public.marketplace_reserve_asset_v1(uuid, text, uuid, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.marketplace_reserve_asset_v1(uuid, text, uuid, text, text, text, bigint) to service_role;

commit;
