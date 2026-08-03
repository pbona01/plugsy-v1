-- Read-only audit for the public medal sales aggregate. Do not run against
-- production from an unapproved session.
with medal_plans as (
  select id
  from public.plans
  where wallet_product_type = 'medal'
     or category in ('medal_8k', 'medal_15k', 'medal_20k')
), candidates as (
  select o.id, o.user_id, o.product_name, o.product_type, o.plan_id, o.status
  from public.orders o
), classified as (
  select c.*,
    (c.status in ('paid', 'completed')) as status_qualified,
    (c.product_type = 'medal') as product_type_match,
    (c.plan_id in (select id from medal_plans)) as plan_match,
    (lower(coalesce(c.product_name, '')) like '%medal%') as legacy_name_match
  from candidates c
), qualifying as (
  select distinct id, user_id
  from classified
  where status_qualified
    and (product_type_match or plan_match or legacy_name_match)
), current_product_type as (
  select count(distinct id) as total from classified where status_qualified and product_type_match
), legacy_names as (
  select count(distinct id) as total from classified where status_qualified and legacy_name_match
), linked_plans as (
  select count(distinct id) as total from classified where status_qualified and plan_match
), multi_users as (
  select count(*) as total from (select user_id from qualifying group by user_id having count(*) > 1) grouped
), excluded as (
  select count(distinct id) as total from classified
  where status not in ('paid', 'completed')
    and (product_type_match or plan_match or legacy_name_match)
), summary as (
  select count(*)::integer as authoritative_total_sold,
    (select total from current_product_type)::integer as current_product_type_medals,
    (select total from legacy_names)::integer as legacy_name_medals,
    (select total from linked_plans)::integer as medal_plan_linked_orders,
    (select count(distinct user_id) from qualifying)::integer as qualifying_unique_users,
    (select total from multi_users)::integer as users_with_multiple_qualifying_orders,
    (select total from excluded)::integer as excluded_pending_or_failed_candidates
  from qualifying
)
select *, 160 as capacity,
  greatest(0, 160 - authoritative_total_sold) as remaining,
  authoritative_total_sold >= 160 as sold_out
from summary;

with grouped as (
  select lower(trim(coalesce(product_name, ''))) as normalized_product_name,
    product_type, status, count(*)::integer as count
  from public.orders
  group by lower(trim(coalesce(product_name, ''))), product_type, status
)
select normalized_product_name, product_type, status, count
from grouped
order by count desc, normalized_product_name
limit 100;
