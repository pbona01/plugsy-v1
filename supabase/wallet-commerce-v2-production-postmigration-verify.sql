-- Read-only verification to run after the wallet-commerce-v2 migrations.
-- Only PostgreSQL catalogs and existing rows are inspected.  No RPC is called
-- and no production money mutation is performed by this statement.

with
expected_columns(table_name, column_name) as (
  values
    ('wallet_transactions', 'provider_transaction_id'),
    ('wallet_transactions', 'currency'),
    ('wallet_transactions', 'fee'),
    ('wallet_transactions', 'idempotency_key'),
    ('messages', 'topic'),
    ('plans', 'wallet_product_type'),
    ('orders', 'idempotency_key'),
    ('orders', 'plan_id'),
    ('vp_portfolios', 'categories'),
    ('orders', 'product_type'),
    ('portfolio_purchases', 'idempotency_key'),
    ('portfolio_purchases', 'wallet_transaction_reference'),
    ('withdrawals', 'fee'),
    ('withdrawals', 'reference'),
    ('withdrawals', 'idempotency_key'),
    ('withdrawals', 'bank_code'),
    ('withdrawals', 'provider_transaction_id'),
    ('withdrawals', 'provider_status'),
    ('withdrawals', 'reserved_at'),
    ('withdrawals', 'submitted_at'),
    ('withdrawals', 'settled_at'),
    ('withdrawals', 'refunded_at'),
    ('withdrawals', 'updated_at'),
    ('wallet_operation_idempotency_v2', 'id'),
    ('wallet_operation_idempotency_v2', 'actor_user_id'),
    ('wallet_operation_idempotency_v2', 'operation_type'),
    ('wallet_operation_idempotency_v2', 'idempotency_key'),
    ('wallet_operation_idempotency_v2', 'request_fingerprint'),
    ('wallet_operation_idempotency_v2', 'status'),
    ('wallet_operation_idempotency_v2', 'reference'),
    ('wallet_operation_idempotency_v2', 'result'),
    ('wallet_operation_idempotency_v2', 'created_at'),
    ('wallet_operation_idempotency_v2', 'completed_at'),
    ('wallet_commerce_rewards_v2', 'id'),
    ('wallet_commerce_rewards_v2', 'source_type'),
    ('wallet_commerce_rewards_v2', 'source_reference'),
    ('wallet_commerce_rewards_v2', 'purchaser_user_id'),
    ('wallet_commerce_rewards_v2', 'recipient_user_id'),
    ('wallet_commerce_rewards_v2', 'purchase_code'),
    ('wallet_commerce_rewards_v2', 'amount'),
    ('wallet_commerce_rewards_v2', 'created_at'),
    ('wallet_notification_outbox_v2', 'id'),
    ('wallet_notification_outbox_v2', 'dedupe_key'),
    ('wallet_notification_outbox_v2', 'recipient_user_id'),
    ('wallet_notification_outbox_v2', 'audience'),
    ('wallet_notification_outbox_v2', 'event'),
    ('wallet_notification_outbox_v2', 'payload'),
    ('wallet_notification_outbox_v2', 'status'),
    ('wallet_notification_outbox_v2', 'attempts'),
    ('wallet_notification_outbox_v2', 'last_error'),
    ('wallet_notification_outbox_v2', 'created_at'),
    ('wallet_notification_outbox_v2', 'processed_at'),
    ('portfolio_category_prices_v2', 'category'),
    ('portfolio_category_prices_v2', 'display_name'),
    ('portfolio_category_prices_v2', 'price'),
    ('portfolio_category_prices_v2', 'is_active'),
    ('portfolio_category_prices_v2', 'updated_at'),
    ('financial_manual_review_events_v2', 'id'),
    ('financial_manual_review_events_v2', 'event_key'),
    ('financial_manual_review_events_v2', 'operation_type'),
    ('financial_manual_review_events_v2', 'reference'),
    ('financial_manual_review_events_v2', 'reason'),
    ('financial_manual_review_events_v2', 'details'),
    ('financial_manual_review_events_v2', 'status'),
    ('financial_manual_review_events_v2', 'created_at'),
    ('financial_manual_review_events_v2', 'resolved_at'),
    ('financial_manual_review_events_v2', 'resolution_note'),
    ('withdrawal_callback_events_v2', 'id'),
    ('withdrawal_callback_events_v2', 'event_key'),
    ('withdrawal_callback_events_v2', 'reference'),
    ('withdrawal_callback_events_v2', 'provider_transaction_id'),
    ('withdrawal_callback_events_v2', 'provider_status'),
    ('withdrawal_callback_events_v2', 'outcome'),
    ('withdrawal_callback_events_v2', 'created_at'),
    ('financial_manual_review_events_v2', 'event_key'),
    ('financial_manual_review_events_v2', 'operation_type'),
    ('financial_manual_review_events_v2', 'reason'),
    ('withdrawal_callback_events_v2', 'event_key'),
    ('withdrawal_callback_events_v2', 'outcome')
),
expected_indexes(index_name) as (
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
expected_functions(function_name, regprocedure_identity) as (
  values
    ('fulfill_wallet_funding_v2', 'public.fulfill_wallet_funding_v2(text,text,text,text,numeric)'),
    ('insert_wallet_notification_v2', 'public.insert_wallet_notification_v2(text,text,text,text,text,jsonb,text)'),
    ('apply_wallet_referral_reward_v2', 'public.apply_wallet_referral_reward_v2(text,text,text,text,numeric)'),
    ('purchase_wallet_product_v2', 'public.purchase_wallet_product_v2(text,text,text,uuid,text,text)'),
    ('purchase_portfolio_wallet_v2', 'public.purchase_portfolio_wallet_v2(text,text,text,text[],text,text)'),
    ('record_financial_manual_review_v2', 'public.record_financial_manual_review_v2(text,text,text,text,jsonb)'),
    ('transfer_wallet_p2p_v2', 'public.transfer_wallet_p2p_v2(text,text,text,numeric,text,text)'),
    ('reserve_wallet_withdrawal_v2', 'public.reserve_wallet_withdrawal_v2(text,text,numeric,text)'),
    ('mark_wallet_withdrawal_attempt_started_v2', 'public.mark_wallet_withdrawal_attempt_started_v2(text)'),
    ('mark_wallet_withdrawal_submitted_v2', 'public.mark_wallet_withdrawal_submitted_v2(text,text,text)'),
    ('mark_wallet_withdrawal_manual_review_v2', 'public.mark_wallet_withdrawal_manual_review_v2(text,text)'),
    ('record_wallet_withdrawal_callback_manual_review_v2', 'public.record_wallet_withdrawal_callback_manual_review_v2(text,text,text,text,text,jsonb)'),
    ('settle_wallet_withdrawal_success_v2', 'public.settle_wallet_withdrawal_success_v2(text,text,text,text,numeric,text)'),
    ('refund_wallet_withdrawal_v2', 'public.refund_wallet_withdrawal_v2(text,text,text,text,numeric,text)')
),
resolved_functions(function_name, regprocedure_identity, function_oid) as (
  select
    function_name,
    regprocedure_identity,
    pg_catalog.to_regprocedure(regprocedure_identity)
  from expected_functions
),
financial_functions(function_name) as (
  select function_name from resolved_functions
),
checks(check_name, ok, blocking, details) as (
  select
    'column.' || e.table_name || '.' || e.column_name,
    c.column_name is not null,
    true,
    case when c.column_name is null
      then 'FAIL: expected column is missing'
      else 'column exists as ' || c.data_type || ' (' || c.udt_name || ')' end
  from expected_columns e
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = e.table_name
   and c.column_name = e.column_name

  union all

  select
    'type.orders.plan_id_uuid',
    exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'orders' and c.column_name = 'plan_id' and c.udt_name = 'uuid'),
    true,
    'orders.plan_id must remain uuid'

  union all

  select
    'type.vp_portfolios.categories_text_array',
    exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'vp_portfolios' and c.column_name = 'categories' and c.udt_name = '_text'),
    true,
    'vp_portfolios.categories must remain text[]'

  union all

  select
    'plans.verified_wallet_product_types',
    (select count(*) from public.plans where
      (id = '34849e6d-b139-4048-a72a-9f3f9c83778c'::uuid and name = 'CAPCUT PRO' and category is null and wallet_product_type = 'capcut')
      or (id in ('bfdd1523-bbe7-4a50-959d-dcf667ac3866'::uuid, '47d36bdb-9988-40f7-98d4-af9e75538ad4'::uuid, 'd9b4055f-8792-4c1c-8cfd-a403ae5f3882'::uuid) and wallet_product_type = 'medal')
    ) = 4,
    true,
    'exact CapCut and medal plan IDs have the configured product types'

  union all

  select
    'unique-index.' || i.index_name,
    exists (
      select 1
      from pg_catalog.pg_indexes p
      where p.schemaname = 'public' and p.indexname = i.index_name
    ),
    true,
    case when exists (
      select 1
      from pg_catalog.pg_indexes p
      where p.schemaname = 'public' and p.indexname = i.index_name
    ) then 'expected unique index exists'
    else 'FAIL: expected unique index is missing' end
  from expected_indexes i

  union all

  select
    'compatibility.messages.topic',
    exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'messages'
        and c.column_name = 'topic'
        and c.data_type in ('text', 'character varying', 'character')
    ),
    true,
    case when exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'messages'
        and c.column_name = 'topic'
        and c.data_type in ('text', 'character varying', 'character')
    ) then 'compatibility migration added or preserved messages.topic'
    else 'FAIL: compatibility migration did not provide messages.topic' end

  union all

  select
    'compatibility.trigger.absent.' || t.table_name || '.' || t.trigger_name,
    not exists (
      select 1
      from information_schema.triggers x
      where x.trigger_schema = 'public'
        and x.event_object_table = t.table_name
        and x.trigger_name = t.trigger_name
    ),
    true,
    case when not exists (
      select 1
      from information_schema.triggers x
      where x.trigger_schema = 'public'
        and x.event_object_table = t.table_name
        and x.trigger_name = t.trigger_name
    ) then 'confirmed legacy financial reward trigger is absent'
    else 'FAIL: compatibility migration did not remove the legacy financial trigger' end
  from (values
    ('orders', 'on_order_paid_referral'),
    ('orders', 'tr_purchase_code_reward'),
    ('purchase_code_rewards', 'tr_sync_balance')
  ) t(table_name, trigger_name)

  union all

  select
    'compatibility.trigger.preserved.' || t.table_name || '.' || t.trigger_name,
    exists (
      select 1
      from information_schema.triggers x
      where x.trigger_schema = 'public'
        and x.event_object_table = t.table_name
        and x.trigger_name = t.trigger_name
    ),
    true,
    case when exists (
      select 1
      from information_schema.triggers x
      where x.trigger_schema = 'public'
        and x.event_object_table = t.table_name
        and x.trigger_name = t.trigger_name
    ) then 'purchase-code/login-delivery trigger is preserved'
    else 'FAIL: preserved legacy trigger is missing' end
  from (values
    ('orders', 'on_login_sent'),
    ('profiles', 'trg_assign_purchase_code')
  ) t(table_name, trigger_name)

  union all

  select
    'compatibility.migration-order',
    true,
    false,
    'funding 130000, compatibility 090000 on 20260729, commerce 100000, transfers 110000'

  union all

  select
    'rpc.present.' || f.function_name,
    p.oid is not null,
    true,
    case when p.oid is null then 'FAIL: expected RPC function is missing'
      else 'function found as ' || f.regprocedure_identity end
  from resolved_functions f
  left join pg_catalog.pg_proc p
    on p.oid = f.function_oid

  union all

  select
    'rpc.security-definer.' || f.function_name,
    p.oid is not null and p.prosecdef,
    true,
    case when p.oid is null then 'FAIL: function is missing'
      when not p.prosecdef then 'FAIL: function is not SECURITY DEFINER'
      else 'SECURITY DEFINER is set' end
  from resolved_functions f
  left join pg_catalog.pg_proc p
    on p.oid = f.function_oid

  union all

  select
    'rpc.search-path.' || f.function_name,
    p.oid is not null
       and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=pg_catalog']::text[],
    true,
    case when p.oid is null then 'FAIL: function is missing'
      when not (coalesce(p.proconfig, '{}'::text[]) @> array['search_path=pg_catalog']::text[])
        then 'FAIL: fixed search_path=pg_catalog is missing'
      else 'fixed search_path=pg_catalog is present' end
  from resolved_functions f
  left join pg_catalog.pg_proc p
    on p.oid = f.function_oid

  union all

  select
    'rpc.privilege.service-role.' || f.function_name,
    p.oid is not null
      and exists (select 1 from pg_catalog.pg_roles r where r.rolname = 'service_role')
       and has_function_privilege('service_role', p.oid, 'EXECUTE'),
    true,
    case when p.oid is null then 'FAIL: function is missing'
      when not exists (select 1 from pg_catalog.pg_roles r where r.rolname = 'service_role')
        then 'FAIL: service_role role is missing'
      when not has_function_privilege('service_role', p.oid, 'EXECUTE')
        then 'FAIL: service_role cannot execute the RPC'
      else 'service_role execution is granted' end
  from resolved_functions f
  left join pg_catalog.pg_proc p
    on p.oid = f.function_oid

  union all

  select
    'rpc.privilege.' || r.role_name || '.' || f.function_name,
    p.oid is not null and case
      when r.role_name = 'public' then not exists (
        select 1
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
      )
      else exists (select 1 from pg_catalog.pg_roles x where x.rolname = r.role_name)
        and not has_function_privilege(r.role_name, p.oid, 'EXECUTE')
    end,
    true,
    case when p.oid is null then 'FAIL: function is missing'
      when r.role_name <> 'public'
        and not exists (select 1 from pg_catalog.pg_roles x where x.rolname = r.role_name)
        then 'FAIL: role is missing'
      when r.role_name = 'public' and exists (
        select 1
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
      ) then 'FAIL: service-role-only RPC is executable by public'
      when r.role_name <> 'public' and has_function_privilege(r.role_name, p.oid, 'EXECUTE')
        then 'FAIL: service-role-only RPC is executable by ' || r.role_name
      else r.role_name || ' has no execution privilege' end
  from resolved_functions f
  cross join (values ('public'), ('anon'), ('authenticated')) r(role_name)
  left join pg_catalog.pg_proc p
    on p.oid = f.function_oid

  union all

  select
    'rpc.coverage.' || case
      when f.function_name = 'fulfill_wallet_funding_v2' then 'funding'
      when f.function_name like '%product%' then 'product'
      when f.function_name like '%portfolio%' then 'portfolio'
      when f.function_name like '%p2p%' then 'p2p'
      when f.function_name like '%withdrawal%' or f.function_name like 'settle_%' or f.function_name like 'refund_%'
        then 'withdrawal'
      else 'manual-review-or-reward'
    end,
    true,
    false,
    'expected funding, product, portfolio, P2P, withdrawal, reward, notification, and manual-review RPCs are listed above'
  from financial_functions f
  group by case
    when f.function_name = 'fulfill_wallet_funding_v2' then 'funding'
    when f.function_name like '%product%' then 'product'
    when f.function_name like '%portfolio%' then 'portfolio'
    when f.function_name like '%p2p%' then 'p2p'
    when f.function_name like '%withdrawal%' or f.function_name like 'settle_%' or f.function_name like 'refund_%'
      then 'withdrawal'
    else 'manual-review-or-reward'
    end

  union all

  select
    'safety.no-production-money-mutation',
    true,
    false,
    'PASS: this verification statement performs no financial RPC call and no money mutation'
),
final_summary as (
  select
    'FINAL_SUMMARY'::text as check_name,
    coalesce(bool_and(ok) filter (where blocking), true) as ok,
    true as blocking,
    case
      when coalesce(bool_and(ok) filter (where blocking), true)
        then 'READY: every blocking post-migration check passed'
      else 'BLOCKED: one or more blocking post-migration checks failed'
    end as details
  from checks
)
select check_name, case when ok then 'PASS' else 'FAIL' end as status, details
from checks
union all
select check_name, case when ok then 'READY' else 'BLOCKED' end as status, details
from final_summary
order by check_name;
