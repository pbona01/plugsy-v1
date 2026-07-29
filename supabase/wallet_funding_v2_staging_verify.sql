begin;

create or replace function
  public.wallet_funding_stage_reject_message()
returns trigger
language plpgsql
as $trigger$
begin
  if new.user_id like 'staging_wallet_fund_notify_%'
     and new.event = 'wallet_funded' then
    raise exception
      'staging forced notification failure';
  end if;

  return new;
end
$trigger$;

drop trigger if exists
  wallet_funding_stage_reject_message_trigger
on public.messages;

create trigger
  wallet_funding_stage_reject_message_trigger
before insert
on public.messages
for each row
execute function
  public.wallet_funding_stage_reject_message();

do $verify$
declare
  v_suffix text :=
    pg_catalog.txid_current()::text;

  v_notify_user text :=
    'staging_wallet_fund_notify_' || v_suffix;
  v_notify_email text :=
    'wallet-notify-' || v_suffix || '@example.test';
  v_notify_reference text :=
    'wallet_fund_stage_notify_' || v_suffix;
  v_notify_provider text :=
    'flw_stage_notify_' || v_suffix;

  v_normal_user text :=
    'staging_wallet_fund_normal_' || v_suffix;
  v_normal_email text :=
    'wallet-normal-' || v_suffix || '@example.test';
  v_normal_reference text :=
    'wallet_fund_stage_normal_' || v_suffix;
  v_normal_provider text :=
    'flw_stage_normal_' || v_suffix;

  v_collision_user_a text :=
    'staging_wallet_fund_collision_a_' || v_suffix;
  v_collision_user_b text :=
    'staging_wallet_fund_collision_b_' || v_suffix;
  v_collision_email_a text :=
    'wallet-collision-a-' || v_suffix || '@example.test';
  v_collision_email_b text :=
    'wallet-collision-b-' || v_suffix || '@example.test';
  v_collision_reference_a text :=
    'wallet_fund_stage_collision_a_' || v_suffix;
  v_collision_reference_b text :=
    'wallet_fund_stage_collision_b_' || v_suffix;
  v_collision_provider text :=
    'flw_stage_collision_' || v_suffix;

  v_result jsonb;
  v_balance numeric;
  v_message_count integer;
  v_status text;
  v_failed boolean := false;
begin
  if pg_catalog.has_function_privilege(
    'anon',
    'public.fulfill_wallet_funding_v2(text,text,text,text,numeric)',
    'EXECUTE'
  ) then
    raise exception
      'anon unexpectedly has execute permission';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.fulfill_wallet_funding_v2(text,text,text,text,numeric)',
    'EXECUTE'
  ) then
    raise exception
      'authenticated unexpectedly has execute permission';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.fulfill_wallet_funding_v2(text,text,text,text,numeric)',
    'EXECUTE'
  ) then
    raise exception
      'service_role is missing execute permission';
  end if;

  insert into public.profiles (
    clerk_id,
    email,
    full_name,
    balance,
    role,
    updated_at
  )
  values
    (
      v_notify_user,
      v_notify_email,
      'Notification Failure User',
      500,
      'user',
      pg_catalog.now()
    ),
    (
      v_normal_user,
      v_normal_email,
      'Normal Funding User',
      500,
      'user',
      pg_catalog.now()
    ),
    (
      v_collision_user_a,
      v_collision_email_a,
      'Collision User A',
      500,
      'user',
      pg_catalog.now()
    ),
    (
      v_collision_user_b,
      v_collision_email_b,
      'Collision User B',
      500,
      'user',
      pg_catalog.now()
    );

  insert into public.wallet_transactions (
    user_id,
    user_email,
    type,
    amount,
    fee,
    status,
    reference,
    currency,
    description,
    metadata
  )
  values
    (
      v_notify_user,
      v_notify_email,
      'fund',
      1000,
      0,
      'pending',
      v_notify_reference,
      'NGN',
      'Forced notification failure test',
      '{}'::jsonb
    ),
    (
      v_normal_user,
      v_normal_email,
      'fund',
      1000,
      0,
      'pending',
      v_normal_reference,
      'NGN',
      'Normal funding test',
      '{}'::jsonb
    ),
    (
      v_collision_user_a,
      v_collision_email_a,
      'fund',
      700,
      0,
      'pending',
      v_collision_reference_a,
      'NGN',
      'Provider collision test A',
      '{}'::jsonb
    ),
    (
      v_collision_user_b,
      v_collision_email_b,
      'fund',
      700,
      0,
      'pending',
      v_collision_reference_b,
      'NGN',
      'Provider collision test B',
      '{}'::jsonb
    );

  -- Notification failure must not roll back wallet credit.
  v_result :=
    public.fulfill_wallet_funding_v2(
      v_notify_reference,
      v_notify_provider,
      'successful',
      'NGN',
      1000
    );

  if v_result->>'success' <> 'true'
     or v_result->>'already_processed' <> 'false' then
    raise exception
      'notification-failure fulfilment did not succeed';
  end if;

  select balance
  into v_balance
  from public.profiles
  where clerk_id = v_notify_user;

  if v_balance <> 1500 then
    raise exception
      'notification failure rolled back or corrupted balance: %',
      v_balance;
  end if;

  select status
  into v_status
  from public.wallet_transactions
  where reference = v_notify_reference;

  if v_status <> 'success' then
    raise exception
      'notification failure rolled back transaction status: %',
      v_status;
  end if;

  select count(*)
  into v_message_count
  from public.messages
  where user_id = v_notify_user
    and event = 'wallet_funded';

  if v_message_count <> 0 then
    raise exception
      'forced-failure notification unexpectedly exists';
  end if;

  -- Duplicate callback must not credit twice.
  v_result :=
    public.fulfill_wallet_funding_v2(
      v_notify_reference,
      v_notify_provider,
      'successful',
      'NGN',
      1000
    );

  if v_result->>'already_processed' <> 'true' then
    raise exception
      'duplicate notification-failure callback was not idempotent';
  end if;

  select balance
  into v_balance
  from public.profiles
  where clerk_id = v_notify_user;

  if v_balance <> 1500 then
    raise exception
      'duplicate callback changed balance: %',
      v_balance;
  end if;

  -- Normal fulfilment must create exactly one notification.
  v_result :=
    public.fulfill_wallet_funding_v2(
      v_normal_reference,
      v_normal_provider,
      'successful',
      'NGN',
      1000
    );

  if v_result->>'already_processed' <> 'false' then
    raise exception
      'normal first fulfilment was reported as duplicate';
  end if;

  v_result :=
    public.fulfill_wallet_funding_v2(
      v_normal_reference,
      v_normal_provider,
      'successful',
      'NGN',
      1000
    );

  if v_result->>'already_processed' <> 'true' then
    raise exception
      'normal duplicate fulfilment was not idempotent';
  end if;

  select balance
  into v_balance
  from public.profiles
  where clerk_id = v_normal_user;

  if v_balance <> 1500 then
    raise exception
      'normal duplicate fulfilment changed balance: %',
      v_balance;
  end if;

  select count(*)
  into v_message_count
  from public.messages
  where user_id = v_normal_user
    and event = 'wallet_funded';

  if v_message_count <> 1 then
    raise exception
      'expected one normal notification, found %',
      v_message_count;
  end if;

  -- One provider transaction ID cannot fund two references.
  perform public.fulfill_wallet_funding_v2(
    v_collision_reference_a,
    v_collision_provider,
    'successful',
    'NGN',
    700
  );

  v_failed := false;

  begin
    perform public.fulfill_wallet_funding_v2(
      v_collision_reference_b,
      v_collision_provider,
      'successful',
      'NGN',
      700
    );
  exception
    when unique_violation then
      v_failed := true;
  end;

  if not v_failed then
    raise exception
      'duplicate provider transaction ID was accepted';
  end if;

  select balance
  into v_balance
  from public.profiles
  where clerk_id = v_collision_user_b;

  if v_balance <> 500 then
    raise exception
      'provider collision changed second user balance: %',
      v_balance;
  end if;

  select status
  into v_status
  from public.wallet_transactions
  where reference = v_collision_reference_b;

  if v_status <> 'pending' then
    raise exception
      'provider collision changed second transaction: %',
      v_status;
  end if;

  -- Amount mismatches must fail without mutation.
  v_failed := false;

  begin
    perform public.fulfill_wallet_funding_v2(
      v_normal_reference,
      v_normal_provider,
      'successful',
      'NGN',
      999
    );
  exception
    when others then
      v_failed := true;
  end;

  if not v_failed then
    raise exception
      'amount mismatch was not rejected';
  end if;
end
$verify$;

rollback;