begin;

create table if not exists public.wallet_pin_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(clerk_id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists wallet_pin_reset_tokens_user_idx
on public.wallet_pin_reset_tokens(user_id, created_at desc);

alter table public.wallet_pin_reset_tokens enable row level security;
revoke all on public.wallet_pin_reset_tokens from public, anon, authenticated;
grant all on public.wallet_pin_reset_tokens to service_role;

commit;
