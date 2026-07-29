-- Read-only production preflight for the wallet-commerce-v2 migrations.
-- This statement only reads catalog metadata and existing rows.  It does not
-- open a write transaction, run a migration, or call a financial function.

with
required_tables(table_name) as (
  values
    ('profiles'),
    ('wallet_transactions'),
    ('orders'),
    ('plans'),
    ('portfolio_purchases'),
    ('vp_portfolios'),
    ('withdrawals'),
    ('messages')
),
migration_tables(table_name) as (
  values
    ('wallet_operation_idempotency_v2'),
    ('wallet_commerce_rewards_v2'),
    ('wallet_notification_outbox_v2'),
    ('portfolio_category_prices_v2'),
    ('financial_manual_review_events_v2'),
    ('withdrawal_callback_events_v2')
),
required_columns(table_name, column_name, type_group) as (
  values
    ('profiles', 'id', 'identity'),
    ('profiles', 'clerk_id', 'text'),
    ('profiles', 'email', 'text'),
    ('profiles', 'full_name', 'text'),
    ('profiles', 'balance', 'numeric'),
    ('profiles', 'username', 'text'),
    ('profiles', 'purchase_code', 'text'),
    ('profiles', 'medal_tier', 'text'),
    ('profiles', 'medal_number', 'numeric'),
    ('profiles', 'total_referral_earnings', 'numeric'),
    ('profiles', 'referral_count', 'numeric'),
    ('profiles', 'updated_at', 'timestamp'),
    ('wallet_transactions', 'id', 'identity'),
    ('wallet_transactions', 'user_id', 'identity'),
    ('wallet_transactions', 'user_email', 'text'),
    ('wallet_transactions', 'type', 'text'),
    ('wallet_transactions', 'amount', 'numeric'),
    ('wallet_transactions', 'status', 'text'),
    ('wallet_transactions', 'reference', 'text'),
    ('wallet_transactions', 'metadata', 'json'),
    ('wallet_transactions', 'balance_before', 'numeric'),
    ('wallet_transactions', 'balance_after', 'numeric'),
    ('wallet_transactions', 'updated_at', 'timestamp'),
    ('orders', 'id', 'identity'),
    ('orders', 'user_id', 'identity'),
    ('orders', 'user_email', 'text'),
    ('orders', 'product_name', 'text'),
    ('orders', 'plan_duration', 'text'),
    ('orders', 'plan_months', 'numeric'),
    ('orders', 'plan_duration_days', 'numeric'),
    ('orders', 'amount', 'numeric'),
    ('orders', 'currency', 'text'),
    ('orders', 'order_reference', 'text'),
    ('orders', 'paystack_ref', 'text'),
    ('orders', 'status', 'text'),
    ('orders', 'delivery_status', 'text'),
    ('orders', 'purchase_code_used', 'text'),
    ('orders', 'purchase_code_owner_id', 'identity'),
    ('orders', 'reward_amount', 'numeric'),
    ('orders', 'reward_status', 'text'),
    ('orders', 'created_at', 'timestamp'),
    ('plans', 'id', 'identity'),
    ('plans', 'name', 'text'),
    ('plans', 'price', 'numeric'),
    ('plans', 'discount_price', 'numeric'),
    ('plans', 'discount_expires_at', 'timestamp'),
    ('plans', 'duration_months', 'numeric'),
    ('plans', 'category', 'text'),
    ('plans', 'is_active', 'boolean'),
    ('portfolio_purchases', 'id', 'identity'),
    ('portfolio_purchases', 'user_id', 'identity'),
    ('portfolio_purchases', 'user_email', 'text'),
    ('portfolio_purchases', 'user_name', 'text'),
    ('portfolio_purchases', 'category', 'text'),
    ('portfolio_purchases', 'amount', 'numeric'),
    ('portfolio_purchases', 'paystack_ref', 'text'),
    ('portfolio_purchases', 'purchase_code_used', 'text'),
    ('portfolio_purchases', 'purchase_code_owner_id', 'identity'),
    ('portfolio_purchases', 'reward_amount', 'numeric'),
    ('portfolio_purchases', 'reward_status', 'text'),
    ('portfolio_purchases', 'created_at', 'timestamp'),
    ('vp_portfolios', 'id', 'identity'),
    ('vp_portfolios', 'user_id', 'identity'),
    ('vp_portfolios', 'user_email', 'text'),
    ('vp_portfolios', 'full_name', 'text'),
    ('vp_portfolios', 'category', 'text'),
    ('vp_portfolios', 'categories', 'text_array'),
    ('vp_portfolios', 'status', 'text'),
    ('vp_portfolios', 'is_paid', 'boolean'),
    ('vp_portfolios', 'paystack_ref', 'text'),
    ('vp_portfolios', 'slug', 'text'),
    ('vp_portfolios', 'color_theme', 'text'),
    ('vp_portfolios', 'font_pairing', 'text'),
    ('vp_portfolios', 'created_at', 'timestamp'),
    ('withdrawals', 'id', 'identity'),
    ('withdrawals', 'user_id', 'identity'),
    ('withdrawals', 'user_email', 'text'),
    ('withdrawals', 'user_name', 'text'),
    ('withdrawals', 'amount', 'numeric'),
    ('withdrawals', 'bank_name', 'text'),
    ('withdrawals', 'account_number', 'text'),
    ('withdrawals', 'account_name', 'text'),
    ('withdrawals', 'status', 'text'),
    ('withdrawals', 'created_at', 'timestamp'),
    ('messages', 'sender_id', 'identity'),
    ('messages', 'sender_role', 'text'),
    ('messages', 'sender_name', 'text'),
    ('messages', 'content', 'text'),
    ('messages', 'user_id', 'identity'),
    ('messages', 'event', 'text'),
    ('messages', 'is_from_user', 'boolean'),
    ('messages', 'is_bot', 'boolean'),
    ('messages', 'is_bot_message', 'boolean'),
    ('messages', 'read_by_admin', 'boolean'),
    ('messages', 'read_by_user', 'boolean')
),
added_columns(table_name, column_name, type_group) as (
  values
    ('wallet_transactions', 'provider_transaction_id', 'text'),
    ('wallet_transactions', 'currency', 'text'),
    ('wallet_transactions', 'fee', 'numeric'),
    ('wallet_transactions', 'idempotency_key', 'text'),
    ('plans', 'wallet_product_type', 'text'),
    ('orders', 'idempotency_key', 'text'),
    ('orders', 'plan_id', 'uuid'),
    ('orders', 'product_type', 'text'),
    ('portfolio_purchases', 'idempotency_key', 'text'),
    ('portfolio_purchases', 'wallet_transaction_reference', 'text'),
    ('withdrawals', 'fee', 'numeric'),
    ('withdrawals', 'reference', 'text'),
    ('withdrawals', 'idempotency_key', 'text'),
    ('withdrawals', 'bank_code', 'text'),
    ('withdrawals', 'provider_transaction_id', 'text'),
    ('withdrawals', 'provider_status', 'text'),
    ('withdrawals', 'reserved_at', 'timestamp'),
    ('withdrawals', 'submitted_at', 'timestamp'),
    ('withdrawals', 'settled_at', 'timestamp'),
    ('withdrawals', 'refunded_at', 'timestamp'),
    ('withdrawals', 'updated_at', 'timestamp')
    ,('messages', 'topic', 'text')
),
proposed_functions(function_name, identity_args) as (
  values
    ('fulfill_wallet_funding_v2', 'text, text, text, text, numeric'),
    ('insert_wallet_notification_v2', 'text, text, text, text, text, jsonb, text'),
    ('apply_wallet_referral_reward_v2', 'text, text, text, text, numeric'),
    ('purchase_wallet_product_v2', 'text, text, text, uuid, text, text'),
    ('purchase_portfolio_wallet_v2', 'text, text, text, text[], text, text'),
    ('record_financial_manual_review_v2', 'text, text, text, text, jsonb'),
    ('transfer_wallet_p2p_v2', 'text, text, text, numeric, text, text'),
    ('reserve_wallet_withdrawal_v2', 'text, text, numeric, text'),
    ('mark_wallet_withdrawal_attempt_started_v2', 'text'),
    ('mark_wallet_withdrawal_submitted_v2', 'text, text, text'),
    ('mark_wallet_withdrawal_manual_review_v2', 'text, text'),
    ('record_wallet_withdrawal_callback_manual_review_v2', 'text, text, text, text, text, jsonb'),
    ('settle_wallet_withdrawal_success_v2', 'text, text, text, text, numeric, text'),
    ('refund_wallet_withdrawal_v2', 'text, text, text, text, numeric, text')
),
proposed_objects(object_name) as (
  values
    ('wallet_transactions_fund_provider_tx_unique_v2'),
    ('wallet_operation_idempotency_unique_v2'),
    ('wallet_commerce_rewards_source_unique_v2'),
    ('wallet_notification_outbox_dedupe_unique_v2'),
    ('profiles_username_lower_unique_v2'),
    ('profiles_purchase_code_lower_unique_v2'),
    ('orders_idempotency_unique_v2'),
    ('orders_wallet_reference_unique_v2'),
    ('orders_one_medal_per_user_v2'),
    ('portfolio_purchases_idempotency_unique_v2'),
    ('portfolio_purchases_reference_unique_v2'),
    ('vp_portfolios_purchase_reference_unique_v2'),
    ('financial_manual_review_event_unique_v2'),
    ('withdrawal_callback_event_unique_v2'),
    ('withdrawals_reference_unique_v2'),
    ('withdrawals_idempotency_unique_v2'),
    ('withdrawals_provider_transaction_unique_v2'),
    ('wallet_transactions_operation_idempotency_unique_v2')
),
checks(check_name, ok, blocking, details) as (
  select
    'table.required.' || t.table_name,
    to_regclass('public.' || t.table_name) is not null,
    true,
    case
      when to_regclass('public.' || t.table_name) is null
        then 'FAIL: required public table is missing'
      else 'public table exists'
    end
  from required_tables t

  union all

  select
    'table.migration-created.' || t.table_name,
    to_regclass('public.' || t.table_name) is not null
      or not exists (
        select 1
        from information_schema.tables i
        where i.table_schema = 'public'
          and i.table_name = t.table_name
      ),
    false,
    case
      when to_regclass('public.' || t.table_name) is null
        then 'not present yet; migration is expected to create it'
      else 'migration-created table already exists'
    end
  from migration_tables t

  union all

  select
    'column.required.' || r.table_name || '.' || r.column_name,
    c.column_name is not null
      and case r.type_group
        when 'text' then c.data_type in ('text', 'character varying', 'character')
        when 'identifier' then c.udt_name in (
          'uuid', 'int2', 'int4', 'int8', 'text', 'varchar'
        )
        when 'numeric' then c.data_type in (
          'numeric', 'smallint', 'integer', 'bigint',
          'real', 'double precision'
        )
        when 'identity' then c.udt_name in (
          'uuid', 'int2', 'int4', 'int8', 'text', 'varchar'
        )
        when 'boolean' then c.data_type = 'boolean'
        when 'timestamp' then c.data_type like 'timestamp%'
        when 'json' then c.udt_name in ('json', 'jsonb')
        when 'text_array' then c.udt_name = '_text'
        else false
      end,
    true,
    case
      when c.column_name is null then 'FAIL: column is missing'
      when r.type_group = 'text_array' and c.udt_name <> '_text'
        then 'FAIL: expected text[] compatible type, got ' || c.udt_name
      else 'column exists with compatible type ' || c.data_type || ' (' || c.udt_name || ')'
    end
  from required_columns r
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = r.table_name
   and c.column_name = r.column_name

  union all

  select
    'column.migration-added.' || a.table_name || '.' || a.column_name,
    c.column_name is null
      or case a.type_group
        when 'text' then c.data_type in ('text', 'character varying', 'character')
        when 'uuid' then c.udt_name = 'uuid'
        when 'numeric' then c.data_type in (
          'numeric', 'smallint', 'integer', 'bigint',
          'real', 'double precision'
        )
        when 'timestamp' then c.data_type like 'timestamp%'
        else false
      end,
    false,
    case
      when c.column_name is null then 'absent; migration may add it'
      else 'present with compatible type ' || c.data_type || ' (' || c.udt_name || ')'
    end
  from added_columns a
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = a.table_name
   and c.column_name = a.column_name

  union all

  select
    'data.duplicate.wallet_transaction_reference',
    not exists (
      select 1
      from public.wallet_transactions t
      where to_jsonb(t)->>'reference' is not null
      group by to_jsonb(t)->>'reference'
      having count(*) > 1
    ),
    true,
    case when exists (
      select 1
      from public.wallet_transactions t
      where to_jsonb(t)->>'reference' is not null
      group by to_jsonb(t)->>'reference'
      having count(*) > 1
    ) then 'FAIL: duplicate non-null wallet transaction references exist'
    else 'no duplicate non-null wallet transaction references' end

  union all

  select
    'data.duplicate.wallet_transaction_provider_transaction_id',
    not exists (
      select 1
      from public.wallet_transactions t
      where to_jsonb(t)->>'provider_transaction_id' is not null
      group by to_jsonb(t)->>'provider_transaction_id'
      having count(*) > 1
    ),
    true,
    case when exists (
      select 1
      from public.wallet_transactions t
      where to_jsonb(t)->>'provider_transaction_id' is not null
      group by to_jsonb(t)->>'provider_transaction_id'
      having count(*) > 1
    ) then 'FAIL: duplicate non-null provider transaction IDs exist'
    else 'no duplicate non-null provider transaction IDs' end

  union all

  select
    'data.duplicate.wallet_transaction_idempotency_key',
    not exists (
      select 1
      from public.wallet_transactions t
      where to_jsonb(t)->>'idempotency_key' is not null
      group by to_jsonb(t)->>'user_id', to_jsonb(t)->>'type', to_jsonb(t)->>'idempotency_key'
      having count(*) > 1
    ),
    true,
    case when exists (
      select 1
      from public.wallet_transactions t
      where to_jsonb(t)->>'idempotency_key' is not null
      group by to_jsonb(t)->>'user_id', to_jsonb(t)->>'type', to_jsonb(t)->>'idempotency_key'
      having count(*) > 1
    ) then 'FAIL: duplicate wallet transaction idempotency keys exist'
    else 'no duplicate wallet transaction idempotency keys' end

  union all

  select
    'data.duplicate.orders_idempotency_key',
    not exists (
      select 1
      from public.orders o
      where to_jsonb(o)->>'idempotency_key' is not null
      group by to_jsonb(o)->>'user_id', to_jsonb(o)->>'idempotency_key'
      having count(*) > 1
    ),
    true,
    case when exists (
      select 1 from public.orders o
      where to_jsonb(o)->>'idempotency_key' is not null
      group by to_jsonb(o)->>'user_id', to_jsonb(o)->>'idempotency_key'
      having count(*) > 1
    ) then 'FAIL: duplicate order idempotency keys exist'
    else 'no duplicate order idempotency keys' end

  union all

  select
    'data.duplicate.portfolio_purchases_idempotency_key',
    not exists (
      select 1
      from public.portfolio_purchases p
      where to_jsonb(p)->>'idempotency_key' is not null
      group by to_jsonb(p)->>'user_id', to_jsonb(p)->>'idempotency_key'
      having count(*) > 1
    ),
    true,
    case when exists (
      select 1 from public.portfolio_purchases p
      where to_jsonb(p)->>'idempotency_key' is not null
      group by to_jsonb(p)->>'user_id', to_jsonb(p)->>'idempotency_key'
      having count(*) > 1
    ) then 'FAIL: duplicate portfolio idempotency keys exist'
    else 'no duplicate portfolio idempotency keys' end

  union all

  select
    'data.duplicate.withdrawals_idempotency_key',
    not exists (
      select 1
      from public.withdrawals w
      where to_jsonb(w)->>'idempotency_key' is not null
      group by to_jsonb(w)->>'user_id', to_jsonb(w)->>'idempotency_key'
      having count(*) > 1
    ),
    true,
    case when exists (
      select 1 from public.withdrawals w
      where to_jsonb(w)->>'idempotency_key' is not null
      group by to_jsonb(w)->>'user_id', to_jsonb(w)->>'idempotency_key'
      having count(*) > 1
    ) then 'FAIL: duplicate withdrawal idempotency keys exist'
    else 'no duplicate withdrawal idempotency keys' end

  union all

  select
    'data.duplicate.profile_clerk_id',
    not exists (
      select 1
      from public.profiles p
      where to_jsonb(p)->>'clerk_id' is not null
      group by to_jsonb(p)->>'clerk_id'
      having count(*) > 1
    ),
    true,
    case when exists (
      select 1 from public.profiles p
      where to_jsonb(p)->>'clerk_id' is not null
      group by to_jsonb(p)->>'clerk_id'
      having count(*) > 1
    ) then 'FAIL: duplicate profiles.clerk_id values exist'
    else 'no duplicate profiles.clerk_id values' end

  union all

  select
    'data.duplicate.profile_username',
    not exists (
      select 1
      from public.profiles p
      where nullif(pg_catalog.btrim(to_jsonb(p)->>'username'), '') is not null
      group by pg_catalog.lower(pg_catalog.btrim(to_jsonb(p)->>'username'))
      having count(*) > 1
    ),
    true,
    case when exists (
      select 1 from public.profiles p
      where nullif(pg_catalog.btrim(to_jsonb(p)->>'username'), '') is not null
      group by pg_catalog.lower(pg_catalog.btrim(to_jsonb(p)->>'username'))
      having count(*) > 1
    ) then 'FAIL: duplicate non-null usernames exist'
    else 'no duplicate non-null usernames' end

  union all

  select
    'data.duplicate.profile_purchase_code',
    not exists (
      select 1 from public.profiles p
      where nullif(pg_catalog.btrim(to_jsonb(p)->>'purchase_code'), '') is not null
      group by pg_catalog.lower(pg_catalog.btrim(to_jsonb(p)->>'purchase_code'))
      having count(*) > 1
    ),
    true,
    case when exists (
      select 1 from public.profiles p
      where nullif(pg_catalog.btrim(to_jsonb(p)->>'purchase_code'), '') is not null
      group by pg_catalog.lower(pg_catalog.btrim(to_jsonb(p)->>'purchase_code'))
      having count(*) > 1
    ) then 'FAIL: duplicate non-empty normalized purchase codes exist'
    else 'no duplicate non-empty normalized purchase codes' end

  union all

  select
    'data.duplicate.orders_order_reference',
    not exists (
      select 1 from public.orders o
      where to_jsonb(o)->>'order_reference' is not null
      group by to_jsonb(o)->>'order_reference'
      having count(*) > 1
    ),
    true,
    case when exists (
      select 1 from public.orders o
      where to_jsonb(o)->>'order_reference' is not null
      group by to_jsonb(o)->>'order_reference'
      having count(*) > 1
    ) then 'FAIL: duplicate non-null order references exist'
    else 'no duplicate non-null order references' end

  union all

  select
    'data.duplicate.orders_paystack_reference',
    not exists (
      select 1 from public.orders o
      where to_jsonb(o)->>'paystack_ref' is not null
      group by to_jsonb(o)->>'paystack_ref'
      having count(*) > 1
    ),
    true,
    case when exists (
      select 1 from public.orders o
      where to_jsonb(o)->>'paystack_ref' is not null
      group by to_jsonb(o)->>'paystack_ref'
      having count(*) > 1
    ) then 'FAIL: duplicate non-null order payment references exist'
    else 'no duplicate non-null order payment references' end

  union all

  select
    'data.duplicate.portfolio_payment_reference',
    not exists (
      select 1 from public.portfolio_purchases p
      where to_jsonb(p)->>'paystack_ref' is not null
      group by to_jsonb(p)->>'paystack_ref'
      having count(*) > 1
    ),
    true,
    case when exists (
      select 1 from public.portfolio_purchases p
      where to_jsonb(p)->>'paystack_ref' is not null
      group by to_jsonb(p)->>'paystack_ref'
      having count(*) > 1
    ) then 'FAIL: duplicate non-null portfolio payment references exist'
    else 'no duplicate non-null portfolio payment references' end

  union all

  select
    'data.duplicate.withdrawal_reference',
    not exists (
      select 1 from public.withdrawals w
      where to_jsonb(w)->>'reference' is not null
      group by to_jsonb(w)->>'reference'
      having count(*) > 1
    ),
    true,
    case when exists (
      select 1 from public.withdrawals w
      where to_jsonb(w)->>'reference' is not null
      group by to_jsonb(w)->>'reference'
      having count(*) > 1
    ) then 'FAIL: duplicate non-null withdrawal references exist'
    else 'no duplicate non-null withdrawal references' end

  union all

  select
    'data.medal_one_per_user',
    not exists (
      select 1 from public.orders o
      where to_jsonb(o)->>'product_type' = 'medal'
        and to_jsonb(o)->>'status' in ('paid', 'completed')
      group by to_jsonb(o)->>'user_id'
      having count(*) > 1
    ),
    true,
    case when exists (
      select 1 from public.orders o
      where to_jsonb(o)->>'product_type' = 'medal'
        and to_jsonb(o)->>'status' in ('paid', 'completed')
      group by to_jsonb(o)->>'user_id'
      having count(*) > 1
    ) then 'FAIL: at least one user has multiple paid medal orders'
    else 'no user has multiple paid medal orders' end

  union all

  select
    'data.medal_supply',
    medal_count <= 160,
    true,
    'paid medal orders=' || medal_count || '; configured supply limit=160'
  from (
    select count(*)::bigint as medal_count
    from public.orders o
    where to_jsonb(o)->>'product_type' = 'medal'
      and to_jsonb(o)->>'status' in ('paid', 'completed')
  ) counts

  union all

  select
    'column.vp_portfolios_categories_shape',
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'vp_portfolios'
        and c.column_name = 'categories'
        and c.udt_name = '_text'
    ),
    true,
    coalesce((
      select 'categories type=' || c.data_type || ' (' || c.udt_name || ')'
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'vp_portfolios'
        and c.column_name = 'categories'
    ), 'FAIL: vp_portfolios.categories must be text[]')

  union all

  select
    'role.' || r.role_name,
    exists (select 1 from pg_catalog.pg_roles p where p.rolname = r.role_name),
    true,
    case when exists (
      select 1 from pg_catalog.pg_roles p where p.rolname = r.role_name
    ) then 'role exists' else 'FAIL: required role is missing' end
  from (values ('anon'), ('authenticated'), ('service_role')) r(role_name)

  union all

  select
    'function.proposed.' || f.function_name,
    not exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = f.function_name
    ) or exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = f.function_name
        and pg_catalog.pg_get_function_identity_arguments(p.oid) = f.identity_args
    ),
    false,
    case when not exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = f.function_name
    ) then 'absent; migration is expected to create it'
    when exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = f.function_name
        and pg_catalog.pg_get_function_identity_arguments(p.oid) = f.identity_args
    ) then 'existing function has compatible identity arguments (' || f.identity_args || ')'
    else 'FAIL: same-name function exists with incompatible identity arguments' end
  from proposed_functions f

  union all

  select
    'compatibility.messages.topic',
    true,
    false,
    case when exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'messages'
        and c.column_name = 'topic'
        and c.data_type in ('text', 'character varying', 'character')
    ) then 'messages.topic already exists with compatible type'
    else 'WARN: messages.topic is absent and compatibility migration will add it' end

  union all

  select
    'plans.verified_wallet_product_types',
    (select count(*) from public.plans where
      (id = '34849e6d-b139-4048-a72a-9f3f9c83778c'::uuid and name = 'CAPCUT PRO' and category is null)
      or (id = 'bfdd1523-bbe7-4a50-959d-dcf667ac3866'::uuid and category = 'medal_8k')
      or (id = '47d36bdb-9988-40f7-98d4-af9e75538ad4'::uuid and category = 'medal_15k')
      or (id = 'd9b4055f-8792-4c1c-8cfd-a403ae5f3882'::uuid and category = 'medal_20k')
    ) = 4,
    true,
    'requires exact CAPCUT PRO and Bronze/Silver/Gold plan IDs, names, and categories'

  union all

  select
    'trigger.legacy-financial-reward',
    true,
    false,
    case when count(*) = 0
      then 'confirmed legacy financial reward triggers are absent'
      else 'WARN: compatibility migration will remove ' || count(*) ||
        ' confirmed legacy financial reward trigger(s)' end
  from information_schema.triggers
  where trigger_schema = 'public'
    and (
      (event_object_table = 'orders' and trigger_name in (
        'on_order_paid_referral', 'tr_purchase_code_reward'
      ))
      or (event_object_table = 'purchase_code_rewards'
        and trigger_name = 'tr_sync_balance')
    )

  union all

  select
    'data.duplicate.reward_order_relationship',
    true,
    false,
    case when duplicate_groups = 0
      then 'no duplicate legacy reward/order relationships'
      else 'WARN: duplicate legacy reward/order groups=' || duplicate_groups ||
        '; no legacy uniqueness constraint will be created' end
  from (
    select
      (select count(*) from (
        select to_jsonb(o)->>'purchase_code_used', to_jsonb(o)->>'purchase_code_owner_id'
        from public.orders o
        where to_jsonb(o)->>'purchase_code_used' is not null
          and to_jsonb(o)->>'purchase_code_owner_id' is not null
        group by to_jsonb(o)->>'purchase_code_used', to_jsonb(o)->>'purchase_code_owner_id'
        having count(*) > 1
      ) order_duplicates) +
      (select count(*) from (
        select to_jsonb(p)->>'purchase_code_used', to_jsonb(p)->>'purchase_code_owner_id'
        from public.portfolio_purchases p
        where to_jsonb(p)->>'purchase_code_used' is not null
          and to_jsonb(p)->>'purchase_code_owner_id' is not null
        group by to_jsonb(p)->>'purchase_code_used', to_jsonb(p)->>'purchase_code_owner_id'
        having count(*) > 1
      ) portfolio_duplicates) as duplicate_groups
  ) duplicates

  union all

  select
    'data.invalid.historical_order_amounts',
    true,
    false,
    'WARN: historical orders with null, non-numeric or non-positive amounts=' || count(*) ||
      '; V2 validates positive authoritative prices without a global legacy constraint'
  from public.orders o
  where case when (to_jsonb(o)->>'amount') ~ '^-?[0-9]+(\\.[0-9]+)?$'
             then (to_jsonb(o)->>'amount')::numeric <= 0 else true end

  union all

  select
    'object.proposed.' || o.object_name,
    true,
    false,
    case when exists (
      select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = o.object_name
    ) or exists (
      select 1 from pg_catalog.pg_constraint c
      join pg_catalog.pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'public' and c.conname = o.object_name
    ) then 'existing index or constraint name found; verify definition before rollout'
    else 'absent; migration is expected to create it' end
  from proposed_objects o

  union all

  select
    'trigger.inventory',
    true,
    false,
    coalesce(
      pg_catalog.string_agg(
        event_object_table || '.' || trigger_name, ', ' order by event_object_table, trigger_name
      ),
      'no triggers found on wallet-commerce tables'
    )
  from information_schema.triggers
  where trigger_schema = 'public'
    and event_object_table in (
      'profiles', 'wallet_transactions', 'orders', 'portfolio_purchases',
      'vp_portfolios', 'withdrawals', 'messages', 'purchase_code_rewards'
    )

  union all

  select
    'data.invalid.existing_values',
    true,
    false,
    'WARN: profiles negative balance=' || profile_bad
      || '; wallet transaction invalid amounts=' || tx_bad
      || '; orders invalid amounts=' || order_bad
      || '; plans invalid prices=' || plan_bad
      || '; withdrawals invalid amounts=' || withdrawal_bad
      || '; historical rows are not rewritten'
  from (
    select
      (select count(*) from public.profiles p
       where case when (to_jsonb(p)->>'balance') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                  then (to_jsonb(p)->>'balance')::numeric < 0 else false end) profile_bad,
      (select count(*) from public.wallet_transactions t
       where case when (to_jsonb(t)->>'amount') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                  then (to_jsonb(t)->>'amount')::numeric <= 0 else true end) tx_bad,
      (select count(*) from public.orders o
       where case when (to_jsonb(o)->>'amount') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                  then (to_jsonb(o)->>'amount')::numeric <= 0 else true end) order_bad,
      (select count(*) from public.plans p
       where case when (to_jsonb(p)->>'price') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                  then (to_jsonb(p)->>'price')::numeric <= 0 else true end) plan_bad,
      (select count(*) from public.withdrawals w
       where case when (to_jsonb(w)->>'amount') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                  then (to_jsonb(w)->>'amount')::numeric <= 0 else true end) withdrawal_bad
  ) values_check
  cross join lateral (
    select profile_bad + tx_bad + order_bad + plan_bad + withdrawal_bad as invalid_count
  ) total

  union all

  select
    'server.postgresql_version',
    true,
    false,
    current_setting('server_version')
)
select check_name, status, details
from (
  select
    check_name,
    case when ok then 'PASS' else 'FAIL' end as status,
    details,
    blocking
  from checks

  union all

  select
    'FINAL_SUMMARY',
    case when bool_and(ok) filter (where blocking) then 'PASS' else 'FAIL' end,
    case when bool_and(ok) filter (where blocking)
      then 'READY: every blocking preflight check passed'
      else 'BLOCKED: one or more blocking preflight checks failed' end,
    true
  from checks
) result
order by
  case when check_name = 'FINAL_SUMMARY' then 2 else 1 end,
  check_name;
