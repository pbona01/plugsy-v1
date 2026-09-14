-- Apply after marketplace_foundation_v1. No client is granted ledger access.
begin;

create table if not exists public.marketplace_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null references public.profiles(clerk_id) on delete restrict,
  action text not null,
  entity_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.marketplace_audit_events enable row level security;
revoke all on public.marketplace_audit_events from anon, authenticated;
grant all on public.marketplace_audit_events to service_role;
alter table public.marketplace_seller_profiles add column if not exists public_plan_expires_at timestamptz;
alter table public.marketplace_resale_requests add column if not exists purchase_code text not null default replace(gen_random_uuid()::text,'-','');
create unique index if not exists marketplace_resale_purchase_code_unique on public.marketplace_resale_requests(purchase_code);

create or replace function public.marketplace_resolve_dispute_v1(
  p_admin_id text, p_dispute_id uuid, p_outcome text, p_note text
) returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_dispute public.marketplace_disputes%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_buyer public.profiles%rowtype;
begin
  if not exists (select 1 from public.profiles where clerk_id = p_admin_id and lower(role) = 'admin') then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_outcome not in ('buyer', 'seller') or char_length(btrim(coalesce(p_note, ''))) not between 10 and 3000 then
    raise exception 'RESOLUTION_INVALID';
  end if;
  -- Same order lock as reporting/release; funds cannot be refunded and released.
  select o.* into v_order from public.marketplace_orders o
    join public.marketplace_disputes d on d.order_id = o.id where d.id = p_dispute_id for update of o;
  if not found then raise exception 'DISPUTE_NOT_FOUND'; end if;
  select * into v_dispute from public.marketplace_disputes where id = p_dispute_id for update;
  if v_dispute.status in ('resolved_buyer', 'resolved_seller', 'closed') then
    return jsonb_build_object('success', true, 'already_processed', true, 'status', v_dispute.status);
  end if;
  if v_order.funds_status <> 'disputed' or v_order.payment_status <> 'paid' then raise exception 'ORDER_NOT_DISPUTED'; end if;
  if p_outcome = 'buyer' then
    select * into v_buyer from public.profiles where clerk_id = v_order.buyer_id for update;
    if not found then raise exception 'BUYER_PROFILE_NOT_FOUND'; end if;
    update public.profiles set balance = coalesce(balance, 0) + v_order.amount, updated_at = now() where clerk_id = v_order.buyer_id;
    insert into public.wallet_transactions (user_id,user_email,type,amount,status,reference,metadata,balance_before,balance_after,idempotency_key,updated_at)
      values (v_order.buyer_id,coalesce(v_buyer.email,''),'refund',v_order.amount,'success','marketplace_refund_' || v_order.id,
        jsonb_build_object('operation','marketplace_refund','marketplace_order_id',v_order.id),coalesce(v_buyer.balance,0),coalesce(v_buyer.balance,0)+v_order.amount,'marketplace-refund:' || v_order.id,now());
    update public.marketplace_orders set payment_status='refunded',funds_status='refunded',updated_at=now() where id=v_order.id;
    update public.marketplace_entitlements set access_status='revoked' where order_id=v_order.id;
    update public.marketplace_seller_profiles set upheld_disputes_count=upheld_disputes_count+1,updated_at=now() where user_id=v_order.seller_id;
  else
    -- The release worker credits funds exactly once after this transaction commits.
    update public.marketplace_orders set funds_status='held',updated_at=now() where id=v_order.id;
  end if;
  update public.marketplace_disputes set status='resolved_' || p_outcome,resolution_note=btrim(p_note),resolved_by=p_admin_id,resolved_at=now(),updated_at=now() where id=p_dispute_id;
  insert into public.marketplace_audit_events(actor_id,action,entity_id,details)
    values(p_admin_id,'dispute_resolved',p_dispute_id::text,jsonb_build_object('outcome',p_outcome,'order_id',v_order.id,'note',btrim(p_note)));
  return jsonb_build_object('success',true,'already_processed',false,'outcome',p_outcome);
end;
$$;

create or replace function public.marketplace_approve_seller_v1(
  p_admin_id text, p_seller_id text, p_verified boolean, p_reference text, p_plan_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not exists(select 1 from public.profiles where clerk_id=p_admin_id and lower(role)='admin') then raise exception 'ADMIN_REQUIRED'; end if;
  if p_verified and char_length(btrim(coalesce(p_reference,''))) not between 10 and 500 then raise exception 'REVIEW_REFERENCE_REQUIRED'; end if;
  if p_plan_expires_at is not null and (p_plan_expires_at <= now() or p_plan_expires_at > now()+interval '1 year') then raise exception 'PLAN_EXPIRY_INVALID'; end if;
  insert into public.marketplace_seller_profiles(user_id) values(p_seller_id) on conflict(user_id) do nothing;
  update public.marketplace_seller_profiles set verification_status=case when p_verified then 'verified' else 'rejected' end,
    verification_provider='manual_review',verification_reference=btrim(p_reference),
    public_selling_enabled=p_verified and p_plan_expires_at is not null,public_plan_expires_at=p_plan_expires_at,updated_at=now() where user_id=p_seller_id;
  if not p_verified or p_plan_expires_at is null then
    update public.marketplace_listings set status='paused',updated_at=now() where seller_id=p_seller_id and visibility='public' and status='published';
  end if;
  insert into public.marketplace_audit_events(actor_id,action,entity_id,details)
    values(p_admin_id,'seller_reviewed',p_seller_id,jsonb_build_object('verified',p_verified,'review_reference',btrim(p_reference),'plan_expires_at',p_plan_expires_at));
  return jsonb_build_object('success',true);
end;
$$;
revoke all on function public.marketplace_resolve_dispute_v1(text,uuid,text,text) from public,anon,authenticated;

create or replace function public.marketplace_request_resale_v1(p_actor_id text,p_listing_id uuid,p_percent numeric,p_private_token text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_listing public.marketplace_listings%rowtype; v_request public.marketplace_resale_requests%rowtype;
begin
  select * into v_listing from public.marketplace_listings where id=p_listing_id for update;
  if not found or v_listing.status<>'published' or v_listing.seller_id=p_actor_id or v_listing.resale_policy='not_allowed' then raise exception 'RESALE_UNAVAILABLE'; end if;
  if v_listing.visibility='private' and coalesce(p_private_token,'')<>v_listing.private_access_token then raise exception 'PRIVATE_LISTING_ACCESS_DENIED'; end if;
  if p_percent is null or p_percent not between 1 and 80 then raise exception 'PERCENT_INVALID'; end if;
  select * into v_request from public.marketplace_resale_requests where listing_id=p_listing_id and requester_id=p_actor_id;
  if found then return jsonb_build_object('success',true,'request_id',v_request.id,'status',v_request.status); end if;
  insert into public.marketplace_resale_requests(listing_id,requester_id,seller_id,requested_commission_percent,status,approved_at)
    values(p_listing_id,p_actor_id,v_listing.seller_id,case when v_listing.resale_policy='fixed_percent' then v_listing.resale_commission_percent else p_percent end,
      case when v_listing.resale_policy='fixed_percent' then 'approved' else 'pending' end,case when v_listing.resale_policy='fixed_percent' then now() else null end)
    returning * into v_request;
  insert into public.marketplace_audit_events(actor_id,action,entity_id,details) values(p_actor_id,'resale_requested',v_request.id::text,jsonb_build_object('listing_id',p_listing_id,'status',v_request.status));
  return jsonb_build_object('success',true,'request_id',v_request.id,'status',v_request.status);
end;
$$;

create or replace function public.marketplace_decide_resale_v1(p_actor_id text,p_request_id uuid,p_status text,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_request public.marketplace_resale_requests%rowtype;
begin
  if p_status not in ('approved','rejected','revoked') or char_length(coalesce(p_note,''))>1000 then raise exception 'RESALE_DECISION_INVALID'; end if;
  -- Listing then request: same locking order as checkout.
  perform 1 from public.marketplace_listings where id=(select listing_id from public.marketplace_resale_requests where id=p_request_id) for update;
  select * into v_request from public.marketplace_resale_requests where id=p_request_id for update;
  if not found or v_request.seller_id<>p_actor_id then raise exception 'RESALE_REQUEST_NOT_FOUND'; end if;
  if v_request.status=p_status then return jsonb_build_object('success',true,'already_processed',true); end if;
  if (p_status in ('approved','rejected') and v_request.status<>'pending') or (p_status='revoked' and v_request.status<>'approved') then raise exception 'RESALE_TRANSITION_INVALID'; end if;
  update public.marketplace_resale_requests set status=p_status,seller_note=p_note,approved_at=case when p_status='approved' then now() else approved_at end,updated_at=now() where id=p_request_id;
  insert into public.marketplace_audit_events(actor_id,action,entity_id,details) values(p_actor_id,'resale_decided',p_request_id::text,jsonb_build_object('status',p_status,'note',p_note));
  return jsonb_build_object('success',true);
end;
$$;
revoke all on function public.marketplace_request_resale_v1(text,uuid,numeric,text) from public,anon,authenticated;
revoke all on function public.marketplace_decide_resale_v1(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_request_resale_v1(text,uuid,numeric,text) to service_role;
grant execute on function public.marketplace_decide_resale_v1(text,uuid,text,text) to service_role;
revoke all on function public.marketplace_approve_seller_v1(text,text,boolean,text,timestamptz) from public,anon,authenticated;
grant execute on function public.marketplace_resolve_dispute_v1(text,uuid,text,text) to service_role;
grant execute on function public.marketplace_approve_seller_v1(text,text,boolean,text,timestamptz) to service_role;
commit;
