-- Custom Portfolio now uses up to four seller-entered skill names as its sections.
-- This replaces the preset-category contract while preserving the wallet purchase flow.
begin;

create or replace function public.purchase_custom_portfolio_wallet_v1(
  p_actor_user_id text,
  p_actor_email text,
  p_actor_name text,
  p_categories text[],
  p_idempotency_key text,
  p_purchase_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_operation public.wallet_operation_idempotency_v2%rowtype;
  v_profile public.profiles%rowtype;
  v_portfolio public.vp_portfolios%rowtype;
  v_price numeric;
  v_balance_before numeric;
  v_balance_after numeric;
  v_reference text;
  v_slug text;
  v_fingerprint text;
  v_purchase_id text;
  v_reward jsonb;
  v_result jsonb;
begin
  if coalesce(pg_catalog.btrim(p_actor_user_id), '') = ''
     or coalesce(pg_catalog.btrim(p_idempotency_key), '') = ''
     or coalesce(pg_catalog.array_length(p_categories, 1), 0) not between 1 and 4
     or (select count(distinct pg_catalog.lower(pg_catalog.btrim(skill))) from unnest(p_categories) as skills(skill)) <> pg_catalog.array_length(p_categories, 1)
     or exists (
       select 1 from unnest(p_categories) as skills(skill)
       where pg_catalog.char_length(pg_catalog.btrim(skill)) not between 2 and 40
          or skill ~ '[<>[:cntrl:]]'
     ) then
    raise exception using errcode = '22023', message = 'PORTFOLIO_CATEGORY_INVALID';
  end if;

  select price into v_price
  from public.portfolio_category_prices_v2
  where category = 'custom_portfolio' and is_active = true;
  if v_price is null or v_price <= 0 then
    raise exception using errcode = '22023', message = 'PORTFOLIO_PRICE_INVALID';
  end if;

  v_fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|', p_actor_user_id,
    pg_catalog.array_to_string(p_categories, ','),
    coalesce(pg_catalog.upper(pg_catalog.btrim(p_purchase_code)), '')));

  insert into public.wallet_operation_idempotency_v2 (
    actor_user_id, operation_type, idempotency_key, request_fingerprint
  ) values (p_actor_user_id, 'portfolio_purchase', p_idempotency_key, v_fingerprint)
  on conflict (actor_user_id, operation_type, idempotency_key) do nothing;

  if not found then
    select * into v_operation
    from public.wallet_operation_idempotency_v2
    where actor_user_id = p_actor_user_id
      and operation_type = 'portfolio_purchase'
      and idempotency_key = p_idempotency_key
    for update;
    if v_operation.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    if v_operation.status = 'completed' and v_operation.result is not null then
      return v_operation.result || pg_catalog.jsonb_build_object('already_processed', true);
    end if;
    raise exception using errcode = '40001', message = 'IDEMPOTENCY_OPERATION_INCOMPLETE';
  end if;

  select * into v_profile
  from public.profiles where clerk_id = p_actor_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;

  v_price := pg_catalog.round(v_price * case v_profile.medal_tier
    when 'Gold' then 0.50 when 'Silver' then 0.70 when 'Bronze' then 0.85 else 1 end);
  if v_price is null or v_price <= 0 then
    raise exception using errcode = '22023', message = 'PORTFOLIO_PRICE_INVALID';
  end if;
  v_balance_before := coalesce(v_profile.balance, 0);
  if v_balance_before < v_price then
    raise exception using errcode = '22003', message = 'INSUFFICIENT_FUNDS';
  end if;
  v_balance_after := v_balance_before - v_price;
  v_reference := pg_catalog.concat('wallet_portfolio_', pg_catalog.md5(pg_catalog.concat_ws('|', p_actor_user_id, p_idempotency_key)));
  v_slug := pg_catalog.concat('portfolio-', pg_catalog.substr(pg_catalog.md5(v_reference), 1, 20));

  update public.profiles set balance = v_balance_after, updated_at = pg_catalog.now()
  where clerk_id = p_actor_user_id;

  select * into v_portfolio
  from public.vp_portfolios
  where user_id = p_actor_user_id and status = 'draft'
  order by created_at desc limit 1 for update;

  if found then
    update public.vp_portfolios
    set user_email = p_actor_email,
        full_name = coalesce(nullif(pg_catalog.btrim(p_actor_name), ''), full_name),
        category = p_categories[1], categories = p_categories,
        status = 'active', is_paid = true, paystack_ref = v_reference,
        slug = coalesce(nullif(slug, ''), v_slug)
    where id = v_portfolio.id returning * into v_portfolio;
  else
    insert into public.vp_portfolios (
      user_id, user_email, full_name, category, categories, status, is_paid,
      paystack_ref, slug, color_theme, font_pairing
    ) values (
      p_actor_user_id, p_actor_email, p_actor_name, p_categories[1], p_categories,
      'active', true, v_reference, v_slug, 'classic', 'refined_editorial'
    ) returning * into v_portfolio;
  end if;

  insert into public.portfolio_purchases (
    user_id, user_email, user_name, category, amount, paystack_ref,
    purchase_code_used, purchase_code_owner_id, reward_amount, reward_status,
    idempotency_key, wallet_transaction_reference
  ) values (
    p_actor_user_id, p_actor_email, p_actor_name, 'custom_portfolio', v_price,
    v_reference, nullif(pg_catalog.upper(pg_catalog.btrim(p_purchase_code)), ''),
    null, 0, 'none', p_idempotency_key, v_reference
  ) returning id::text into v_purchase_id;

  insert into public.wallet_transactions (
    user_id, user_email, type, amount, status, reference, metadata,
    balance_before, balance_after, idempotency_key, updated_at
  ) values (
    p_actor_user_id, p_actor_email, 'portfolio_purchase', v_price, 'success',
    v_reference, pg_catalog.jsonb_build_object('operation', 'custom_portfolio_wallet_purchase',
      'portfolio_id', v_portfolio.id::text, 'portfolio_purchase_id', v_purchase_id,
      'categories', to_jsonb(p_categories)), v_balance_before, v_balance_after,
    p_idempotency_key, pg_catalog.now()
  );

  v_reward := public.apply_wallet_referral_reward_v2(
    'portfolio_purchase', v_reference, p_actor_user_id, p_purchase_code, v_price
  );
  if coalesce((v_reward->>'applied')::boolean, false) then
    update public.portfolio_purchases
    set reward_amount = (v_reward->>'amount')::numeric,
        reward_status = 'paid', purchase_code_owner_id = v_reward->>'recipient_user_id'
    where id::text = v_purchase_id;
  end if;

  perform public.insert_wallet_notification_v2(
    pg_catalog.concat('portfolio:', v_reference, ':user'), p_actor_user_id,
    'portfolio_purchased', 'portfolio', 'Your custom portfolio purchase is active.',
    pg_catalog.jsonb_build_object('reference', v_reference,
      'portfolio_id', v_portfolio.id::text, 'categories', to_jsonb(p_categories))
  );
  insert into public.wallet_notification_outbox_v2 (dedupe_key, audience, event, payload)
  values (pg_catalog.concat('portfolio:', v_reference, ':admin'), 'admin',
    'portfolio_purchase', pg_catalog.jsonb_build_object('reference', v_reference,
      'portfolio_id', v_portfolio.id::text, 'amount', v_price,
      'category', 'custom_portfolio', 'categories', to_jsonb(p_categories)))
  on conflict (dedupe_key) do nothing;

  v_result := pg_catalog.jsonb_build_object(
    'success', true, 'already_processed', false, 'reference', v_reference,
    'amount', v_price, 'balance_after', v_balance_after,
    'entitlement', pg_catalog.jsonb_build_object('id', v_portfolio.id,
      'slug', v_portfolio.slug, 'status', v_portfolio.status,
      'categories', v_portfolio.categories)
  );
  update public.wallet_operation_idempotency_v2
  set status = 'completed', reference = v_reference, result = v_result,
      completed_at = pg_catalog.now()
  where actor_user_id = p_actor_user_id and operation_type = 'portfolio_purchase'
    and idempotency_key = p_idempotency_key;
  return v_result;
end
$function$;

revoke all on function public.purchase_custom_portfolio_wallet_v1(text, text, text, text[], text, text) from public, anon, authenticated;
grant execute on function public.purchase_custom_portfolio_wallet_v1(text, text, text, text[], text, text) to service_role;

commit;
