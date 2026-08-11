-- Prevent overlapping Vercel cron invocations from processing the same work.
-- The lease is intentionally short; jobs must remain bounded and idempotent.
create table if not exists public.scheduled_job_leases (
  job_name text primary key,
  locked_until timestamp with time zone not null,
  updated_at timestamp with time zone not null default now(),
  constraint scheduled_job_leases_job_name_check check (length(trim(job_name)) between 1 and 120)
);

alter table public.scheduled_job_leases enable row level security;
revoke all on public.scheduled_job_leases from public, anon, authenticated;
grant select, insert, update on public.scheduled_job_leases to service_role;

create or replace function public.claim_scheduled_job_lease(
  p_job_name text,
  p_lease_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job_name text := btrim(p_job_name);
begin
  if v_job_name = '' or length(v_job_name) > 120 or p_lease_seconds not between 30 and 3600 then
    raise exception 'invalid scheduled job lease input' using errcode = '22023';
  end if;

  insert into public.scheduled_job_leases (job_name, locked_until, updated_at)
  values (v_job_name, now() + make_interval(secs => p_lease_seconds), now())
  on conflict (job_name) do update
    set locked_until = excluded.locked_until,
        updated_at = excluded.updated_at
    where public.scheduled_job_leases.locked_until <= now();

  return found;
end;
$$;

revoke all on function public.claim_scheduled_job_lease(text, integer) from public, anon, authenticated;
grant execute on function public.claim_scheduled_job_lease(text, integer) to service_role;
