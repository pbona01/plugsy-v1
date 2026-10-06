-- Reconcile denormalized seller trust counters from authoritative order outcomes.
-- Successful orders count only after the buyer-protection hold has been released.
begin;

update public.marketplace_seller_profiles as seller
set completed_orders_count = coalesce((
      select count(*)::integer
      from public.marketplace_orders as orders
      where orders.seller_id = seller.user_id
        and orders.payment_status = 'paid'
        and orders.funds_status = 'released'
    ), 0) + coalesce((
      select count(*)::integer
      from public.marketplace_guest_orders as guest_orders
      where guest_orders.seller_id = seller.user_id
        and guest_orders.payment_status = 'paid'
        and guest_orders.funds_status = 'released'
    ), 0),
    upheld_disputes_count = coalesce((
      select count(*)::integer
      from public.marketplace_disputes as disputes
      join public.marketplace_orders as orders on orders.id = disputes.order_id
      where orders.seller_id = seller.user_id
        and disputes.status = 'resolved_buyer'
    ), 0),
    updated_at = now();

commit;
