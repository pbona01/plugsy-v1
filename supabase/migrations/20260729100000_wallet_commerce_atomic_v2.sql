begin;

do $preflight$
declare
  v_missing text;
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.wallet_transactions') is null
     or to_regclass('public.orders') is null
     or to_regclass('public.plans') is null
     or to_regclass('public.portfolio_purchases') is null
     or to_regclass('public.vp_portfolios') is null
     or to_regclass('public.messages') is null then
    raise exception
      'wallet commerce v2 preflight failed: required tables are missing';
  end if;

  select pg_catalog.string_agg(
    required.table_name || '.' || required.column_name,
    ', '
  )
  into v_missing
  from (
    values
      ('profiles', 'id'),
      ('profiles', 'clerk_id'),
      ('profiles', 'email'),
      ('profiles', 'full_name'),
      ('profiles', 'balance'),
      ('profiles', 'username'),
      ('profiles', 'purchase_code'),
      ('profiles', 'medal_tier'),
      ('profiles', 'medal_number'),
      ('profiles', 'total_referral_earnings'),
      ('profiles', 'referral_count'),
      ('profiles', 'updated_at'),
      ('wallet_transactions', 'id'),
      ('wallet_transactions', 'user_id'),
      ('wallet_transactions', 'user_email'),
      ('wallet_transactions', 'type'),
      ('wallet_transactions', 'amount'),
      ('wallet_transactions', 'status'),
      ('wallet_transactions', 'reference'),
      ('wallet_transactions', 'metadata'),
      ('wallet_transactions', 'balance_before'),
      ('wallet_transactions', 'balance_after'),
      ('wallet_transactions', 'updated_at'),
      ('orders', 'id'),
      ('orders', 'user_id'),
      ('orders', 'user_email'),
      ('orders', 'product_name'),
      ('orders', 'plan_duration'),
      ('orders', 'plan_months'),
      ('orders', 'plan_duration_days'),
      ('orders', 'amount'),
      ('orders', 'currency'),
      ('orders', 'order_reference'),
      ('orders', 'paystack_ref'),
      ('orders', 'status'),
      ('orders', 'delivery_status'),
      ('orders', 'purchase_code_used'),
      ('orders', 'purchase_code_owner_id'),
      ('orders', 'reward_amount'),
      ('orders', 'reward_status'),
      ('orders', 'created_at'),
      ('plans', 'id'),
      ('plans', 'name'),
      ('plans', 'price'),
      ('plans', 'discount_price'),
      ('plans', 'discount_expires_at'),
      ('plans', 'duration_months'),
      ('plans', 'category'),
      ('plans', 'is_active'),
      ('portfolio_purchases', 'id'),
      ('portfolio_purchases', 'user_id'),
      ('portfolio_purchases', 'user_email'),
      ('portfolio_purchases', 'user_name'),
      ('portfolio_purchases', 'category'),
      ('portfolio_purchases', 'amount'),
      ('portfolio_purchases', 'paystack_ref'),
      ('portfolio_purchases', 'purchase_code_used'),
      ('portfolio_purchases', 'purchase_code_owner_id'),
      ('portfolio_purchases', 'reward_amount'),
      ('portfolio_purchases', 'reward_status'),
      ('portfolio_purchases', 'created_at'),
      ('vp_portfolios', 'id'),
      ('vp_portfolios', 'user_id'),
      ('vp_portfolios', 'user_email'),
      ('vp_portfolios', 'full_name'),
      ('vp_portfolios', 'category'),
      ('vp_portfolios', 'categories'),
      ('vp_portfolios', 'status'),
      ('vp_portfolios', 'is_paid'),
      ('vp_portfolios', 'paystack_ref'),
      ('vp_portfolios', 'slug'),
      ('vp_portfolios', 'color_theme'),
      ('vp_portfolios', 'font_pairing'),
      ('vp_portfolios', 'created_at'),
      ('messages', 'sender_id'),
      ('messages', 'sender_role'),
      ('messages', 'sender_name'),
      ('messages', 'content'),
      ('messages', 'user_id'),
      ('messages', 'event'),
      ('messages', 'topic'),
      ('messages', 'is_from_user'),
      ('messages', 'is_bot'),
      ('messages', 'is_bot_message'),
      ('messages', 'read_by_admin'),
      ('messages', 'read_by_user')
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = required.table_name
      and c.column_name = required.column_name
  );

  if v_missing is not null then
    raise exception
      'wallet commerce v2 preflight failed: missing columns: %',
      v_missing;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vp_portfolios'
      and column_name = 'categories'
      and udt_name = '_text'
  ) then
    raise exception
      'wallet commerce v2 preflight failed: vp_portfolios.categories must be text[]';
  end if;

  if exists (
    select pg_catalog.lower(username)
    from public.profiles
    where username is not null
      and pg_catalog.btrim(username) <> ''
    group by pg_catalog.lower(username)
    having count(*) > 1
  ) then
    raise exception
      'wallet commerce v2 preflight failed: duplicate profile usernames';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'service_role'
  ) then
    raise exception
      'wallet commerce v2 preflight failed: service_role is missing';
  end if;
end
$preflight$;

alter table public.plans
  add column if not exists wallet_product_type text;

alter table public.orders
  add column if not exists idempotency_key text,
  add column if not exists plan_id uuid,
  add column if not exists product_type text;

alter table public.portfolio_purchases
  add column if not exists idempotency_key text,
  add column if not exists wallet_transaction_reference text;

alter table public.wallet_transactions
  add column if not exists idempotency_key text;

do $plan_type_constraint$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.plans'::regclass
      and conname = 'plans_wallet_product_type_v2'
  ) then
    alter table public.plans add constraint plans_wallet_product_type_v2
      check (wallet_product_type in ('capcut', 'medal', 'digital') or wallet_product_type is null);
  end if;
end
$plan_type_constraint$;

do $verified_product_types$
begin
  if not exists (select 1 from public.plans where id = '34849e6d-b139-4048-a72a-9f3f9c83778c'::uuid and name = 'CAPCUT PRO' and category is null)
     or not exists (select 1 from public.plans where id = 'bfdd1523-bbe7-4a50-959d-dcf667ac3866'::uuid and category = 'medal_8k')
     or not exists (select 1 from public.plans where id = '47d36bdb-9988-40f7-98d4-af9e75538ad4'::uuid and category = 'medal_15k')
     or not exists (select 1 from public.plans where id = 'd9b4055f-8792-4c1c-8cfd-a403ae5f3882'::uuid and category = 'medal_20k') then
    raise exception 'wallet commerce v2 preflight failed: verified product plans do not match production configuration';
  end if;

  update public.plans set wallet_product_type = 'capcut'
  where id = '34849e6d-b139-4048-a72a-9f3f9c83778c'::uuid;
  update public.plans set wallet_product_type = 'medal'
  where id in (
    'bfdd1523-bbe7-4a50-959d-dcf667ac3866'::uuid,
    '47d36bdb-9988-40f7-98d4-af9e75538ad4'::uuid,
    'd9b4055f-8792-4c1c-8cfd-a403ae5f3882'::uuid
  );
end
$verified_product_types$;

create table if not exists public.wallet_operation_idempotency_v2 (
  id bigint generated always as identity primary key,
  actor_user_id text not null,
  operation_type text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  status text not null default 'processing',
  reference text,
  result jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint wallet_operation_idempotency_status_v2
    check (status in ('processing', 'completed'))
);

create unique index if not exists
  wallet_operation_idempotency_unique_v2
on public.wallet_operation_idempotency_v2 (
  actor_user_id,
  operation_type,
  idempotency_key
);

create table if not exists public.wallet_commerce_rewards_v2 (
  id bigint generated always as identity primary key,
  source_type text not null,
  source_reference text not null,
  purchaser_user_id text not null,
  recipient_user_id text not null,
  purchase_code text not null,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default pg_catalog.now()
);

create unique index if not exists
  wallet_commerce_rewards_source_unique_v2
on public.wallet_commerce_rewards_v2 (
  source_type,
  source_reference
);

create table if not exists public.wallet_notification_outbox_v2 (
  id bigint generated always as identity primary key,
  dedupe_key text not null,
  recipient_user_id text,
  audience text not null default 'user',
  event text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default pg_catalog.now(),
  processed_at timestamptz,
  constraint wallet_notification_outbox_status_v2
    check (status in ('pending', 'processing', 'sent', 'failed'))
);

create unique index if not exists
  wallet_notification_outbox_dedupe_unique_v2
on public.wallet_notification_outbox_v2 (dedupe_key);

create table if not exists public.portfolio_category_prices_v2 (
  category text primary key,
  display_name text not null,
  price numeric not null check (price > 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default pg_catalog.now()
);

insert into public.portfolio_category_prices_v2 (
  category,
  display_name,
  price
)
values
  ('graphic_design', 'Graphic Design', 1200),
  ('video_editing', 'Video Editing', 1500),
  ('motion_graphics', 'Motion Graphics', 1500),
  ('web_development', 'Web Development', 1200),
  ('uiux_design', 'UI/UX Design', 1450),
  ('copywriting', 'Copywriting', 1400),
  ('content_writing', 'Content Writing', 1400),
  ('digital_marketing', 'Digital Marketing', 1000),
  ('social_media_management', 'Social Media Management', 1000),
  ('photography', 'Photography', 2400),
  ('videography', 'Videography', 2400),
  ('ai_automation', 'AI Automation', 2200),
  ('prompt_engineering', 'Prompt Engineering', 2200),
  ('cybersecurity', 'Cybersecurity', 1800),
  ('three_d_animation', '3D Animation', 1500),
  ('vfx', 'VFX', 1500),
  ('three_d_design', '3D Animation & VFX', 2400)
on conflict (category) do nothing;

do $duplicates$
begin
  if exists (
    select user_id, idempotency_key
    from public.orders
    where idempotency_key is not null
    group by user_id, idempotency_key
    having count(*) > 1
  ) or exists (
    select paystack_ref
    from public.orders
    where paystack_ref is not null
      and product_type is not null
    group by paystack_ref
    having count(*) > 1
  ) or exists (
    select user_id, idempotency_key
    from public.portfolio_purchases
    where idempotency_key is not null
    group by user_id, idempotency_key
    having count(*) > 1
  ) or exists (
    select paystack_ref
    from public.vp_portfolios
    where paystack_ref is not null
      and status = 'active'
      and is_paid = true
    group by paystack_ref
    having count(*) > 1
  ) or exists (
    select user_id
    from public.orders
    where product_type = 'medal'
      and status in ('paid', 'completed')
    group by user_id
    having count(*) > 1
  ) then
    raise exception
      'wallet commerce v2 preflight failed: duplicate idempotency or purchase references';
  end if;

  if exists (
    select pg_catalog.lower(pg_catalog.btrim(purchase_code))
    from public.profiles
    where nullif(pg_catalog.btrim(purchase_code), '') is not null
    group by pg_catalog.lower(pg_catalog.btrim(purchase_code))
    having count(*) > 1
  ) then
    raise exception 'wallet commerce v2 preflight failed: duplicate profile purchase codes';
  end if;
end
$duplicates$;

create unique index if not exists
  profiles_username_lower_unique_v2
on public.profiles (pg_catalog.lower(username))
where username is not null
  and pg_catalog.btrim(username) <> '';

create unique index if not exists
  profiles_purchase_code_lower_unique_v2
on public.profiles (pg_catalog.lower(pg_catalog.btrim(purchase_code)))
where nullif(pg_catalog.btrim(purchase_code), '') is not null;

create unique index if not exists
  orders_idempotency_unique_v2
on public.orders (user_id, idempotency_key)
where idempotency_key is not null;

create unique index if not exists
  orders_wallet_reference_unique_v2
on public.orders (paystack_ref)
where paystack_ref is not null
  and product_type is not null;

create unique index if not exists
  orders_one_medal_per_user_v2
on public.orders (user_id)
where product_type = 'medal'
  and status in ('paid', 'completed');

create unique index if not exists
  portfolio_purchases_idempotency_unique_v2
on public.portfolio_purchases (user_id, idempotency_key)
where idempotency_key is not null;

create unique index if not exists
  portfolio_purchases_reference_unique_v2
on public.portfolio_purchases (paystack_ref)
where paystack_ref is not null
  and idempotency_key is not null;

create unique index if not exists
  vp_portfolios_purchase_reference_unique_v2
on public.vp_portfolios (paystack_ref)
where paystack_ref is not null
  and status = 'active'
  and is_paid = true;

create or replace function public.insert_wallet_notification_v2(
  p_dedupe_key text,
  p_recipient_user_id text,
  p_event text,
  p_topic text,
  p_content text,
  p_payload jsonb default '{}'::jsonb,
  p_audience text default 'user'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  begin
    insert into public.messages (
      sender_id,
      sender_role,
      sender_name,
      content,
      user_id,
      event,
      topic,
      is_from_user,
      is_bot,
      is_bot_message,
      read_by_admin,
      read_by_user
    )
    values (
      'system',
      'system',
      'Plugsy',
      p_content,
      p_recipient_user_id,
      p_event,
      p_topic,
      false,
      true,
      true,
      true,
      false
    );
  exception
    when others then
      insert into public.wallet_notification_outbox_v2 (
        dedupe_key,
        recipient_user_id,
        audience,
        event,
        payload,
        last_error
      )
      values (
        p_dedupe_key,
        p_recipient_user_id,
        p_audience,
        p_event,
        coalesce(p_payload, '{}'::jsonb) ||
          pg_catalog.jsonb_build_object(
            'topic', p_topic,
            'content', p_content
          ),
        sqlerrm
      )
      on conflict (dedupe_key) do nothing;
  end;
end
$function$;

create or replace function public.apply_wallet_referral_reward_v2(
  p_source_type text,
  p_source_reference text,
  p_purchaser_user_id text,
  p_purchase_code text,
  p_purchase_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_owner public.profiles%rowtype;
  v_bonus numeric := 0;
  v_reward numeric;
begin
  if coalesce(pg_catalog.btrim(p_purchase_code), '') = '' then
    return pg_catalog.jsonb_build_object(
      'applied', false,
      'reason', 'no_code'
    );
  end if;

  select *
  into v_owner
  from public.profiles
  where pg_catalog.lower(pg_catalog.btrim(purchase_code)) =
    pg_catalog.lower(pg_catalog.btrim(p_purchase_code))
  for update;

  if not found or v_owner.clerk_id = p_purchaser_user_id then
    return pg_catalog.jsonb_build_object(
      'applied', false,
      'reason', 'invalid_or_self_code'
    );
  end if;

  v_bonus := case v_owner.medal_tier
    when 'Gold' then 0.20
    when 'Silver' then 0.15
    when 'Bronze' then 0.10
    else 0
  end;
  v_reward := pg_catalog.round(
    p_purchase_amount * (0.10 + v_bonus)
  );

  insert into public.wallet_commerce_rewards_v2 (
    source_type,
    source_reference,
    purchaser_user_id,
    recipient_user_id,
    purchase_code,
    amount
  )
  values (
    p_source_type,
    p_source_reference,
    p_purchaser_user_id,
    v_owner.clerk_id,
    pg_catalog.upper(pg_catalog.btrim(p_purchase_code)),
    v_reward
  )
  on conflict (source_type, source_reference) do nothing;

  if not found then
    return pg_catalog.jsonb_build_object(
      'applied', false,
      'reason', 'already_processed'
    );
  end if;

  update public.profiles
  set balance = coalesce(balance, 0) + v_reward,
      total_referral_earnings =
        coalesce(total_referral_earnings, 0) + v_reward,
      referral_count = coalesce(referral_count, 0) + 1,
      updated_at = pg_catalog.now()
  where clerk_id = v_owner.clerk_id;

  perform public.insert_wallet_notification_v2(
    pg_catalog.concat(
      'reward:', p_source_type, ':', p_source_reference
    ),
    v_owner.clerk_id,
    'reward',
    'referral',
    pg_catalog.concat(
      'You earned NGN ',
      v_reward::text,
      ' referral commission.'
    ),
    pg_catalog.jsonb_build_object(
      'source_type', p_source_type,
      'source_reference', p_source_reference,
      'amount', v_reward
    )
  );

  return pg_catalog.jsonb_build_object(
    'applied', true,
    'recipient_user_id', v_owner.clerk_id,
    'amount', v_reward
  );
end
$function$;

create or replace function public.purchase_wallet_product_v2(
  p_actor_user_id text,
  p_actor_email text,
  p_actor_name text,
  p_plan_id uuid,
  p_idempotency_key text,
  p_purchase_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_operation public.wallet_operation_idempotency_v2%rowtype;
  v_plan public.plans%rowtype;
  v_profile public.profiles%rowtype;
  v_order public.orders%rowtype;
  v_product_type text;
  v_reference text;
  v_fingerprint text;
  v_price numeric;
  v_balance_before numeric;
  v_balance_after numeric;
  v_delivery_status text;
  v_medal_tier text;
  v_medal_number integer;
  v_order_reference text;
  v_reward jsonb;
  v_result jsonb;
begin
  if coalesce(pg_catalog.btrim(p_actor_user_id), '') = ''
     or p_plan_id is null
     or coalesce(pg_catalog.btrim(p_idempotency_key), '') = '' then
    raise exception using
      errcode = '22023',
      message = 'PRODUCT_REQUEST_INVALID';
  end if;

  v_fingerprint := pg_catalog.md5(
    pg_catalog.concat_ws(
      '|',
      p_actor_user_id,
      p_plan_id,
      coalesce(pg_catalog.upper(pg_catalog.btrim(p_purchase_code)), '')
    )
  );

  insert into public.wallet_operation_idempotency_v2 (
    actor_user_id,
    operation_type,
    idempotency_key,
    request_fingerprint
  )
  values (
    p_actor_user_id,
    'product_purchase',
    p_idempotency_key,
    v_fingerprint
  )
  on conflict (
    actor_user_id,
    operation_type,
    idempotency_key
  ) do nothing;

  if not found then
    select *
    into v_operation
    from public.wallet_operation_idempotency_v2
    where actor_user_id = p_actor_user_id
      and operation_type = 'product_purchase'
      and idempotency_key = p_idempotency_key
    for update;

    if v_operation.request_fingerprint <> v_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;

    if v_operation.status = 'completed'
       and v_operation.result is not null then
      return v_operation.result ||
        pg_catalog.jsonb_build_object(
          'already_processed', true
        );
    end if;

    raise exception using
      errcode = '40001',
      message = 'IDEMPOTENCY_OPERATION_INCOMPLETE';
  end if;

  select *
  into v_plan
  from public.plans
  where id = p_plan_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'PLAN_NOT_FOUND';
  end if;

  if v_plan.is_active is not true then
    raise exception using
      errcode = '55000',
      message = 'PLAN_INACTIVE';
  end if;

  v_product_type := coalesce(
    nullif(pg_catalog.btrim(v_plan.wallet_product_type), ''),
    case
      when v_plan.category in (
        'medal_8k', 'medal_15k', 'medal_20k'
      ) then 'medal'
      when v_plan.category in (
        'capcut',
        'capcut_pro',
        'capcut_subscription',
        'capcut_max',
        'capcut_max_pro'
      ) then 'capcut'
      else null
    end
  );

  if v_product_type is null then
    raise exception using
      errcode = '55000',
      message = 'PRODUCT_CLASSIFICATION_REQUIRED';
  end if;

  if v_product_type not in ('capcut', 'medal', 'digital') then
    raise exception using
      errcode = '22023',
      message = 'PRODUCT_TYPE_UNSUPPORTED';
  end if;

  select *
  into v_profile
  from public.profiles
  where clerk_id = p_actor_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'PROFILE_NOT_FOUND';
  end if;

  v_price := case
    when v_plan.discount_price is not null
      and v_plan.discount_price > 0
      and v_plan.discount_price < v_plan.price
      and (
        v_plan.discount_expires_at is null
        or v_plan.discount_expires_at > pg_catalog.now()
      )
    then v_plan.discount_price
    else v_plan.price
  end;

  if v_product_type <> 'medal' then
    v_price := pg_catalog.round(
      v_price * case v_profile.medal_tier
        when 'Gold' then 0.50
        when 'Silver' then 0.70
        when 'Bronze' then 0.85
        else 1
      end
    );
  end if;

  if v_price is null or v_price <= 0 then
    raise exception using
      errcode = '22023',
      message = 'PRODUCT_PRICE_INVALID';
  end if;

  if v_product_type = 'medal' then
    lock table public.orders in share row exclusive mode;

    if exists (
      select 1
      from public.orders
      where user_id = p_actor_user_id
        and status in ('paid', 'completed')
        and (
          product_type = 'medal'
          or pg_catalog.lower(product_name) like '%medal%'
        )
    ) then
      raise exception using
        errcode = '23505',
        message = 'MEDAL_ALREADY_OWNED';
    end if;

    select count(*)::integer + 1
    into v_medal_number
    from public.orders
    where status in ('paid', 'completed')
      and (
        product_type = 'medal'
        or pg_catalog.lower(product_name) like '%medal%'
      );

    if v_medal_number > 160 then
      raise exception using
        errcode = '23514',
        message = 'MEDAL_SOLD_OUT';
    end if;

    v_medal_tier := case v_plan.category
      when 'medal_20k' then 'Gold'
      when 'medal_15k' then 'Silver'
      when 'medal_8k' then 'Bronze'
      else null
    end;

    if v_medal_tier is null then
      raise exception using
        errcode = '22023',
        message = 'PRODUCT_CLASSIFICATION_REQUIRED';
    end if;
  end if;

  v_balance_before := coalesce(v_profile.balance, 0);
  if v_balance_before < v_price then
    raise exception using
      errcode = '22003',
      message = 'INSUFFICIENT_FUNDS';
  end if;
  v_balance_after := v_balance_before - v_price;

  v_reference := pg_catalog.concat(
    'wallet_product_',
    pg_catalog.md5(
      pg_catalog.concat_ws(
        '|', p_actor_user_id, p_idempotency_key
      )
    )
  );
  v_order_reference := pg_catalog.concat(
    'REQ-', pg_catalog.upper(pg_catalog.substr(
      pg_catalog.md5(v_reference), 1, 12
    ))
  );
  v_delivery_status := case
    when v_product_type = 'capcut' then 'pending_login'
    else 'delivered'
  end;

  update public.profiles
  set balance = v_balance_after,
      medal_tier = coalesce(v_medal_tier, medal_tier),
      medal_number = coalesce(v_medal_number, medal_number),
      updated_at = pg_catalog.now()
  where clerk_id = p_actor_user_id;

  insert into public.orders (
    user_id,
    user_email,
    product_name,
    plan_duration,
    plan_months,
    plan_duration_days,
    amount,
    currency,
    order_reference,
    paystack_ref,
    status,
    delivery_status,
    purchase_code_used,
    purchase_code_owner_id,
    reward_amount,
    reward_status,
    idempotency_key,
    plan_id,
    product_type
  )
  values (
    p_actor_user_id,
    p_actor_email,
    v_plan.name,
    coalesce(
      to_jsonb(v_plan)->>'duration_label',
      to_jsonb(v_plan)->>'duration',
      'Lifetime'
    ),
    coalesce(v_plan.duration_months, 1),
    coalesce(v_plan.duration_months, 1) * 30,
    v_price,
    'NGN',
    v_order_reference,
    v_reference,
    'paid',
    v_delivery_status,
    nullif(pg_catalog.upper(pg_catalog.btrim(p_purchase_code)), ''),
    null,
    0,
    'none',
    p_idempotency_key,
    p_plan_id,
    v_product_type
  )
  returning *
  into v_order;

  insert into public.wallet_transactions (
    user_id,
    user_email,
    type,
    amount,
    status,
    reference,
    metadata,
    balance_before,
    balance_after,
    idempotency_key,
    updated_at
  )
  values (
    p_actor_user_id,
    p_actor_email,
    'purchase',
    v_price,
    'success',
    v_reference,
    pg_catalog.jsonb_build_object(
      'operation', 'wallet_product_purchase',
      'plan_id', p_plan_id,
      'order_id', v_order.id::text,
      'product_type', v_product_type
    ),
    v_balance_before,
    v_balance_after,
    p_idempotency_key,
    pg_catalog.now()
  );

  v_reward := public.apply_wallet_referral_reward_v2(
    'product_purchase',
    v_reference,
    p_actor_user_id,
    p_purchase_code,
    v_price
  );

  if coalesce((v_reward->>'applied')::boolean, false) then
    update public.orders
    set reward_amount = (v_reward->>'amount')::numeric,
        reward_status = 'paid',
        purchase_code_owner_id =
          v_reward->>'recipient_user_id'
    where id = v_order.id;
  end if;

  perform public.insert_wallet_notification_v2(
    pg_catalog.concat('product:', v_reference, ':user'),
    p_actor_user_id,
    'payment_confirmed',
    'payment',
    case
      when v_product_type = 'capcut' then
        'Wallet payment confirmed. Your CapCut login is pending delivery.'
      when v_product_type = 'medal' then
        'Wallet payment confirmed. Your Plugsy medal is active.'
      else
        'Wallet payment confirmed. Your product is active.'
    end,
    pg_catalog.jsonb_build_object(
      'reference', v_reference,
      'order_id', v_order.id::text,
      'product_type', v_product_type,
      'delivery_status', v_delivery_status
    )
  );

  insert into public.wallet_notification_outbox_v2 (
    dedupe_key,
    audience,
    event,
    payload
  )
  values (
    pg_catalog.concat('product:', v_reference, ':admin'),
    'admin',
    'wallet_product_purchase',
    pg_catalog.jsonb_build_object(
      'reference', v_reference,
      'order_id', v_order.id::text,
      'product_type', v_product_type,
      'amount', v_price
    )
  )
  on conflict (dedupe_key) do nothing;

  v_result := pg_catalog.jsonb_build_object(
    'success', true,
    'already_processed', false,
    'reference', v_reference,
    'product_type', v_product_type,
    'amount', v_price,
    'balance_after', v_balance_after,
    'delivery_status', v_delivery_status,
    'order', pg_catalog.jsonb_build_object(
      'id', v_order.id,
      'product_name', v_order.product_name,
      'status', v_order.status,
      'delivery_status', v_order.delivery_status,
      'order_reference', v_order.order_reference
    ),
    'medal', case
      when v_product_type = 'medal' then
        pg_catalog.jsonb_build_object(
          'tier', v_medal_tier,
          'number', v_medal_number
        )
      else null
    end
  );

  update public.wallet_operation_idempotency_v2
  set status = 'completed',
      reference = v_reference,
      result = v_result,
      completed_at = pg_catalog.now()
  where actor_user_id = p_actor_user_id
    and operation_type = 'product_purchase'
    and idempotency_key = p_idempotency_key;

  return v_result;
end
$function$;

create or replace function public.purchase_portfolio_wallet_v2(
  p_actor_user_id text,
  p_actor_email text,
  p_actor_name text,
  p_categories text[],
  p_idempotency_key text,
  p_purchase_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_operation public.wallet_operation_idempotency_v2%rowtype;
  v_profile public.profiles%rowtype;
  v_portfolio public.vp_portfolios%rowtype;
  v_price numeric;
  v_category_count integer;
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
     or coalesce(pg_catalog.array_length(p_categories, 1), 0)
       not between 1 and 3 then
    raise exception using
      errcode = '22023',
      message = 'PORTFOLIO_CATEGORY_INVALID';
  end if;

  select count(*), max(price)
  into v_category_count, v_price
  from public.portfolio_category_prices_v2
  where category = any(p_categories)
    and is_active = true;

  if v_category_count <> pg_catalog.array_length(p_categories, 1)
     or v_price is null then
    raise exception using
      errcode = '22023',
      message = 'PORTFOLIO_CATEGORY_INVALID';
  end if;

  v_fingerprint := pg_catalog.md5(
    pg_catalog.concat_ws(
      '|',
      p_actor_user_id,
      pg_catalog.array_to_string(p_categories, ','),
      coalesce(pg_catalog.upper(pg_catalog.btrim(p_purchase_code)), '')
    )
  );

  insert into public.wallet_operation_idempotency_v2 (
    actor_user_id,
    operation_type,
    idempotency_key,
    request_fingerprint
  )
  values (
    p_actor_user_id,
    'portfolio_purchase',
    p_idempotency_key,
    v_fingerprint
  )
  on conflict (
    actor_user_id,
    operation_type,
    idempotency_key
  ) do nothing;

  if not found then
    select *
    into v_operation
    from public.wallet_operation_idempotency_v2
    where actor_user_id = p_actor_user_id
      and operation_type = 'portfolio_purchase'
      and idempotency_key = p_idempotency_key
    for update;

    if v_operation.request_fingerprint <> v_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;

    if v_operation.status = 'completed'
       and v_operation.result is not null then
      return v_operation.result ||
        pg_catalog.jsonb_build_object(
          'already_processed', true
        );
    end if;

    raise exception using
      errcode = '40001',
      message = 'IDEMPOTENCY_OPERATION_INCOMPLETE';
  end if;

  select *
  into v_profile
  from public.profiles
  where clerk_id = p_actor_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'PROFILE_NOT_FOUND';
  end if;

  v_price := pg_catalog.round(
    v_price * case v_profile.medal_tier
      when 'Gold' then 0.50
      when 'Silver' then 0.70
      when 'Bronze' then 0.85
      else 1
    end
  );

  if v_price is null or v_price <= 0 then
    raise exception using
      errcode = '22023',
      message = 'PORTFOLIO_PRICE_INVALID';
  end if;
  v_balance_before := coalesce(v_profile.balance, 0);

  if v_balance_before < v_price then
    raise exception using
      errcode = '22003',
      message = 'INSUFFICIENT_FUNDS';
  end if;

  v_balance_after := v_balance_before - v_price;
  v_reference := pg_catalog.concat(
    'wallet_portfolio_',
    pg_catalog.md5(
      pg_catalog.concat_ws(
        '|', p_actor_user_id, p_idempotency_key
      )
    )
  );
  v_slug := pg_catalog.concat(
    'portfolio-',
    pg_catalog.substr(pg_catalog.md5(v_reference), 1, 20)
  );

  update public.profiles
  set balance = v_balance_after,
      updated_at = pg_catalog.now()
  where clerk_id = p_actor_user_id;

  select *
  into v_portfolio
  from public.vp_portfolios
  where user_id = p_actor_user_id
    and status = 'draft'
  order by created_at desc
  limit 1
  for update;

  if found then
    update public.vp_portfolios
    set user_email = p_actor_email,
        full_name = coalesce(
          nullif(pg_catalog.btrim(p_actor_name), ''),
          full_name
        ),
        category = p_categories[1],
        categories = p_categories,
        status = 'active',
        is_paid = true,
        paystack_ref = v_reference,
        slug = coalesce(nullif(slug, ''), v_slug)
    where id = v_portfolio.id
    returning *
    into v_portfolio;
  else
    insert into public.vp_portfolios (
      user_id,
      user_email,
      full_name,
      category,
      categories,
      status,
      is_paid,
      paystack_ref,
      slug,
      color_theme,
      font_pairing
    )
    values (
      p_actor_user_id,
      p_actor_email,
      p_actor_name,
      p_categories[1],
      p_categories,
      'active',
      true,
      v_reference,
      v_slug,
      'classic',
      'refined_editorial'
    )
    returning *
    into v_portfolio;
  end if;

  insert into public.portfolio_purchases (
    user_id,
    user_email,
    user_name,
    category,
    amount,
    paystack_ref,
    purchase_code_used,
    purchase_code_owner_id,
    reward_amount,
    reward_status,
    idempotency_key,
    wallet_transaction_reference
  )
  values (
    p_actor_user_id,
    p_actor_email,
    p_actor_name,
    p_categories[1],
    v_price,
    v_reference,
    nullif(pg_catalog.upper(pg_catalog.btrim(p_purchase_code)), ''),
    null,
    0,
    'none',
    p_idempotency_key,
    v_reference
  )
  returning id::text
  into v_purchase_id;

  insert into public.wallet_transactions (
    user_id,
    user_email,
    type,
    amount,
    status,
    reference,
    metadata,
    balance_before,
    balance_after,
    idempotency_key,
    updated_at
  )
  values (
    p_actor_user_id,
    p_actor_email,
    'portfolio_purchase',
    v_price,
    'success',
    v_reference,
    pg_catalog.jsonb_build_object(
      'operation', 'portfolio_wallet_purchase',
      'portfolio_id', v_portfolio.id::text,
      'portfolio_purchase_id', v_purchase_id,
      'categories', to_jsonb(p_categories)
    ),
    v_balance_before,
    v_balance_after,
    p_idempotency_key,
    pg_catalog.now()
  );

  v_reward := public.apply_wallet_referral_reward_v2(
    'portfolio_purchase',
    v_reference,
    p_actor_user_id,
    p_purchase_code,
    v_price
  );

  if coalesce((v_reward->>'applied')::boolean, false) then
    update public.portfolio_purchases
    set reward_amount = (v_reward->>'amount')::numeric,
        reward_status = 'paid',
        purchase_code_owner_id =
          v_reward->>'recipient_user_id'
    where id::text = v_purchase_id;
  end if;

  perform public.insert_wallet_notification_v2(
    pg_catalog.concat('portfolio:', v_reference, ':user'),
    p_actor_user_id,
    'portfolio_purchased',
    'portfolio',
    'Your portfolio purchase is active.',
    pg_catalog.jsonb_build_object(
      'reference', v_reference,
      'portfolio_id', v_portfolio.id::text,
      'categories', to_jsonb(p_categories)
    )
  );

  insert into public.wallet_notification_outbox_v2 (
    dedupe_key,
    audience,
    event,
    payload
  )
  values (
    pg_catalog.concat('portfolio:', v_reference, ':admin'),
    'admin',
    'portfolio_purchase',
    pg_catalog.jsonb_build_object(
      'reference', v_reference,
      'portfolio_id', v_portfolio.id::text,
      'amount', v_price
    )
  )
  on conflict (dedupe_key) do nothing;

  v_result := pg_catalog.jsonb_build_object(
    'success', true,
    'already_processed', false,
    'reference', v_reference,
    'amount', v_price,
    'balance_after', v_balance_after,
    'entitlement', pg_catalog.jsonb_build_object(
      'id', v_portfolio.id,
      'slug', v_portfolio.slug,
      'status', v_portfolio.status,
      'categories', v_portfolio.categories
    )
  );

  update public.wallet_operation_idempotency_v2
  set status = 'completed',
      reference = v_reference,
      result = v_result,
      completed_at = pg_catalog.now()
  where actor_user_id = p_actor_user_id
    and operation_type = 'portfolio_purchase'
    and idempotency_key = p_idempotency_key;

  return v_result;
end
$function$;

revoke all on table
  public.wallet_operation_idempotency_v2,
  public.wallet_commerce_rewards_v2,
  public.wallet_notification_outbox_v2,
  public.portfolio_category_prices_v2
from public, anon, authenticated;

grant select, insert, update
on table
  public.wallet_operation_idempotency_v2,
  public.wallet_commerce_rewards_v2,
  public.wallet_notification_outbox_v2
to service_role;

grant select
on table public.portfolio_category_prices_v2
to service_role;

revoke all
on function public.insert_wallet_notification_v2(
  text, text, text, text, text, jsonb, text
)
from public, anon, authenticated;

revoke all
on function public.apply_wallet_referral_reward_v2(
  text, text, text, text, numeric
)
from public, anon, authenticated;

revoke all
on function public.purchase_wallet_product_v2(
  text, text, text, uuid, text, text
)
from public, anon, authenticated;

revoke all
on function public.purchase_portfolio_wallet_v2(
  text, text, text, text[], text, text
)
from public, anon, authenticated;

grant execute
on function public.purchase_wallet_product_v2(
  text, text, text, uuid, text, text
)
to service_role;

grant execute
on function public.purchase_portfolio_wallet_v2(
  text, text, text, text[], text, text
)
to service_role;

commit;
