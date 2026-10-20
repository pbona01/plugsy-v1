-- Identity review must never grant, shorten, or clear a separately purchased
-- Marketplace Premium entitlement. Keep the legacy RPC signature for callers,
-- but deliberately ignore p_plan_expires_at.
begin;

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
  if not exists (
    select 1 from public.profiles
    where clerk_id = p_admin_id and lower(role) = 'admin'
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_verified and char_length(btrim(coalesce(p_reference, ''))) not between 10 and 500 then
    raise exception 'REVIEW_REFERENCE_REQUIRED';
  end if;

  insert into public.marketplace_seller_profiles(user_id)
  values(p_seller_id) on conflict(user_id) do nothing;

  -- Only identity fields are written here. In particular, do not touch
  -- public_selling_enabled or public_plan_expires_at, even when the legacy
  -- p_plan_expires_at argument is supplied by an older admin client.
  update public.marketplace_seller_profiles
  set verification_status = case when p_verified then 'verified' else 'rejected' end,
      verification_provider = 'manual_review',
      verification_reference = btrim(p_reference),
      updated_at = now()
  where user_id = p_seller_id;

  if not p_verified then
    update public.marketplace_listings
    set status = 'paused', updated_at = now()
    where seller_id = p_seller_id and visibility = 'public' and status = 'published';
  end if;

  insert into public.marketplace_audit_events(actor_id, action, entity_id, details)
  values(p_admin_id, 'seller_reviewed', p_seller_id,
    jsonb_build_object('verified', p_verified,
      'review_reference', btrim(p_reference),
      'premium_entitlement_modified', false));
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.marketplace_approve_seller_v1(text, text, boolean, text, timestamptz) from public, anon, authenticated;
grant execute on function public.marketplace_approve_seller_v1(text, text, boolean, text, timestamptz) to service_role;

commit;
