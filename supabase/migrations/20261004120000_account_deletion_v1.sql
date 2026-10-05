begin;

create table if not exists public.account_deletion_requests_v1 (
  user_id text primary key,
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed', 'manual_review')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_code text,
  retention_notice text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_deletion_requests_v1 enable row level security;
revoke all on public.account_deletion_requests_v1 from anon, authenticated;
grant all on public.account_deletion_requests_v1 to service_role;

create or replace function public.account_deletion_requests_touch_v1()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists account_deletion_requests_touch_v1 on public.account_deletion_requests_v1;
create trigger account_deletion_requests_touch_v1
before update on public.account_deletion_requests_v1
for each row execute function public.account_deletion_requests_touch_v1();

commit;
