-- Public portfolio products are opt-in. No existing portfolio exposes a
-- product link until its owner deliberately adds it in the editor.
begin;

alter table public.vp_portfolios
  add column if not exists public_products jsonb not null default '[]'::jsonb;

alter table public.vp_portfolios
  drop constraint if exists vp_portfolios_public_products_array;
alter table public.vp_portfolios
  add constraint vp_portfolios_public_products_array
  check (jsonb_typeof(public_products) = 'array');

commit;
