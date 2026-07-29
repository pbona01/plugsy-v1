begin;

do $preflight$
declare
  v_missing text;
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.wallet_transactions') is null
     or to_regclass('public.messages') is null then
    raise exception
      'wallet funding v2 preflight failed: required tables are missing';
  end if;

  select pg_catalog.string_agg(required.column_name, ', ')
  into v_missing
  from (
    values
      ('profiles', 'clerk_id'),
      ('profiles', 'balance'),
      ('profiles', 'updated_at'),
      ('wallet_transactions', 'id'),
      ('wallet_transactions', 'user_id'),
      ('wallet_transactions', 'type'),
      ('wallet_transactions', 'amount'),
      ('wallet_transactions', 'status'),
      ('wallet_transactions', 'reference'),
      ('wallet_transactions', 'metadata'),
      ('wallet_transactions', 'balance_before'),
      ('wallet_transactions', 'balance_after'),
      ('wallet_transactions', 'updated_at'),
      ('messages', 'sender_id'),
      ('messages', 'sender_role'),
      ('messages', 'sender_name'),
      ('messages', 'content'),
      ('messages', 'user_id'),
      ('messages', 'event'),
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
      'wallet funding v2 preflight failed: missing columns: %',
      v_missing;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'balance'
      and data_type = 'numeric'
  ) then
    raise exception
      'wallet funding v2 preflight failed: profiles.balance must be numeric';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wallet_transactions'
      and column_name = 'amount'
      and data_type = 'numeric'
  ) then
    raise exception
      'wallet funding v2 preflight failed: wallet_transactions.amount must be numeric';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wallet_transactions'
      and column_name = 'metadata'
      and udt_name = 'jsonb'
  ) then
    raise exception
      'wallet funding v2 preflight failed: wallet_transactions.metadata must be jsonb';
  end if;

  if exists (
    select clerk_id
    from public.profiles
    where clerk_id is not null
    group by clerk_id
    having count(*) > 1
  ) then
    raise exception
      'wallet funding v2 preflight failed: duplicate profiles.clerk_id values';
  end if;

  if exists (
    select reference
    from public.wallet_transactions
    where reference is not null
      and type = 'fund'
    group by reference
    having count(*) > 1
  ) then
    raise exception
      'wallet funding v2 preflight failed: duplicate funding references';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'service_role'
  ) then
    raise exception
      'wallet funding v2 preflight failed: service_role is missing';
  end if;
end
$preflight$;

alter table public.wallet_transactions
  add column if not exists provider_transaction_id text,
  add column if not exists currency text not null default 'NGN';

create unique index if not exists
  wallet_transactions_fund_provider_tx_unique_v2
on public.wallet_transactions (provider_transaction_id)
where type = 'fund'
  and provider_transaction_id is not null;

create or replace function public.fulfill_wallet_funding_v2(
  p_reference text,
  p_provider_transaction_id text,
  p_provider_status text,
  p_currency text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_tx public.wallet_transactions%rowtype;
  v_profile public.profiles%rowtype;
  v_balance_before numeric;
  v_balance_after numeric;
  v_updated_rows integer;
begin
  if coalesce(
    pg_catalog.btrim(p_reference),
    ''
  ) = '' then
    raise exception using
      errcode = '22023',
      message = 'FUNDING_REFERENCE_REQUIRED';
  end if;

  if coalesce(
    pg_catalog.btrim(p_provider_transaction_id),
    ''
  ) = '' then
    raise exception using
      errcode = '22023',
      message = 'PROVIDER_TRANSACTION_REQUIRED';
  end if;

  if pg_catalog.lower(
    coalesce(p_provider_status, '')
  ) <> 'successful' then
    raise exception using
      errcode = '22023',
      message = 'PROVIDER_STATUS_INVALID';
  end if;

  if pg_catalog.upper(
    coalesce(p_currency, '')
  ) <> 'NGN' then
    raise exception using
      errcode = '22023',
      message = 'PROVIDER_CURRENCY_INVALID';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception using
      errcode = '22023',
      message = 'PROVIDER_AMOUNT_INVALID';
  end if;

  select *
  into v_tx
  from public.wallet_transactions
  where reference = p_reference
    and type = 'fund'
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'FUNDING_TRANSACTION_NOT_FOUND';
  end if;

  if v_tx.amount <> p_amount then
    raise exception using
      errcode = '22023',
      message = 'FUNDING_AMOUNT_MISMATCH';
  end if;

  if v_tx.status = 'success' then
    if v_tx.provider_transaction_id is distinct from
       p_provider_transaction_id then
      raise exception using
        errcode = '23505',
        message = 'FUNDING_PROVIDER_ID_MISMATCH';
    end if;

    return pg_catalog.jsonb_build_object(
      'success', true,
      'already_processed', true,
      'reference', v_tx.reference,
      'user_id', v_tx.user_id,
      'amount', v_tx.amount,
      'balance_after', v_tx.balance_after
    );
  end if;

  if v_tx.status <> 'pending' then
    raise exception using
      errcode = '55000',
      message = 'FUNDING_TRANSACTION_NOT_PENDING';
  end if;

  select *
  into v_profile
  from public.profiles
  where clerk_id = v_tx.user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'FUNDING_PROFILE_NOT_FOUND';
  end if;

  v_balance_before :=
    coalesce(v_profile.balance, 0);
  v_balance_after :=
    v_balance_before + v_tx.amount;

  update public.profiles
  set balance = v_balance_after,
      updated_at = pg_catalog.now()
  where clerk_id = v_tx.user_id;

  get diagnostics v_updated_rows = row_count;

  if v_updated_rows <> 1 then
    raise exception using
      errcode = '21000',
      message = 'FUNDING_PROFILE_UPDATE_COUNT_INVALID';
  end if;

  update public.wallet_transactions
  set status = 'success',
      balance_before = v_balance_before,
      balance_after = v_balance_after,
      provider_transaction_id =
        p_provider_transaction_id,
      currency = 'NGN',
      metadata =
        coalesce(
          metadata,
          '{}'::jsonb
        ) ||
        pg_catalog.jsonb_build_object(
          'provider', 'flutterwave',
          'provider_status', 'successful',
          'provider_transaction_id',
            p_provider_transaction_id,
          'verified_at',
            pg_catalog.now()
        ),
      updated_at = pg_catalog.now()
  where id = v_tx.id
    and status = 'pending'
  returning *
  into v_tx;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'FUNDING_TRANSACTION_CONCURRENTLY_CHANGED';
  end if;

  begin
    insert into public.messages (
      sender_id,
      sender_role,
      sender_name,
      content,
      user_id,
      event,
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
      pg_catalog.concat(
        'Wallet funded with NGN ',
        v_tx.amount::text,
        '. New balance: NGN ',
        v_balance_after::text
      ),
      v_tx.user_id,
      'wallet_funded',
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
        pg_catalog.concat('funding:', v_tx.reference, ':user'),
        v_tx.user_id,
        'user',
        'wallet_funded',
        pg_catalog.jsonb_build_object(
          'reference', v_tx.reference,
          'amount', v_tx.amount,
          'balance_after', v_balance_after
        ),
        sqlerrm
      )
      on conflict (dedupe_key) do nothing;
      raise warning
        'wallet funding credited but notification failed for reference %: %',
        v_tx.reference,
        sqlerrm;
  end;
  return pg_catalog.jsonb_build_object(
    'success', true,
    'already_processed', false,
    'reference', v_tx.reference,
    'user_id', v_tx.user_id,
    'amount', v_tx.amount,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after
  );
end
$function$;

revoke all
on function public.fulfill_wallet_funding_v2(
  text,
  text,
  text,
  text,
  numeric
)
from public, anon, authenticated;

grant execute
on function public.fulfill_wallet_funding_v2(
  text,
  text,
  text,
  text,
  numeric
)
to service_role;

commit;
