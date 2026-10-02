-- Durable Prembly verification attempts and consent receipts.
-- Raw BVN/NIN values, selfies, and biometric payloads must never be stored here.

begin;

create table if not exists public.marketplace_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    check (reference ~* '^MP-PREMBLY-[0-9a-f-]{36}$'),
  user_id text not null,
  provider text not null default 'prembly_widget'
    check (provider = 'prembly_widget'),
  provider_session_id text,
  status text not null default 'pending'
    check (status in ('pending','verified','rejected','cancelled','expired')),
  consent_version text not null,
  adult_confirmed boolean not null,
  consented_at timestamptz not null,
  last_provider_check_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_verification_attempts_user_created_idx
  on public.marketplace_verification_attempts(user_id, created_at desc);
create index if not exists marketplace_verification_attempts_pending_idx
  on public.marketplace_verification_attempts(status, updated_at)
  where status = 'pending';
create unique index if not exists marketplace_verification_attempts_session_uidx
  on public.marketplace_verification_attempts(provider_session_id)
  where provider_session_id is not null;

alter table public.marketplace_verification_attempts enable row level security;
revoke all on public.marketplace_verification_attempts from anon, authenticated;

create table if not exists public.marketplace_verification_webhooks (
  provider text not null check (provider = 'prembly'),
  token_hash text not null check (length(token_hash) = 64),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text,
  primary key (provider, token_hash)
);

alter table public.marketplace_verification_webhooks enable row level security;
revoke all on public.marketplace_verification_webhooks from anon, authenticated;

commit;
