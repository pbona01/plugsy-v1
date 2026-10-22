-- A signed-in buyer gets one lasting review per product, even if they buy the
-- same listing more than once. Guest receipts remain scoped to their order.
begin;

alter table public.marketplace_product_reviews
  add column if not exists reviewer_key text;

-- Preserve the most recently updated review where historical repeat purchases
-- previously created more than one review for the same buyer and listing.
with ranked as (
  select id,
    row_number() over (
      partition by listing_id, buyer_id
      order by updated_at desc, created_at desc, id desc
    ) as position
  from public.marketplace_product_reviews
  where buyer_id is not null
)
delete from public.marketplace_product_reviews review
using ranked
where review.id = ranked.id and ranked.position > 1;

update public.marketplace_product_reviews
set reviewer_key = case
  when buyer_id is not null then 'account:' || buyer_id
  else 'guest:' || guest_order_id::text
end
where reviewer_key is null;

alter table public.marketplace_product_reviews
  alter column reviewer_key set not null;

create unique index if not exists marketplace_product_reviews_one_reviewer_per_listing_v1_idx
  on public.marketplace_product_reviews (listing_id, reviewer_key);

commit;
