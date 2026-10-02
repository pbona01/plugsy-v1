begin;

-- Seed each existing buyer's default from their latest successful referral.
-- A preference already selected after the feature launched always wins.
with purchase_history as (
  select
    o.user_id::text as buyer_user_id,
    upper(btrim(o.purchase_code_used)) as purchase_code,
    o.created_at as used_at,
    2 as source_priority
  from public.orders o
  where o.purchase_code_used is not null
    and btrim(o.purchase_code_used) <> ''
    and o.purchase_code_owner_id is not null

  union all

  select
    pp.user_id::text as buyer_user_id,
    upper(btrim(pp.purchase_code_used)) as purchase_code,
    pp.created_at as used_at,
    1 as source_priority
  from public.portfolio_purchases pp
  where pp.purchase_code_used is not null
    and btrim(pp.purchase_code_used) <> ''
    and pp.purchase_code_owner_id is not null
), valid_history as (
  select
    history.*,
    row_number() over (
      partition by history.buyer_user_id
      order by history.used_at desc nulls last,
        history.source_priority desc,
        history.purchase_code desc
    ) as recency_rank
  from purchase_history history
  join public.profiles owner
    on upper(btrim(owner.purchase_code)) = history.purchase_code
   and owner.clerk_id <> history.buyer_user_id
  where history.purchase_code ~ '^[A-Z0-9_-]{3,64}$'
)
update public.profiles buyer
set
  saved_purchase_code = latest.purchase_code,
  saved_purchase_code_updated_at = coalesce(latest.used_at, now())
from valid_history latest
where latest.recency_rank = 1
  and buyer.clerk_id = latest.buyer_user_id
  and buyer.saved_purchase_code is null;

commit;
