begin;

alter table public.profiles
  add column if not exists saved_purchase_code text,
  add column if not exists saved_purchase_code_updated_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_saved_purchase_code_format_v1;

alter table public.profiles
  add constraint profiles_saved_purchase_code_format_v1
  check (
    saved_purchase_code is null
    or saved_purchase_code ~ '^[A-Z0-9_-]{3,64}$'
  );

comment on column public.profiles.saved_purchase_code is
  'User-selected default referral code applied to eligible future Plugsy purchases. Resolved and validated server-side at purchase time.';

commit;
