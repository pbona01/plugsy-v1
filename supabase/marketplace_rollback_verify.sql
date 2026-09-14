-- Run AFTER all FOUR marketplace migrations. Run the entire script, not fragments.
-- All fixtures and copied functions live in a NEW schema, not public.
-- ROLLBACK removes everything, including the schema. No production wallet is used.
begin;
create schema plugsy_marketplace_verify;
revoke all on schema plugsy_marketplace_verify from public,anon,authenticated;

create table plugsy_marketplace_verify.profiles(clerk_id text primary key,email text,role text,balance numeric not null default 0,updated_at timestamptz default now());
create table plugsy_marketplace_verify.wallet_transactions(user_id text,user_email text,type text,amount numeric,status text,reference text unique,metadata jsonb,balance_before numeric,balance_after numeric,idempotency_key text unique,updated_at timestamptz);
alter table plugsy_marketplace_verify.profiles enable row level security;
alter table plugsy_marketplace_verify.wallet_transactions enable row level security;

do $$
declare v_table text; v_fn record; v_definition text;
begin
  foreach v_table in array array['marketplace_seller_profiles','marketplace_listings','marketplace_orders','marketplace_entitlements','marketplace_disputes','marketplace_resale_requests','marketplace_audit_events','marketplace_assets'] loop
    execute format('create table plugsy_marketplace_verify.%I (like public.%I including defaults including constraints including indexes)',v_table,v_table);
    execute format('alter table plugsy_marketplace_verify.%I enable row level security',v_table);
  end loop;
  for v_fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('marketplace_create_wallet_order_v1','marketplace_release_due_orders_v1','marketplace_open_dispute_v1','marketplace_resolve_dispute_v1','marketplace_approve_seller_v1','marketplace_request_resale_v1','marketplace_decide_resale_v1') loop
    v_definition:=replace(pg_get_functiondef(v_fn.oid),'public.','plugsy_marketplace_verify.');
    v_definition:=replace(v_definition,'SET search_path TO ''public''','SET search_path TO ''plugsy_marketplace_verify''');
    execute v_definition;
  end loop;
end;
$$;

revoke all on all tables in schema plugsy_marketplace_verify from public,anon,authenticated;
revoke all on all functions in schema plugsy_marketplace_verify from public,anon,authenticated;

insert into plugsy_marketplace_verify.profiles(clerk_id,email,role,balance) values
  ('user_testBuyer','buyer@example.invalid','user',10000),('user_testSeller','seller@example.invalid','user',0),
  ('user_testReseller','reseller@example.invalid','user',0),('user_testAdmin','admin@example.invalid','admin',0);
insert into plugsy_marketplace_verify.marketplace_seller_profiles(user_id,verification_status,public_selling_enabled,public_plan_expires_at)
  values('user_testSeller','verified',true,now()+interval '30 days');
insert into plugsy_marketplace_verify.marketplace_listings(id,seller_id,title,slug,category,price,delivery_url,status,visibility,resale_policy,resale_commission_percent)
  values('11111111-1111-4111-8111-111111111111','user_testSeller','Test templates','test-templates','templates',1000,'https://example.invalid/original','published','public','fixed_percent',20);

do $$
declare v_purchase jsonb; v_order uuid; v_request jsonb; v_dispute jsonb; v_count integer; v_balance numeric;
begin
  v_request:=plugsy_marketplace_verify.marketplace_request_resale_v1('user_testReseller','11111111-1111-4111-8111-111111111111',20,null);
  if v_request->>'status'<>'approved' then raise exception 'FAIL fixed resale grant'; end if;
  v_purchase:=plugsy_marketplace_verify.marketplace_create_wallet_order_v1('user_testBuyer','buyer@example.invalid','11111111-1111-4111-8111-111111111111','test-order-key-000001',null,'user_testReseller');
  v_order:=(v_purchase->>'order_id')::uuid;
  perform plugsy_marketplace_verify.marketplace_create_wallet_order_v1('user_testBuyer','buyer@example.invalid','11111111-1111-4111-8111-111111111111','test-order-key-000001',null,'user_testReseller');
  select balance into v_balance from plugsy_marketplace_verify.profiles where clerk_id='user_testBuyer';
  if v_balance<>9000 then raise exception 'FAIL retry double debit'; end if;
  if (select count(*) from plugsy_marketplace_verify.marketplace_entitlements where order_id=v_order)<>1 then raise exception 'FAIL entitlement uniqueness'; end if;
  update plugsy_marketplace_verify.marketplace_listings set delivery_url='https://example.invalid/changed'
    where id='11111111-1111-4111-8111-111111111111' and seller_id='user_testSeller';
  if (select listing_snapshot->>'delivery_url' from plugsy_marketplace_verify.marketplace_orders where id=v_order)<>'https://example.invalid/original' then raise exception 'FAIL delivery snapshot'; end if;
  if plugsy_marketplace_verify.marketplace_release_due_orders_v1(100)<>0 then raise exception 'FAIL early release'; end if;
  v_dispute:=plugsy_marketplace_verify.marketplace_open_dispute_v1('user_testBuyer',v_order,'not_as_described','Product was materially different');
  update plugsy_marketplace_verify.marketplace_orders set hold_expires_at=now()-interval '1 second' where id=v_order;
  if plugsy_marketplace_verify.marketplace_release_due_orders_v1(100)<>0 then raise exception 'FAIL disputed release'; end if;
  perform plugsy_marketplace_verify.marketplace_resolve_dispute_v1('user_testAdmin',(v_dispute->>'dispute_id')::uuid,'buyer','Reviewed evidence and upheld the buyer complaint');
  perform plugsy_marketplace_verify.marketplace_resolve_dispute_v1('user_testAdmin',(v_dispute->>'dispute_id')::uuid,'buyer','Repeated request must not refund twice');
  if (select balance from plugsy_marketplace_verify.profiles where clerk_id='user_testBuyer')<>10000 then raise exception 'FAIL refund exactly once'; end if;
  if (select access_status from plugsy_marketplace_verify.marketplace_entitlements where order_id=v_order)<>'revoked' then raise exception 'FAIL revoked access'; end if;
  v_purchase:=plugsy_marketplace_verify.marketplace_create_wallet_order_v1('user_testBuyer','buyer@example.invalid','11111111-1111-4111-8111-111111111111','test-order-key-000002',null,'user_testReseller');
  v_order:=(v_purchase->>'order_id')::uuid;
  update plugsy_marketplace_verify.marketplace_orders set hold_expires_at=now()-interval '1 second' where id=v_order;
  v_count:=plugsy_marketplace_verify.marketplace_release_due_orders_v1(100);
  if v_count<>1 then raise exception 'FAIL due release'; end if;
  if plugsy_marketplace_verify.marketplace_release_due_orders_v1(100)<>0 then raise exception 'FAIL repeated release'; end if;
  if (select balance from plugsy_marketplace_verify.profiles where clerk_id='user_testSeller')<>800 then raise exception 'FAIL seller split'; end if;
  if (select balance from plugsy_marketplace_verify.profiles where clerk_id='user_testReseller')<>200 then raise exception 'FAIL reseller split'; end if;
  begin
    perform plugsy_marketplace_verify.marketplace_resolve_dispute_v1('user_testBuyer',(v_dispute->>'dispute_id')::uuid,'buyer','Unauthorized request should fail');
    raise exception 'FAIL unauthorized resolution accepted';
  exception when others then if SQLERRM<>'ADMIN_REQUIRED' then raise; end if; end;
  begin
    perform plugsy_marketplace_verify.marketplace_create_wallet_order_v1('user_testBuyer','buyer@example.invalid','11111111-1111-4111-8111-111111111111','test-order-key-000003',null,'user_testBuyer');
    raise exception 'FAIL self referral accepted';
  exception when others then if SQLERRM<>'SELF_REFERRAL_NOT_ALLOWED' then raise; end if; end;
  raise notice 'PASS: isolated purchase, retry, snapshot, hold, refund, access, commission and admin checks';
end;
$$;
rollback;
select 'Marketplace isolated checks passed. All test changes are rolled back.' as result,
  to_regnamespace('plugsy_marketplace_verify') is null as test_schema_removed;
