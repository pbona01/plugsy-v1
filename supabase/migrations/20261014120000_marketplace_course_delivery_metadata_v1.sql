-- Editable lesson metadata for seller-managed courses and digital products.
begin;

alter table public.marketplace_listing_deliveries
  add column if not exists description text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'marketplace_listing_deliveries_description_length_v1'
  ) then
    alter table public.marketplace_listing_deliveries
      add constraint marketplace_listing_deliveries_description_length_v1
      check (char_length(description) <= 2000);
  end if;
end $$;

commit;
