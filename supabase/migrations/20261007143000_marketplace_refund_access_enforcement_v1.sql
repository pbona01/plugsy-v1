begin;

-- Repair any historical refund where the entitlement was not revoked.
update public.marketplace_entitlements as entitlement
set access_status = 'revoked'
from public.marketplace_orders as marketplace_order
where entitlement.order_id = marketplace_order.id
  and marketplace_order.payment_status = 'refunded'
  and entitlement.access_status <> 'revoked';

-- Keep access and payment state inseparable for every current and future
-- refund path, including admin tools and operational recovery scripts.
create or replace function public.marketplace_revoke_refunded_access_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.payment_status = 'refunded'
     and old.payment_status is distinct from new.payment_status then
    update public.marketplace_entitlements
    set access_status = 'revoked'
    where order_id = new.id
      and access_status <> 'revoked';
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_revoke_refunded_access_v1
  on public.marketplace_orders;
create trigger marketplace_revoke_refunded_access_v1
after update of payment_status on public.marketplace_orders
for each row
execute function public.marketplace_revoke_refunded_access_v1();

revoke all on function public.marketplace_revoke_refunded_access_v1() from public, anon, authenticated;
grant execute on function public.marketplace_revoke_refunded_access_v1() to service_role;

commit;
