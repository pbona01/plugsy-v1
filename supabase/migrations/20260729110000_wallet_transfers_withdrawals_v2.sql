begin;

do $preflight$
declare
  v_missing text;
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.wallet_transactions') is null
     or to_regclass('public.withdrawals') is null
     or to_regclass(
       'public.wallet_operation_idempotency_v2'
     ) is null
     or to_regclass(
       'public.wallet_notification_outbox_v2'
     ) is null then
    raise exception
      'wallet transfer v2 preflight failed: required tables are missing';
  end if;

  select pg_catalog.string_agg(
    required.table_name || '.' || required.column_name,
    ', '
  )
  into v_missing
  from (
    values
      ('profiles', 'clerk_id'),
      ('profiles', 'email'),
      ('profiles', 'full_name'),
      ('profiles', 'username'),
      ('profiles', 'balance'),
      ('profiles', 'bank_code'),
      ('profiles', 'bank_name'),
      ('profiles', 'account_number'),
      ('profiles', 'account_name'),
      ('profiles', 'updated_at'),
      ('wallet_transactions', 'id'),
      ('wallet_transactions', 'user_id'),
      ('wallet_transactions', 'user_email'),
      ('wallet_transactions', 'type'),
      ('wallet_transactions', 'amount'),
      ('wallet_transactions', 'fee'),
      ('wallet_transactions', 'status'),
      ('wallet_transactions', 'reference'),
      ('wallet_transactions', 'metadata'),
      ('wallet_transactions', 'balance_before'),
      ('wallet_transactions', 'balance_after'),
      ('wallet_transactions', 'provider_transaction_id'),
      ('wallet_transactions', 'currency'),
      ('wallet_transactions', 'idempotency_key'),
      ('wallet_transactions', 'updated_at'),
      ('withdrawals', 'id'),
      ('withdrawals', 'user_id'),
      ('withdrawals', 'user_email'),
      ('withdrawals', 'user_name'),
      ('withdrawals', 'amount'),
      ('withdrawals', 'bank_name'),
      ('withdrawals', 'account_number'),
      ('withdrawals', 'account_name'),
      ('withdrawals', 'status'),
      ('withdrawals', 'created_at')
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
      'wallet transfer v2 preflight failed: missing columns: %',
      v_missing;
  end if;
end
$preflight$;

alter table public.withdrawals
  add column if not exists fee numeric,
  add column if not exists reference text,
  add column if not exists idempotency_key text,
  add column if not exists bank_code text,
  add column if not exists provider_transaction_id text,
  add column if not exists provider_status text,
  add column if not exists reserved_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists settled_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists updated_at timestamptz;

do $duplicates$
begin
  if exists (
    select reference
    from public.withdrawals
    where reference is not null
    group by reference
    having count(*) > 1
  ) or exists (
    select user_id, idempotency_key
    from public.withdrawals
    where idempotency_key is not null
    group by user_id, idempotency_key
    having count(*) > 1
  ) or exists (
    select provider_transaction_id
    from public.withdrawals
    where provider_transaction_id is not null
    group by provider_transaction_id
    having count(*) > 1
  ) then
    raise exception
      'wallet transfer v2 preflight failed: duplicate withdrawal identity';
  end if;
end
$duplicates$;

create table if not exists public.financial_manual_review_events_v2 (
  id bigint generated always as identity primary key,
  event_key text not null,
  operation_type text not null,
  reference text,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  resolution_note text,
  constraint financial_manual_review_status_v2
    check (status in ('open', 'resolved', 'ignored'))
);

create unique index if not exists
  financial_manual_review_event_unique_v2
on public.financial_manual_review_events_v2 (event_key);

create table if not exists public.withdrawal_callback_events_v2 (
  id bigint generated always as identity primary key,
  event_key text not null,
  reference text,
  provider_transaction_id text,
  provider_status text,
  outcome text not null,
  created_at timestamptz not null default pg_catalog.now()
);

do $callback_outcome_constraint$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.withdrawal_callback_events_v2'::regclass and conname = 'withdrawal_callback_outcome_v2') then
    alter table public.withdrawal_callback_events_v2 add constraint withdrawal_callback_outcome_v2
      check (outcome in ('success', 'failure', 'manual_review')) not valid;
  end if;
end
$callback_outcome_constraint$;

create unique index if not exists
  withdrawal_callback_event_unique_v2
on public.withdrawal_callback_events_v2 (event_key);

create unique index if not exists
  withdrawals_reference_unique_v2
on public.withdrawals (reference)
where reference is not null;

create unique index if not exists
  withdrawals_idempotency_unique_v2
on public.withdrawals (user_id, idempotency_key)
where idempotency_key is not null;

create unique index if not exists
  withdrawals_provider_transaction_unique_v2
on public.withdrawals (provider_transaction_id)
where provider_transaction_id is not null;

create unique index if not exists
  wallet_transactions_operation_idempotency_unique_v2
on public.wallet_transactions (
  user_id,
  type,
  idempotency_key
)
where idempotency_key is not null
  and type in (
    'purchase',
    'portfolio_purchase',
    'p2p_send',
    'p2p_receive',
    'withdraw'
  );

create or replace function public.record_financial_manual_review_v2(
  p_event_key text,
  p_operation_type text,
  p_reference text,
  p_reason text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_id bigint;
begin
  if coalesce(pg_catalog.btrim(p_event_key), '') = ''
     or coalesce(pg_catalog.btrim(p_operation_type), '') = ''
     or coalesce(pg_catalog.btrim(p_reason), '') = '' then
    raise exception using
      errcode = '22023',
      message = 'MANUAL_REVIEW_EVENT_INVALID';
  end if;

  insert into public.financial_manual_review_events_v2 (
    event_key,
    operation_type,
    reference,
    reason,
    details
  )
  values (
    p_event_key,
    p_operation_type,
    p_reference,
    p_reason,
    coalesce(p_details, '{}'::jsonb)
  )
  on conflict (event_key) do update
  set details =
    public.financial_manual_review_events_v2.details ||
    excluded.details
  returning id
  into v_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'manual_review_id', v_id
  );
end
$function$;

create or replace function public.transfer_wallet_p2p_v2(
  p_actor_user_id text,
  p_actor_email text,
  p_recipient_username text,
  p_amount numeric,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_operation public.wallet_operation_idempotency_v2%rowtype;
  v_sender public.profiles%rowtype;
  v_recipient public.profiles%rowtype;
  v_recipient_user_id text;
  v_reference text;
  v_fingerprint text;
  v_sender_before numeric;
  v_sender_after numeric;
  v_recipient_before numeric;
  v_recipient_after numeric;
  v_result jsonb;
begin
  if coalesce(pg_catalog.btrim(p_actor_user_id), '') = ''
     or coalesce(pg_catalog.btrim(p_recipient_username), '') = ''
     or coalesce(pg_catalog.btrim(p_idempotency_key), '') = ''
     or coalesce(p_amount, 0) < 10
     or pg_catalog.round(p_amount, 2) <> p_amount then
    raise exception using
      errcode = '22023',
      message = 'TRANSFER_REQUEST_INVALID';
  end if;

  select clerk_id
  into v_recipient_user_id
  from public.profiles
  where pg_catalog.lower(username) =
    pg_catalog.lower(pg_catalog.btrim(p_recipient_username));

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'RECIPIENT_NOT_FOUND';
  end if;

  if v_recipient_user_id = p_actor_user_id then
    raise exception using
      errcode = '22023',
      message = 'SELF_TRANSFER_NOT_ALLOWED';
  end if;

  v_fingerprint := pg_catalog.md5(
    pg_catalog.concat_ws(
      '|',
      p_actor_user_id,
      v_recipient_user_id,
      p_amount::text,
      coalesce(pg_catalog.btrim(p_note), '')
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
    'p2p_transfer',
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
      and operation_type = 'p2p_transfer'
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

  perform 1
  from public.profiles
  where clerk_id in (
    p_actor_user_id,
    v_recipient_user_id
  )
  order by clerk_id
  for update;

  select *
  into v_sender
  from public.profiles
  where clerk_id = p_actor_user_id;

  select *
  into v_recipient
  from public.profiles
  where clerk_id = v_recipient_user_id;

  if v_sender.clerk_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'PROFILE_NOT_FOUND';
  end if;

  v_sender_before := coalesce(v_sender.balance, 0);
  v_recipient_before := coalesce(v_recipient.balance, 0);

  if v_sender_before < p_amount then
    raise exception using
      errcode = '22003',
      message = 'INSUFFICIENT_FUNDS';
  end if;

  v_sender_after := v_sender_before - p_amount;
  v_recipient_after := v_recipient_before + p_amount;
  v_reference := pg_catalog.concat(
    'p2p_',
    pg_catalog.md5(
      pg_catalog.concat_ws(
        '|', p_actor_user_id, p_idempotency_key
      )
    )
  );

  update public.profiles
  set balance = case
        when clerk_id = p_actor_user_id
          then v_sender_after
        else v_recipient_after
      end,
      updated_at = pg_catalog.now()
  where clerk_id in (
    p_actor_user_id,
    v_recipient_user_id
  );

  insert into public.wallet_transactions (
    user_id,
    user_email,
    type,
    amount,
    fee,
    status,
    reference,
    metadata,
    balance_before,
    balance_after,
    idempotency_key,
    currency,
    updated_at
  )
  values
    (
      p_actor_user_id,
      p_actor_email,
      'p2p_send',
      p_amount,
      0,
      'success',
      v_reference,
      pg_catalog.jsonb_build_object(
        'recipient_user_id', v_recipient_user_id,
        'recipient_username', v_recipient.username,
        'note', nullif(pg_catalog.btrim(p_note), '')
      ),
      v_sender_before,
      v_sender_after,
      p_idempotency_key,
      'NGN',
      pg_catalog.now()
    ),
    (
      v_recipient_user_id,
      v_recipient.email,
      'p2p_receive',
      p_amount,
      0,
      'success',
      v_reference || '_recipient',
      pg_catalog.jsonb_build_object(
        'sender_user_id', p_actor_user_id,
        'note', nullif(pg_catalog.btrim(p_note), '')
      ),
      v_recipient_before,
      v_recipient_after,
      p_idempotency_key,
      'NGN',
      pg_catalog.now()
    );

  perform public.insert_wallet_notification_v2(
    pg_catalog.concat('p2p:', v_reference, ':recipient'),
    v_recipient_user_id,
    'p2p_received',
    'wallet',
    pg_catalog.concat(
      'You received NGN ', p_amount::text,
      ' from a Plugsy user.'
    ),
    pg_catalog.jsonb_build_object(
      'reference', v_reference,
      'amount', p_amount,
      'sender_user_id', p_actor_user_id
    )
  );

  v_result := pg_catalog.jsonb_build_object(
    'success', true,
    'already_processed', false,
    'reference', v_reference,
    'amount', p_amount,
    'sender_balance_after', v_sender_after,
    'recipient', pg_catalog.jsonb_build_object(
      'username', v_recipient.username,
      'full_name', v_recipient.full_name
    )
  );

  update public.wallet_operation_idempotency_v2
  set status = 'completed',
      reference = v_reference,
      result = v_result,
      completed_at = pg_catalog.now()
  where actor_user_id = p_actor_user_id
    and operation_type = 'p2p_transfer'
    and idempotency_key = p_idempotency_key;

  return v_result;
end
$function$;

create or replace function public.reserve_wallet_withdrawal_v2(
  p_actor_user_id text,
  p_actor_email text,
  p_amount numeric,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_operation public.wallet_operation_idempotency_v2%rowtype;
  v_profile public.profiles%rowtype;
  v_withdrawal public.withdrawals%rowtype;
  v_fee numeric;
  v_total numeric;
  v_before numeric;
  v_after numeric;
  v_reference text;
  v_fingerprint text;
  v_result jsonb;
begin
  if coalesce(pg_catalog.btrim(p_actor_user_id), '') = ''
     or coalesce(pg_catalog.btrim(p_idempotency_key), '') = ''
     or coalesce(p_amount, 0) < 1000
     or pg_catalog.round(p_amount, 2) <> p_amount then
    raise exception using
      errcode = '22023',
      message = 'WITHDRAWAL_REQUEST_INVALID';
  end if;

  v_fee := case
    when p_amount < 10000 then 25
    when p_amount < 100000 then 100
    when p_amount < 1000000 then 500
    else 5000
  end;
  v_total := p_amount + v_fee;
  v_fingerprint := pg_catalog.md5(
    pg_catalog.concat_ws(
      '|', p_actor_user_id, p_amount::text
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
    'withdrawal',
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
      and operation_type = 'withdrawal'
      and idempotency_key = p_idempotency_key
    for update;

    if v_operation.request_fingerprint <> v_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;

    select *
    into v_withdrawal
    from public.withdrawals
    where reference = v_operation.reference
    for update;

    if v_operation.status = 'completed'
       and v_operation.result is not null then
      return v_operation.result ||
        pg_catalog.jsonb_build_object(
          'already_processed', true,
          'provider_submitted',
            v_withdrawal.submitted_at is not null
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

  if coalesce(pg_catalog.btrim(v_profile.bank_code), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.bank_name), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.account_number), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.account_name), '') = '' then
    raise exception using
      errcode = '55000',
      message = 'WITHDRAWAL_BANK_REQUIRED';
  end if;

  v_before := coalesce(v_profile.balance, 0);
  if v_before < v_total then
    raise exception using
      errcode = '22003',
      message = 'INSUFFICIENT_FUNDS';
  end if;
  v_after := v_before - v_total;
  v_reference := pg_catalog.concat(
    'wallet_withdrawal_',
    pg_catalog.md5(
      pg_catalog.concat_ws(
        '|', p_actor_user_id, p_idempotency_key
      )
    )
  );

  update public.profiles
  set balance = v_after,
      updated_at = pg_catalog.now()
  where clerk_id = p_actor_user_id;

  insert into public.wallet_transactions (
    user_id,
    user_email,
    type,
    amount,
    fee,
    status,
    reference,
    metadata,
    balance_before,
    balance_after,
    idempotency_key,
    currency,
    updated_at
  )
  values (
    p_actor_user_id,
    p_actor_email,
    'withdraw',
    p_amount,
    v_fee,
    'pending',
    v_reference,
    pg_catalog.jsonb_build_object(
      'operation', 'withdrawal_reservation',
      'reserved_total', v_total
    ),
    v_before,
    v_after,
    p_idempotency_key,
    'NGN',
    pg_catalog.now()
  );

  insert into public.withdrawals (
    user_id,
    user_email,
    user_name,
    amount,
    fee,
    bank_code,
    bank_name,
    account_number,
    account_name,
    status,
    reference,
    idempotency_key,
    reserved_at,
    updated_at
  )
  values (
    p_actor_user_id,
    p_actor_email,
    coalesce(v_profile.full_name, p_actor_email),
    p_amount,
    v_fee,
    v_profile.bank_code,
    v_profile.bank_name,
    v_profile.account_number,
    v_profile.account_name,
    'reserved',
    v_reference,
    p_idempotency_key,
    pg_catalog.now(),
    pg_catalog.now()
  )
  returning *
  into v_withdrawal;

  v_result := pg_catalog.jsonb_build_object(
    'success', true,
    'already_processed', false,
    'provider_submitted', false,
    'reference', v_reference,
    'amount', p_amount,
    'fee', v_fee,
    'balance_after', v_after,
    'bank_code', v_withdrawal.bank_code,
    'account_number', v_withdrawal.account_number
  );

  update public.wallet_operation_idempotency_v2
  set status = 'completed',
      reference = v_reference,
      result = v_result,
      completed_at = pg_catalog.now()
  where actor_user_id = p_actor_user_id
    and operation_type = 'withdrawal'
    and idempotency_key = p_idempotency_key;

  return v_result;
end
$function$;

create or replace function public.mark_wallet_withdrawal_attempt_started_v2(
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_withdrawal public.withdrawals%rowtype;
begin
  select *
  into v_withdrawal
  from public.withdrawals
  where reference = p_reference
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'WITHDRAWAL_NOT_FOUND';
  end if;

  update public.withdrawals
  set provider_status = coalesce(provider_status, 'submission_started'),
      updated_at = pg_catalog.now()
  where id = v_withdrawal.id;

  update public.wallet_operation_idempotency_v2
  set result = coalesce(result, '{}'::jsonb) ||
      pg_catalog.jsonb_build_object(
        'provider_submitted', true,
        'provider_attempt_started', true
      )
  where operation_type = 'withdrawal'
    and reference = p_reference;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'reference', p_reference,
    'provider_attempt_started', true
  );
end
$function$;

create or replace function public.mark_wallet_withdrawal_submitted_v2(
  p_reference text,
  p_provider_transaction_id text,
  p_provider_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_withdrawal public.withdrawals%rowtype;
  v_collision public.withdrawals%rowtype;
begin
  if coalesce(pg_catalog.btrim(p_reference), '') = ''
     or coalesce(
       pg_catalog.btrim(p_provider_transaction_id),
       ''
     ) = '' then
    raise exception using
      errcode = '22023',
      message = 'WITHDRAWAL_PROVIDER_SUBMISSION_INVALID';
  end if;

  select *
  into v_withdrawal
  from public.withdrawals
  where reference = p_reference
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'WITHDRAWAL_NOT_FOUND';
  end if;

  select * into v_collision
  from public.withdrawals
  where provider_transaction_id = p_provider_transaction_id
    and reference <> p_reference
  for update;

  if found then
    perform public.record_financial_manual_review_v2(
      'withdrawal-provider-collision:' || p_reference || ':' || p_provider_transaction_id,
      'withdrawal',
      p_reference,
      'WITHDRAWAL_PROVIDER_TRANSACTION_COLLISION',
      pg_catalog.jsonb_build_object('owner_reference', v_collision.reference)
    );

    update public.wallet_operation_idempotency_v2
    set result = coalesce(result, '{}'::jsonb) ||
        pg_catalog.jsonb_build_object(
          'provider_submitted', true,
          'pending_manual_review', true
        )
    where operation_type = 'withdrawal'
      and reference = p_reference;

    return pg_catalog.jsonb_build_object(
      'success', false,
      'manual_review', true,
      'settlement_applied', false,
      'refund_applied', false,
      'reason', 'WITHDRAWAL_PROVIDER_TRANSACTION_COLLISION'
    );
  end if;

  if v_withdrawal.provider_transaction_id is not null
     and v_withdrawal.provider_transaction_id <>
       p_provider_transaction_id then
    raise exception using
      errcode = '23505',
      message = 'WITHDRAWAL_PROVIDER_ID_MISMATCH';
  end if;

  update public.withdrawals
  set provider_transaction_id = p_provider_transaction_id,
      provider_status = p_provider_status,
      status = case
        when status = 'reserved' then 'pending'
        else status
      end,
      submitted_at = coalesce(submitted_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where id = v_withdrawal.id;

  update public.wallet_transactions
  set provider_transaction_id = p_provider_transaction_id,
      metadata = coalesce(metadata, '{}'::jsonb) ||
        pg_catalog.jsonb_build_object(
          'provider', 'flutterwave',
          'provider_status', p_provider_status,
          'submitted_at', pg_catalog.now()
        ),
      updated_at = pg_catalog.now()
  where reference = p_reference
    and type = 'withdraw';

  update public.wallet_operation_idempotency_v2
  set result = coalesce(result, '{}'::jsonb) ||
      pg_catalog.jsonb_build_object('provider_submitted', true)
  where operation_type = 'withdrawal'
    and reference = p_reference;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'reference', p_reference,
    'provider_transaction_id', p_provider_transaction_id,
    'provider_submitted', true
  );
end
$function$;

create or replace function public.mark_wallet_withdrawal_manual_review_v2(
  p_reference text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_withdrawal public.withdrawals%rowtype;
begin
  select *
  into v_withdrawal
  from public.withdrawals
  where reference = p_reference
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'WITHDRAWAL_NOT_FOUND';
  end if;

  update public.withdrawals
  set provider_status = coalesce(nullif(pg_catalog.btrim(p_reason), ''), 'unknown'),
      updated_at = pg_catalog.now()
  where id = v_withdrawal.id
    and status not in ('success', 'failed', 'refunded');

  update public.wallet_transactions
  set metadata = coalesce(metadata, '{}'::jsonb) ||
        pg_catalog.jsonb_build_object(
          'manual_review', true,
          'reason', p_reason
        ),
      updated_at = pg_catalog.now()
  where reference = p_reference
    and type = 'withdraw';

  update public.wallet_operation_idempotency_v2
  set result = coalesce(result, '{}'::jsonb) ||
      pg_catalog.jsonb_build_object(
        'provider_submitted', true,
        'pending_manual_review', true
      )
  where operation_type = 'withdrawal'
    and reference = p_reference;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'reference', p_reference,
    'pending_manual_review', true
  );
end
$function$;

create or replace function public.record_wallet_withdrawal_callback_manual_review_v2(
  p_event_key text, p_reference text, p_provider_transaction_id text,
  p_provider_status text, p_reason text, p_details jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $function$
declare
  v_event public.withdrawal_callback_events_v2%rowtype;
begin
  insert into public.withdrawal_callback_events_v2 (event_key, reference, provider_transaction_id, provider_status, outcome)
  values (p_event_key, p_reference, p_provider_transaction_id, p_provider_status, 'manual_review')
  on conflict (event_key) do nothing;

  select * into v_event
  from public.withdrawal_callback_events_v2
  where event_key = p_event_key
  for update;

  if v_event.reference is distinct from p_reference
     or v_event.provider_transaction_id is distinct from p_provider_transaction_id
     or v_event.provider_status is distinct from p_provider_status
     or v_event.outcome <> 'manual_review' then
    perform public.record_financial_manual_review_v2(
      'withdrawal-callback-conflict:' || p_event_key,
      'withdrawal',
      p_reference,
      'WITHDRAWAL_CALLBACK_EVENT_CONFLICT',
      pg_catalog.jsonb_build_object(
        'existing_reference', v_event.reference,
        'existing_provider_transaction_id', v_event.provider_transaction_id,
        'existing_provider_status', v_event.provider_status,
        'existing_outcome', v_event.outcome
      )
    );
    return pg_catalog.jsonb_build_object('success', false, 'manual_review', true, 'settlement_applied', false, 'refund_applied', false, 'reason', 'WITHDRAWAL_CALLBACK_EVENT_CONFLICT');
  end if;

  perform public.record_financial_manual_review_v2('withdrawal-review:' || p_event_key, 'withdrawal', p_reference, p_reason, p_details);
  return pg_catalog.jsonb_build_object('success', false, 'manual_review', true, 'settlement_applied', false, 'refund_applied', false, 'reason', p_reason);
end
$function$;

create or replace function public.settle_wallet_withdrawal_success_v2(
  p_reference text,
  p_provider_transaction_id text,
  p_provider_status text,
  p_event_key text,
  p_amount numeric,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_withdrawal public.withdrawals%rowtype;
  v_existing_event public.withdrawal_callback_events_v2%rowtype;
  v_collision public.withdrawals%rowtype;
  v_event_inserted text;
begin
  select * into v_existing_event
  from public.withdrawal_callback_events_v2
  where event_key = p_event_key
  for update;

  if found then
    if v_existing_event.reference is distinct from p_reference
       or v_existing_event.provider_transaction_id is distinct from p_provider_transaction_id
       or v_existing_event.provider_status is distinct from p_provider_status
       or v_existing_event.outcome <> 'success' then
      perform public.record_financial_manual_review_v2(
        'withdrawal-callback-conflict:' || p_event_key,
        'withdrawal', p_reference, 'WITHDRAWAL_CALLBACK_EVENT_CONFLICT',
        pg_catalog.jsonb_build_object('existing_outcome', v_existing_event.outcome)
      );
      return pg_catalog.jsonb_build_object('success', false, 'manual_review', true, 'settlement_applied', false, 'refund_applied', false, 'reason', 'WITHDRAWAL_CALLBACK_EVENT_CONFLICT');
    end if;
    return pg_catalog.jsonb_build_object(
      'success', true,
      'already_processed', true,
      'manual_review', false,
      'settlement_applied', false,
      'refund_applied', false,
      'reference', p_reference,
      'refunded', false
    );
  end if;

  select *
  into v_withdrawal
  from public.withdrawals
  where reference = p_reference
  for update;

  if not found then
    return public.record_wallet_withdrawal_callback_manual_review_v2(
      p_event_key, p_reference, p_provider_transaction_id, p_provider_status,
      'WITHDRAWAL_NOT_FOUND',
      pg_catalog.jsonb_build_object('provider_transaction_id', p_provider_transaction_id)
    );
  end if;

  select * into v_collision
  from public.withdrawals
  where provider_transaction_id = p_provider_transaction_id
    and reference <> p_reference
  for update;

  if found then
    return public.record_wallet_withdrawal_callback_manual_review_v2(
      p_event_key, p_reference, p_provider_transaction_id, p_provider_status,
      'WITHDRAWAL_PROVIDER_TRANSACTION_COLLISION',
      pg_catalog.jsonb_build_object('owner_reference', v_collision.reference)
    );
  end if;

  if pg_catalog.upper(coalesce(p_currency, '')) <> 'NGN'
     or v_withdrawal.amount <> p_amount
     or (
       v_withdrawal.provider_transaction_id is not null
       and v_withdrawal.provider_transaction_id <>
         p_provider_transaction_id
     ) then
    return public.record_wallet_withdrawal_callback_manual_review_v2(
      p_event_key, p_reference, p_provider_transaction_id, p_provider_status,
      'WITHDRAWAL_VERIFICATION_MISMATCH',
      pg_catalog.jsonb_build_object('provider_transaction_id', p_provider_transaction_id, 'amount', p_amount, 'currency', p_currency)
    );
  end if;

  if v_withdrawal.refunded_at is not null
     or v_withdrawal.status = 'failed' then
    return public.record_wallet_withdrawal_callback_manual_review_v2(
      p_event_key, p_reference, p_provider_transaction_id, p_provider_status,
      'WITHDRAWAL_ALREADY_REFUNDED',
      pg_catalog.jsonb_build_object('provider_transaction_id', p_provider_transaction_id)
    );
  end if;

  insert into public.withdrawal_callback_events_v2 (
    event_key, reference, provider_transaction_id, provider_status, outcome
  ) values (
    p_event_key, p_reference, p_provider_transaction_id, p_provider_status, 'success'
  ) on conflict (event_key) do nothing
  returning event_key into v_event_inserted;

  if v_event_inserted is null then
    select * into v_existing_event
    from public.withdrawal_callback_events_v2
    where event_key = p_event_key
    for update;
    if v_existing_event.reference is not distinct from p_reference
       and v_existing_event.provider_transaction_id is not distinct from p_provider_transaction_id
       and v_existing_event.provider_status is not distinct from p_provider_status
       and v_existing_event.outcome = 'success' then
      return pg_catalog.jsonb_build_object('success', true, 'already_processed', true, 'manual_review', false, 'settlement_applied', false, 'refund_applied', false, 'reference', p_reference, 'refunded', false);
    end if;
    perform public.record_financial_manual_review_v2('withdrawal-callback-conflict:' || p_event_key, 'withdrawal', p_reference, 'WITHDRAWAL_CALLBACK_EVENT_CONFLICT', pg_catalog.jsonb_build_object('existing_outcome', v_existing_event.outcome));
    return pg_catalog.jsonb_build_object('success', false, 'manual_review', true, 'settlement_applied', false, 'refund_applied', false, 'reason', 'WITHDRAWAL_CALLBACK_EVENT_CONFLICT');
  end if;

  if v_withdrawal.status = 'success' then
    return pg_catalog.jsonb_build_object('success', true, 'already_processed', true, 'manual_review', false, 'settlement_applied', false, 'refund_applied', false, 'reference', p_reference, 'refunded', false);
  end if;

  update public.withdrawals
  set status = 'success',
      provider_transaction_id = p_provider_transaction_id,
      provider_status = p_provider_status,
      settled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = v_withdrawal.id;

  update public.wallet_transactions
  set status = 'success',
      provider_transaction_id = p_provider_transaction_id,
      metadata = coalesce(metadata, '{}'::jsonb) ||
        pg_catalog.jsonb_build_object(
          'provider_status', p_provider_status,
          'settled_at', pg_catalog.now()
        ),
      updated_at = pg_catalog.now()
  where reference = p_reference
    and type = 'withdraw'
    and status = 'pending';

  perform public.insert_wallet_notification_v2(
    'withdrawal:' || p_reference || ':success',
    v_withdrawal.user_id,
    'withdrawal_success',
    'wallet',
    pg_catalog.concat(
      'Your withdrawal of NGN ',
      v_withdrawal.amount::text,
      ' was completed.'
    ),
    pg_catalog.jsonb_build_object(
      'reference', p_reference,
      'amount', v_withdrawal.amount
    )
  );

  update public.wallet_operation_idempotency_v2
  set result = coalesce(result, '{}'::jsonb) ||
      pg_catalog.jsonb_build_object(
        'provider_submitted', true,
        'pending', false,
        'withdrawal_final_status', 'success',
        'refunded', false
      )
  where operation_type = 'withdrawal'
    and reference = p_reference;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'already_processed', false,
    'manual_review', false,
    'settlement_applied', true,
    'refund_applied', false,
    'reference', p_reference,
    'refunded', false
  );
end
$function$;

create or replace function public.refund_wallet_withdrawal_v2(
  p_reference text,
  p_provider_transaction_id text,
  p_provider_status text,
  p_event_key text,
  p_amount numeric default null,
  p_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_withdrawal public.withdrawals%rowtype;
  v_profile public.profiles%rowtype;
  v_refund numeric;
  v_after numeric;
  v_existing_event public.withdrawal_callback_events_v2%rowtype;
  v_collision public.withdrawals%rowtype;
  v_event_inserted text;
begin
  select * into v_existing_event
  from public.withdrawal_callback_events_v2
  where event_key = p_event_key
  for update;

  if found then
    if v_existing_event.reference is distinct from p_reference
       or v_existing_event.provider_transaction_id is distinct from p_provider_transaction_id
       or v_existing_event.provider_status is distinct from p_provider_status
       or v_existing_event.outcome <> 'failure' then
      perform public.record_financial_manual_review_v2(
        'withdrawal-callback-conflict:' || p_event_key,
        'withdrawal', p_reference, 'WITHDRAWAL_CALLBACK_EVENT_CONFLICT',
        pg_catalog.jsonb_build_object('existing_outcome', v_existing_event.outcome)
      );
      return pg_catalog.jsonb_build_object('success', false, 'manual_review', true, 'settlement_applied', false, 'refund_applied', false, 'reason', 'WITHDRAWAL_CALLBACK_EVENT_CONFLICT');
    end if;
    return pg_catalog.jsonb_build_object(
      'success', true,
      'already_processed', true,
      'manual_review', false,
      'settlement_applied', false,
      'refund_applied', false,
      'reference', p_reference,
      'refunded', true
    );
  end if;

  select *
  into v_withdrawal
  from public.withdrawals
  where reference = p_reference
  for update;

  if not found then
    return public.record_wallet_withdrawal_callback_manual_review_v2(
      p_event_key, p_reference, p_provider_transaction_id, p_provider_status,
      'WITHDRAWAL_NOT_FOUND',
      pg_catalog.jsonb_build_object('provider_transaction_id', p_provider_transaction_id)
    );
  end if;

  select * into v_collision
  from public.withdrawals
  where provider_transaction_id = p_provider_transaction_id
    and reference <> p_reference
  for update;

  if found then
    return public.record_wallet_withdrawal_callback_manual_review_v2(
      p_event_key, p_reference, p_provider_transaction_id, p_provider_status,
      'WITHDRAWAL_PROVIDER_TRANSACTION_COLLISION',
      pg_catalog.jsonb_build_object('owner_reference', v_collision.reference)
    );
  end if;

  if p_amount is not null
     and (
       v_withdrawal.amount <> p_amount
       or pg_catalog.upper(coalesce(p_currency, '')) <> 'NGN'
     ) then
    return public.record_wallet_withdrawal_callback_manual_review_v2(
      p_event_key, p_reference, p_provider_transaction_id, p_provider_status,
      'WITHDRAWAL_VERIFICATION_MISMATCH',
      pg_catalog.jsonb_build_object('amount', p_amount, 'currency', p_currency)
    );
  end if;

  if v_withdrawal.status = 'success' then
    return public.record_wallet_withdrawal_callback_manual_review_v2(
      p_event_key, p_reference, p_provider_transaction_id, p_provider_status,
      'WITHDRAWAL_ALREADY_SETTLED',
      pg_catalog.jsonb_build_object('provider_transaction_id', p_provider_transaction_id)
    );
  end if;

  insert into public.withdrawal_callback_events_v2 (
    event_key, reference, provider_transaction_id, provider_status, outcome
  ) values (
    p_event_key, p_reference, p_provider_transaction_id, p_provider_status, 'failure'
  ) on conflict (event_key) do nothing
  returning event_key into v_event_inserted;

  if v_event_inserted is null then
    select * into v_existing_event
    from public.withdrawal_callback_events_v2
    where event_key = p_event_key
    for update;
    if v_existing_event.reference is not distinct from p_reference
       and v_existing_event.provider_transaction_id is not distinct from p_provider_transaction_id
       and v_existing_event.provider_status is not distinct from p_provider_status
       and v_existing_event.outcome = 'failure' then
      return pg_catalog.jsonb_build_object('success', true, 'already_processed', true, 'manual_review', false, 'settlement_applied', false, 'refund_applied', false, 'reference', p_reference, 'refunded', true);
    end if;
    perform public.record_financial_manual_review_v2('withdrawal-callback-conflict:' || p_event_key, 'withdrawal', p_reference, 'WITHDRAWAL_CALLBACK_EVENT_CONFLICT', pg_catalog.jsonb_build_object('existing_outcome', v_existing_event.outcome));
    return pg_catalog.jsonb_build_object('success', false, 'manual_review', true, 'settlement_applied', false, 'refund_applied', false, 'reason', 'WITHDRAWAL_CALLBACK_EVENT_CONFLICT');
  end if;

  if v_withdrawal.refunded_at is not null
     or v_withdrawal.status = 'failed' then
    return pg_catalog.jsonb_build_object('success', true, 'already_processed', true, 'manual_review', false, 'settlement_applied', false, 'refund_applied', false, 'reference', p_reference, 'refunded', true);
  end if;

  select *
  into v_profile
  from public.profiles
  where clerk_id = v_withdrawal.user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'PROFILE_NOT_FOUND';
  end if;

  v_refund := v_withdrawal.amount + coalesce(v_withdrawal.fee, 0);
  v_after := coalesce(v_profile.balance, 0) + v_refund;

  update public.profiles
  set balance = v_after,
      updated_at = pg_catalog.now()
  where clerk_id = v_withdrawal.user_id;

  update public.withdrawals
  set status = 'failed',
      provider_transaction_id = coalesce(
        provider_transaction_id,
        p_provider_transaction_id
      ),
      provider_status = p_provider_status,
      refunded_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = v_withdrawal.id;

  update public.wallet_transactions
  set status = 'failed',
      balance_after = v_after,
      provider_transaction_id = coalesce(
        provider_transaction_id,
        p_provider_transaction_id
      ),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        pg_catalog.jsonb_build_object(
          'provider_status', p_provider_status,
          'refunded_at', pg_catalog.now(),
          'refund_amount', v_refund
        ),
      updated_at = pg_catalog.now()
  where reference = p_reference
    and type = 'withdraw'
    and status = 'pending';

  perform public.insert_wallet_notification_v2(
    'withdrawal:' || p_reference || ':refund',
    v_withdrawal.user_id,
    'withdrawal_failed',
    'wallet',
    pg_catalog.concat(
      'Your withdrawal failed and NGN ',
      v_refund::text,
      ' was returned to your wallet.'
    ),
    pg_catalog.jsonb_build_object(
      'reference', p_reference,
      'refund_amount', v_refund
    )
  );

  update public.wallet_operation_idempotency_v2
  set result = coalesce(result, '{}'::jsonb) ||
      pg_catalog.jsonb_build_object(
        'provider_submitted', true,
        'pending', false,
        'withdrawal_final_status', 'failed',
        'refunded', true
      )
  where operation_type = 'withdrawal'
    and reference = p_reference;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'already_processed', false,
    'manual_review', false,
    'settlement_applied', false,
    'refund_applied', true,
    'reference', p_reference,
    'refunded', true,
    'balance_after', v_after
  );
end
$function$;

revoke all
on table
  public.financial_manual_review_events_v2,
  public.withdrawal_callback_events_v2
from public, anon, authenticated;

grant select, insert, update
on table
  public.financial_manual_review_events_v2,
  public.withdrawal_callback_events_v2
to service_role;

revoke all
on function public.record_financial_manual_review_v2(
  text, text, text, text, jsonb
)
from public, anon, authenticated;

revoke all
on function public.transfer_wallet_p2p_v2(
  text, text, text, numeric, text, text
)
from public, anon, authenticated;

revoke all
on function public.reserve_wallet_withdrawal_v2(
  text, text, numeric, text
)
from public, anon, authenticated;

revoke all
on function public.mark_wallet_withdrawal_submitted_v2(
  text, text, text
)
from public, anon, authenticated;

revoke all
on function public.mark_wallet_withdrawal_attempt_started_v2(
  text
)
from public, anon, authenticated;

revoke all
on function public.mark_wallet_withdrawal_manual_review_v2(
  text, text
)
from public, anon, authenticated;

revoke all
on function public.settle_wallet_withdrawal_success_v2(
  text, text, text, text, numeric, text
)
from public, anon, authenticated;

revoke all on function public.record_wallet_withdrawal_callback_manual_review_v2(
  text, text, text, text, text, jsonb
) from public, anon, authenticated;

revoke all
on function public.refund_wallet_withdrawal_v2(
  text, text, text, text, numeric, text
)
from public, anon, authenticated;

grant execute
on function public.record_financial_manual_review_v2(
  text, text, text, text, jsonb
)
to service_role;

grant execute
on function public.transfer_wallet_p2p_v2(
  text, text, text, numeric, text, text
)
to service_role;

grant execute
on function public.reserve_wallet_withdrawal_v2(
  text, text, numeric, text
)
to service_role;

grant execute
on function public.mark_wallet_withdrawal_submitted_v2(
  text, text, text
)
to service_role;

grant execute
on function public.mark_wallet_withdrawal_attempt_started_v2(
  text
)
to service_role;

grant execute
on function public.mark_wallet_withdrawal_manual_review_v2(
  text, text
)
to service_role;

grant execute on function public.record_wallet_withdrawal_callback_manual_review_v2(
  text, text, text, text, text, jsonb
) to service_role;

grant execute
on function public.settle_wallet_withdrawal_success_v2(
  text, text, text, text, numeric, text
)
to service_role;

grant execute
on function public.refund_wallet_withdrawal_v2(
  text, text, text, text, numeric, text
)
to service_role;

commit;
