begin;

create table if not exists public.wallet_pin_security_v1 (
  user_id text primary key,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.wallet_pin_security_v1 enable row level security;
revoke all on table public.wallet_pin_security_v1 from anon, authenticated;

create or replace function public.wallet_pin_guard_v1(p_actor_user_id text, p_result text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.wallet_pin_security_v1%rowtype;
  v_now timestamptz := clock_timestamp();
  v_attempts integer;
begin
  if coalesce(p_actor_user_id, '') = ''
     or p_result not in ('check', 'success', 'failure') then
    raise exception 'invalid pin guard request';
  end if;

  insert into public.wallet_pin_security_v1(user_id)
  values (p_actor_user_id)
  on conflict (user_id) do nothing;

  select * into v_row
  from public.wallet_pin_security_v1
  where user_id = p_actor_user_id
  for update;

  -- A correct PIN is already verified by the server before this call.
  -- Let it clear a stale lock so legitimate users are not trapped for 15 minutes.
  if p_result = 'success' then
    update public.wallet_pin_security_v1
    set failed_attempts = 0,
        window_started_at = v_now,
        locked_until = null,
        updated_at = v_now
    where user_id = p_actor_user_id;
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  if v_row.locked_until is not null and v_row.locked_until > v_now then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_row.locked_until - v_now)))::integer)
    );
  end if;

  if p_result = 'check' then
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  v_attempts := case
    when v_row.window_started_at < v_now - interval '15 minutes' then 1
    else v_row.failed_attempts + 1
  end;

  update public.wallet_pin_security_v1
  set failed_attempts = v_attempts,
      window_started_at = case
        when v_row.window_started_at < v_now - interval '15 minutes' then v_now
        else v_row.window_started_at
      end,
      locked_until = case
        when v_attempts >= 5 then v_now + interval '15 minutes'
        else null
      end,
      updated_at = v_now
  where user_id = p_actor_user_id;

  return jsonb_build_object(
    'allowed', v_attempts < 5,
    'retry_after_seconds', case when v_attempts >= 5 then 900 else 0 end
  );
end;
$$;

revoke all on function public.wallet_pin_guard_v1(text, text)
from public, anon, authenticated;
grant execute on function public.wallet_pin_guard_v1(text, text)
to service_role;

commit;
