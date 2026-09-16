-- Private products are free to sell by link. Public marketplace listings still
-- require verified identity and an active public seller plan.
begin;

create or replace function public.marketplace_create_wallet_order_v1(
  p_actor_user_id text, p_actor_email text, p_listing_id uuid, p_idempotency_key text,
  p_private_access_token text default null, p_reseller_user_id text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_listing public.marketplace_listings%rowtype; v_profile public.profiles%rowtype;
  v_existing public.marketplace_orders%rowtype; v_order public.marketplace_orders%rowtype;
  v_balance_before numeric; v_balance_after numeric; v_reference text;
  v_reseller_percent numeric := 0; v_reseller_amount numeric := 0; v_platform_fee numeric := 0; v_seller_amount numeric;
begin
  if p_actor_user_id is null or btrim(p_actor_user_id) = '' then raise exception using errcode='22023',message='ACTOR_REQUIRED'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$' then raise exception using errcode='22023',message='IDEMPOTENCY_KEY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id || ':' || p_idempotency_key, 0));
  select * into v_existing from public.marketplace_orders where buyer_id=p_actor_user_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.listing_id<>p_listing_id then raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REUSED'; end if;
    return jsonb_build_object('success',true,'already_processed',true,'order_id',v_existing.id,'reference',v_existing.order_reference,'hold_expires_at',v_existing.hold_expires_at);
  end if;
  select * into v_listing from public.marketplace_listings where id=p_listing_id for update;
  if not found or v_listing.status<>'published' then raise exception using errcode='P0002',message='LISTING_NOT_AVAILABLE'; end if;
  if v_listing.seller_id=p_actor_user_id then raise exception using errcode='22023',message='SELF_PURCHASE_NOT_ALLOWED'; end if;
  if v_listing.visibility='public' and not exists(select 1 from public.marketplace_seller_profiles where user_id=v_listing.seller_id and verification_status='verified') then raise exception using errcode='42501',message='SELLER_VERIFICATION_REQUIRED'; end if;
  if v_listing.visibility='public' and not exists(select 1 from public.marketplace_seller_profiles where user_id=v_listing.seller_id and public_selling_enabled and public_plan_expires_at>now()) then raise exception using errcode='42501',message='SELLER_PLAN_EXPIRED'; end if;
  if v_listing.visibility='private' and coalesce(p_private_access_token,'')<>v_listing.private_access_token then raise exception using errcode='42501',message='PRIVATE_LISTING_ACCESS_DENIED'; end if;
  if v_listing.delivery_asset_id is not null then
    if not exists(select 1 from public.marketplace_assets where id=v_listing.delivery_asset_id and seller_id=v_listing.seller_id and status='clean') then raise exception 'FILE_NOT_READY'; end if;
  elsif coalesce(v_listing.delivery_url,'')='' then raise exception 'DELIVERY_REQUIRED'; end if;
  if p_reseller_user_id is not null then
    if p_reseller_user_id in (p_actor_user_id,v_listing.seller_id) then raise exception 'SELF_REFERRAL_NOT_ALLOWED'; end if;
    select requested_commission_percent into v_reseller_percent from public.marketplace_resale_requests where listing_id=v_listing.id and requester_id=p_reseller_user_id and status='approved' for share;
    if not found or v_listing.resale_policy='not_allowed' then raise exception 'RESELLER_NOT_APPROVED'; end if;
  end if;
  v_reseller_amount:=round(v_listing.price*v_reseller_percent/100,2); v_seller_amount:=v_listing.price-v_platform_fee-v_reseller_amount;
  select * into v_profile from public.profiles where clerk_id=p_actor_user_id for update;
  if not found then raise exception using errcode='P0002',message='PROFILE_NOT_FOUND'; end if;
  v_balance_before:=coalesce(v_profile.balance,0); if v_balance_before<v_listing.price then raise exception using errcode='22003',message='INSUFFICIENT_FUNDS'; end if;
  v_balance_after:=v_balance_before-v_listing.price; v_reference:='marketplace_'||md5(concat_ws('|',p_actor_user_id,p_idempotency_key));
  update public.profiles set balance=v_balance_after,updated_at=now() where clerk_id=p_actor_user_id;
  insert into public.marketplace_orders(order_reference,buyer_id,seller_id,listing_id,reseller_user_id,listing_snapshot,amount,platform_fee,seller_amount,reseller_amount,hold_expires_at,idempotency_key)
    values(upper('MKT-'||substr(md5(v_reference),1,12)),p_actor_user_id,v_listing.seller_id,v_listing.id,case when v_reseller_amount>0 then p_reseller_user_id else null end,jsonb_build_object('title',v_listing.title,'slug',v_listing.slug,'category',v_listing.category,'price',v_listing.price,'delivery_label',v_listing.delivery_label,'delivery_url',v_listing.delivery_url,'delivery_asset_id',v_listing.delivery_asset_id),v_listing.price,v_platform_fee,v_seller_amount,v_reseller_amount,now()+interval '10 hours',p_idempotency_key) returning * into v_order;
  insert into public.marketplace_entitlements(order_id,buyer_id,listing_id) values(v_order.id,p_actor_user_id,v_listing.id);
  insert into public.wallet_transactions(user_id,user_email,type,amount,status,reference,metadata,balance_before,balance_after,idempotency_key,updated_at)
    values(p_actor_user_id,coalesce(p_actor_email,''),'purchase',v_listing.price,'success',v_reference,jsonb_build_object('operation','marketplace_purchase','marketplace_order_id',v_order.id::text,'listing_id',v_listing.id::text,'funds_status','held'),v_balance_before,v_balance_after,p_idempotency_key,now());
  insert into public.marketplace_seller_profiles(user_id) values(v_listing.seller_id) on conflict(user_id) do nothing;
  update public.marketplace_seller_profiles set total_sales_count=total_sales_count+1,updated_at=now() where user_id=v_listing.seller_id;
  return jsonb_build_object('success',true,'already_processed',false,'order_id',v_order.id,'reference',v_order.order_reference,'amount',v_order.amount,'hold_expires_at',v_order.hold_expires_at);
end;
$$;

create or replace function public.marketplace_create_guest_checkout_v1(
  p_listing_id uuid, p_email text, p_reference text, p_private_access_token text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_listing public.marketplace_listings%rowtype; v_seller public.marketplace_seller_profiles%rowtype; v_order public.marketplace_guest_orders%rowtype;
begin
  if p_reference !~ '^mkt_guest_[A-Za-z0-9_-]{20,100}$' then raise exception 'GUEST_REFERENCE_INVALID'; end if;
  if char_length(btrim(coalesce(p_email,''))) not between 5 and 254 then raise exception 'GUEST_EMAIL_INVALID'; end if;
  select * into v_listing from public.marketplace_listings where id=p_listing_id for update;
  if not found or v_listing.status<>'published' then raise exception 'LISTING_NOT_AVAILABLE'; end if;
  select * into v_seller from public.marketplace_seller_profiles where user_id=v_listing.seller_id;
  if v_listing.visibility='public' and (not found or v_seller.verification_status<>'verified') then raise exception 'SELLER_VERIFICATION_REQUIRED'; end if;
  if v_listing.visibility='public' and (not v_seller.public_selling_enabled or v_seller.public_plan_expires_at<=now()) then raise exception 'SELLER_PLAN_EXPIRED'; end if;
  if v_listing.visibility='private' and coalesce(p_private_access_token,'')<>v_listing.private_access_token then raise exception 'PRIVATE_LISTING_ACCESS_DENIED'; end if;
  if v_listing.delivery_asset_id is not null and not exists(select 1 from public.marketplace_assets where id=v_listing.delivery_asset_id and status='clean') then raise exception 'FILE_NOT_READY'; end if;
  if v_listing.delivery_asset_id is null and coalesce(v_listing.delivery_url,'')='' then raise exception 'DELIVERY_REQUIRED'; end if;
  insert into public.marketplace_guest_orders(order_reference,listing_id,seller_id,buyer_email,listing_snapshot,amount,seller_amount)
    values(p_reference,v_listing.id,v_listing.seller_id,lower(btrim(p_email)),jsonb_build_object('title',v_listing.title,'delivery_label',v_listing.delivery_label,'delivery_url',v_listing.delivery_url,'delivery_asset_id',v_listing.delivery_asset_id),v_listing.price,v_listing.price) returning * into v_order;
  return jsonb_build_object('success',true,'reference',v_order.order_reference,'amount',v_order.amount);
end;
$$;

revoke all on function public.marketplace_create_wallet_order_v1(text,text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.marketplace_create_guest_checkout_v1(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_create_wallet_order_v1(text,text,uuid,text,text,text) to service_role;
grant execute on function public.marketplace_create_guest_checkout_v1(uuid,text,text,text) to service_role;
commit;
