begin;

create temporary table profile_domain_separation_guard_v1
on commit drop
as
select
  (select pg_catalog.count(*) from public.profiles) as profile_count,
  (select coalesce(pg_catalog.sum(balance), 0) from public.profiles) as balance_total,
  (select pg_catalog.count(*) from public.wallet_transactions) as transaction_count;

alter table public.profiles
  add column if not exists wallet_tag text,
  add column if not exists one_link_username text,
  add column if not exists one_link_display_name text,
  add column if not exists one_link_biography text,
  add column if not exists one_link_avatar_url text,
  add column if not exists one_link_avatar_public_id text,
  add column if not exists one_link_wallpaper_url text,
  add column if not exists one_link_wallpaper_public_id text,
  add column if not exists one_link_wallpaper_text_mode text,
  add column if not exists one_link_settings jsonb,
  add column if not exists one_link_updated_at timestamptz;

do $constraints$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_wallet_tag_format_v1'
  ) then
    alter table public.profiles add constraint profiles_wallet_tag_format_v1
      check (
        wallet_tag is null or (
          wallet_tag = pg_catalog.lower(pg_catalog.btrim(wallet_tag))
          and pg_catalog.char_length(wallet_tag) between 3 and 30
          and wallet_tag ~ '^[a-z0-9_]+$'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_one_link_username_format_v1'
  ) then
    alter table public.profiles add constraint profiles_one_link_username_format_v1
      check (
        one_link_username is null or (
          one_link_username = pg_catalog.lower(pg_catalog.btrim(one_link_username))
          and pg_catalog.char_length(one_link_username) between 1 and 64
          and one_link_username ~ '^[a-z0-9_]+$'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_one_link_display_name_v1'
  ) then
    alter table public.profiles add constraint profiles_one_link_display_name_v1
      check (
        one_link_display_name is null or (
          pg_catalog.char_length(one_link_display_name) <= 80
          and one_link_display_name !~ '[\x00-\x1F\x7F]'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_one_link_biography_v1'
  ) then
    alter table public.profiles add constraint profiles_one_link_biography_v1
      check (
        one_link_biography is null or (
          pg_catalog.char_length(one_link_biography) <= 500
          and one_link_biography !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_one_link_avatar_url_v1'
  ) then
    alter table public.profiles add constraint profiles_one_link_avatar_url_v1
      check (
        one_link_avatar_url is null or (
          pg_catalog.char_length(one_link_avatar_url) <= 2048
          and one_link_avatar_url ~ '^https://'
          and one_link_avatar_url !~ '[\x00-\x1F\x7F]'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_one_link_wallpaper_url_v1'
  ) then
    alter table public.profiles add constraint profiles_one_link_wallpaper_url_v1
      check (
        one_link_wallpaper_url is null or (
          pg_catalog.char_length(one_link_wallpaper_url) <= 2048
          and one_link_wallpaper_url ~ '^https://'
          and one_link_wallpaper_url !~ '[\x00-\x1F\x7F]'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_one_link_avatar_public_id_v1'
  ) then
    alter table public.profiles add constraint profiles_one_link_avatar_public_id_v1
      check (
        one_link_avatar_public_id is null or (
          pg_catalog.char_length(one_link_avatar_public_id) <= 255
          and one_link_avatar_public_id ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$'
          and pg_catalog.strpos(one_link_avatar_public_id, '..') = 0
          and pg_catalog.strpos(one_link_avatar_public_id, '//') = 0
          and pg_catalog.right(one_link_avatar_public_id, 1) <> '/'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_one_link_wallpaper_public_id_v1'
  ) then
    alter table public.profiles add constraint profiles_one_link_wallpaper_public_id_v1
      check (
        one_link_wallpaper_public_id is null or (
          pg_catalog.char_length(one_link_wallpaper_public_id) <= 255
          and one_link_wallpaper_public_id ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$'
          and pg_catalog.strpos(one_link_wallpaper_public_id, '..') = 0
          and pg_catalog.strpos(one_link_wallpaper_public_id, '//') = 0
          and pg_catalog.right(one_link_wallpaper_public_id, 1) <> '/'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_one_link_wallpaper_text_mode_v1'
  ) then
    alter table public.profiles add constraint profiles_one_link_wallpaper_text_mode_v1
      check (
        one_link_wallpaper_text_mode is null
        or one_link_wallpaper_text_mode in ('light', 'dark')
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_one_link_settings_object_v1'
  ) then
    alter table public.profiles add constraint profiles_one_link_settings_object_v1
      check (
        one_link_settings is null
        or pg_catalog.jsonb_typeof(one_link_settings) = 'object'
      );
  end if;
end
$constraints$;

do $backfill$
declare
  profile_row record;
  parsed jsonb;
  link_bio text;
  link_settings jsonb;
  default_settings constant jsonb :=
    '{"schemaVersion":1,"theme":"dark-twilight","socials":[],"projects":[],"published":true,"seoTitle":"","seoDescription":"","messageEnabled":true}'::jsonb;
begin
  for profile_row in
    select
      id,
      username,
      full_name,
      bio,
      profile_pic_url,
      image_url,
      updated_at,
      wallet_tag,
      one_link_username,
      one_link_display_name,
      one_link_biography,
      one_link_avatar_url,
      one_link_settings,
      one_link_updated_at
    from public.profiles
    order by id
  loop
    link_bio := coalesce(profile_row.bio, '');
    link_settings := default_settings;
    parsed := null;

    begin
      if pg_catalog.left(pg_catalog.ltrim(link_bio), 1) = '{' then
        parsed := link_bio::jsonb;
      end if;
    exception when others then
      parsed := null;
    end;

    if pg_catalog.jsonb_typeof(parsed) = 'object' then
      if pg_catalog.jsonb_typeof(parsed -> 'bio') = 'string' then
        link_bio := parsed ->> 'bio';
      else
        link_bio := '';
      end if;
      if pg_catalog.jsonb_typeof(parsed -> 'onelink') = 'object' then
        link_settings := parsed -> 'onelink';
      end if;
    end if;

    link_bio := pg_catalog.substring(
      pg_catalog.regexp_replace(
        coalesce(link_bio, ''),
        '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]',
        '',
        'g'
      ),
      1,
      500
    );

    update public.profiles
    set
      wallet_tag = case
        when wallet_tag is null
          and pg_catalog.lower(pg_catalog.btrim(username)) ~ '^[a-z0-9_]{3,30}$'
          then pg_catalog.lower(pg_catalog.btrim(username))
        else wallet_tag
      end,
      one_link_username = case
        when one_link_username is null
          and pg_catalog.lower(pg_catalog.btrim(username)) ~ '^[a-z0-9_]{1,64}$'
          then pg_catalog.lower(pg_catalog.btrim(username))
        else one_link_username
      end,
      one_link_display_name = case
        when one_link_display_name is null then pg_catalog.substring(
          pg_catalog.regexp_replace(
            coalesce(full_name, ''),
            '[\x00-\x1F\x7F]',
            '',
            'g'
          ),
          1,
          80
        )
        else one_link_display_name
      end,
      one_link_biography = coalesce(one_link_biography, link_bio),
      one_link_avatar_url = case
        when one_link_avatar_url is null
          and pg_catalog.char_length(
            coalesce(profile_pic_url, image_url, '')
          ) <= 2048
          and coalesce(profile_pic_url, image_url, '') ~ '^https://'
          and coalesce(profile_pic_url, image_url, '') !~ '[\x00-\x1F\x7F]'
          then coalesce(profile_pic_url, image_url)
        else one_link_avatar_url
      end,
      one_link_settings = coalesce(one_link_settings, link_settings),
      one_link_updated_at = coalesce(
        one_link_updated_at,
        profile_row.updated_at,
        pg_catalog.now()
      )
    where id = profile_row.id;
  end loop;
end
$backfill$;

create unique index if not exists profiles_wallet_tag_lower_unique_v1
on public.profiles (pg_catalog.lower(wallet_tag))
where wallet_tag is not null;

create unique index if not exists profiles_one_link_username_lower_unique_v1
on public.profiles (pg_catalog.lower(one_link_username))
where one_link_username is not null;

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
    raise exception using errcode = '22023', message = 'TRANSFER_REQUEST_INVALID';
  end if;

  select clerk_id into v_recipient_user_id
  from public.profiles
  where pg_catalog.lower(wallet_tag) =
    pg_catalog.lower(pg_catalog.btrim(p_recipient_username));

  if not found then
    raise exception using errcode = 'P0002', message = 'RECIPIENT_NOT_FOUND';
  end if;
  if v_recipient_user_id = p_actor_user_id then
    raise exception using errcode = '22023', message = 'SELF_TRANSFER_NOT_ALLOWED';
  end if;

  v_fingerprint := pg_catalog.md5(pg_catalog.concat_ws(
    '|', p_actor_user_id, v_recipient_user_id, p_amount::text,
    coalesce(pg_catalog.btrim(p_note), '')
  ));

  insert into public.wallet_operation_idempotency_v2 (
    actor_user_id, operation_type, idempotency_key, request_fingerprint
  ) values (
    p_actor_user_id, 'p2p_transfer', p_idempotency_key, v_fingerprint
  )
  on conflict (actor_user_id, operation_type, idempotency_key) do nothing;

  if not found then
    select * into v_operation
    from public.wallet_operation_idempotency_v2
    where actor_user_id = p_actor_user_id
      and operation_type = 'p2p_transfer'
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

  perform 1 from public.profiles
  where clerk_id in (p_actor_user_id, v_recipient_user_id)
  order by clerk_id for update;

  select * into v_sender from public.profiles where clerk_id = p_actor_user_id;
  select * into v_recipient from public.profiles where clerk_id = v_recipient_user_id;
  if v_sender.clerk_id is null then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;

  v_sender_before := coalesce(v_sender.balance, 0);
  v_recipient_before := coalesce(v_recipient.balance, 0);
  if v_sender_before < p_amount then
    raise exception using errcode = '22003', message = 'INSUFFICIENT_FUNDS';
  end if;

  v_sender_after := v_sender_before - p_amount;
  v_recipient_after := v_recipient_before + p_amount;
  v_reference := pg_catalog.concat(
    'p2p_',
    pg_catalog.md5(pg_catalog.concat_ws('|', p_actor_user_id, p_idempotency_key))
  );

  update public.profiles
  set balance = case
        when clerk_id = p_actor_user_id then v_sender_after
        else v_recipient_after
      end,
      updated_at = pg_catalog.now()
  where clerk_id in (p_actor_user_id, v_recipient_user_id);

  insert into public.wallet_transactions (
    user_id, user_email, type, amount, fee, status, reference, metadata,
    balance_before, balance_after, idempotency_key, currency, updated_at
  ) values
    (
      p_actor_user_id, p_actor_email, 'p2p_send', p_amount, 0, 'success',
      v_reference,
      pg_catalog.jsonb_build_object(
        'recipient_user_id', v_recipient_user_id,
        'recipient_username', v_recipient.wallet_tag,
        'note', nullif(pg_catalog.btrim(p_note), '')
      ),
      v_sender_before, v_sender_after, p_idempotency_key, 'NGN', pg_catalog.now()
    ),
    (
      v_recipient_user_id, v_recipient.email, 'p2p_receive', p_amount, 0,
      'success', v_reference || '_recipient',
      pg_catalog.jsonb_build_object(
        'sender_user_id', p_actor_user_id,
        'note', nullif(pg_catalog.btrim(p_note), '')
      ),
      v_recipient_before, v_recipient_after, p_idempotency_key, 'NGN', pg_catalog.now()
    );

  perform public.insert_wallet_notification_v2(
    pg_catalog.concat('p2p:', v_reference, ':recipient'),
    v_recipient_user_id,
    'p2p_received',
    'wallet',
    pg_catalog.concat('You received NGN ', p_amount::text, ' from a Plugsy user.'),
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
      'username', v_recipient.wallet_tag,
      'full_name', v_recipient.full_name
    )
  );

  update public.wallet_operation_idempotency_v2
  set status = 'completed', reference = v_reference, result = v_result,
      completed_at = pg_catalog.now()
  where actor_user_id = p_actor_user_id
    and operation_type = 'p2p_transfer'
    and idempotency_key = p_idempotency_key;

  return v_result;
end
$function$;

revoke all on function public.transfer_wallet_p2p_v2(
  text, text, text, numeric, text, text
) from public, anon, authenticated;

grant execute on function public.transfer_wallet_p2p_v2(
  text, text, text, numeric, text, text
) to service_role;

do $financial_guard$
declare
  original profile_domain_separation_guard_v1%rowtype;
  current_profile_count bigint;
  current_balance_total numeric;
  current_transaction_count bigint;
begin
  select * into original from profile_domain_separation_guard_v1;
  select pg_catalog.count(*), coalesce(pg_catalog.sum(balance), 0)
    into current_profile_count, current_balance_total
    from public.profiles;
  select pg_catalog.count(*) into current_transaction_count
    from public.wallet_transactions;
  if current_profile_count <> original.profile_count
     or current_balance_total <> original.balance_total
     or current_transaction_count <> original.transaction_count then
    raise exception 'PROFILE_DOMAIN_SEPARATION_FINANCIAL_GUARD_FAILED';
  end if;
end
$financial_guard$;

commit;
