-- Retire Plugsy's own CapCut Pro offering without deleting historical orders,
-- chats, subscription records, wallet entries, or customer support history.
begin;

update public.plans
set is_active = false
where wallet_product_type = 'capcut'
   or lower(coalesce(name, '')) ~ 'cap[[:space:]]*cut.*pro|capcut.*max';

commit;
