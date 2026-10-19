-- Marketplace payouts run on every Lagos business day (Monday-Friday).
-- Seller identity review must not implicitly revoke a separately purchased plan.
begin;

create or replace function public.marketplace_next_payout_at_v1(p_hold_expires_at timestamptz)
returns timestamptz
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_local timestamp;
  v_day date;
  v_time time;
  v_isodow integer;
begin
  if p_hold_expires_at is null then return null; end if;
  v_local := p_hold_expires_at at time zone 'Africa/Lagos';
  v_day := v_local::date;
  v_time := v_local::time;
  v_isodow := extract(isodow from v_day)::integer;

  -- A weekend hold expires into the next business window: Monday at 11:00.
  if v_isodow = 6 then v_day := v_day + 2;
  elsif v_isodow = 7 then v_day := v_day + 1;
  else
    if v_time <= time '11:00' then
      return (v_day + time '11:00') at time zone 'Africa/Lagos';
    end if;
    v_day := v_day + 1;
    if extract(isodow from v_day)::integer = 6 then v_day := v_day + 2;
    elsif extract(isodow from v_day)::integer = 7 then v_day := v_day + 1;
    end if;
  end if;

  return (v_day + time '11:00') at time zone 'Africa/Lagos';
end;
$$;

-- Repair still-held orders calculated by the previous weekend logic.
update public.marketplace_orders
set payout_available_at = public.marketplace_next_payout_at_v1(hold_expires_at)
where payment_status = 'paid' and funds_status = 'held' and hold_expires_at is not null;

update public.marketplace_guest_orders
set payout_available_at = public.marketplace_next_payout_at_v1(hold_expires_at)
where payment_status = 'paid' and funds_status = 'held' and hold_expires_at is not null;

-- Reviewing identity updates verification fields only unless an expiry is
-- explicitly supplied. A blank expiry must never erase an existing Premium plan.
create or replace function public.marketplace_approve_seller_v1(
  p_admin_id text,
  p_seller_id text,
  p_verified boolean,
  p_reference text,
  p_plan_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not exists(select 1 from public.profiles where clerk_id = p_admin_id and lower(role) = 'admin') then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_verified and char_length(btrim(coalesce(p_reference, ''))) not between 10 and 500 then
    raise exception 'REVIEW_REFERENCE_REQUIRED';
  end if;
  if p_plan_expires_at is not null and (p_plan_expires_at <= now() or p_plan_expires_at > now() + interval '1 year') then
    raise exception 'PLAN_EXPIRY_INVALID';
  end if;

  insert into public.marketplace_seller_profiles(user_id)
  values(p_seller_id) on conflict(user_id) do nothing;

  update public.marketplace_seller_profiles
  set verification_status = case when p_verified then 'verified' else 'rejected' end,
      verification_provider = 'manual_review',
      verification_reference = btrim(p_reference),
      public_selling_enabled = case
        when p_plan_expires_at is not null then p_verified
        else public_selling_enabled
      end,
      public_plan_expires_at = coalesce(p_plan_expires_at, public_plan_expires_at),
      updated_at = now()
  where user_id = p_seller_id;

  if not p_verified then
    update public.marketplace_listings
    set status = 'paused', updated_at = now()
    where seller_id = p_seller_id and visibility = 'public' and status = 'published';
  end if;

  insert into public.marketplace_audit_events(actor_id, action, entity_id, details)
  values(p_admin_id, 'seller_reviewed', p_seller_id,
    jsonb_build_object('verified', p_verified, 'review_reference', btrim(p_reference), 'plan_expires_at', p_plan_expires_at));
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.marketplace_next_payout_at_v1(timestamptz) from public, anon, authenticated;
grant execute on function public.marketplace_next_payout_at_v1(timestamptz) to service_role;
revoke all on function public.marketplace_approve_seller_v1(text, text, boolean, text, timestamptz) from public, anon, authenticated;
grant execute on function public.marketplace_approve_seller_v1(text, text, boolean, text, timestamptz) to service_role;

commit;
