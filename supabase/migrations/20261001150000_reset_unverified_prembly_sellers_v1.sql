-- No seller had completed a genuine Prembly verification when the hosted
-- widget was first enabled. Clear those stale/manual states without touching
-- Premium access, listings, sales, balances, or any other seller data.

begin;

update public.marketplace_seller_profiles
set verification_status = 'unverified',
    verification_provider = null,
    verification_reference = null,
    updated_at = now()
where verification_status <> 'unverified'
   or verification_provider is not null
   or verification_reference is not null;

commit;
