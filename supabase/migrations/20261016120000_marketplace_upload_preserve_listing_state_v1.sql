-- Adding a delivery file must not unpublish or reset an existing listing.
-- New listings are already drafts; existing listing state is preserved.
begin;

create or replace function public.marketplace_complete_asset_v1(p_actor_id text,p_asset_id uuid,p_size bigint)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_asset public.marketplace_assets%rowtype;
begin
  select * into v_asset from public.marketplace_assets where id=p_asset_id for update;
  if not found or v_asset.seller_id<>p_actor_id or v_asset.status not in('uploading','quarantined') or v_asset.expected_size<>p_size then raise exception 'UPLOAD_UNAVAILABLE'; end if;
  update public.marketplace_listings set updated_at=now() where id=v_asset.listing_id and seller_id=p_actor_id;
  if not found then raise exception 'LISTING_OWNER_REQUIRED'; end if;
  update public.marketplace_assets set status='quarantined',actual_size=p_size where id=v_asset.id;
  return true;
end;
$$;

revoke all on function public.marketplace_complete_asset_v1(text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_complete_asset_v1(text,uuid,bigint) to service_role;

commit;
