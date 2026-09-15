-- Records a user's acknowledgement of the Marketplace rules. This is deliberately
-- service-role only: the API, not a browser client, decides whether it is accepted.
create table if not exists public.marketplace_user_rule_acceptances (
  user_id text primary key,
  rules_version text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_user_rule_acceptances enable row level security;

revoke all on table public.marketplace_user_rule_acceptances from anon, authenticated;

create index if not exists marketplace_user_rule_acceptances_accepted_at_idx
  on public.marketplace_user_rule_acceptances (accepted_at desc);
