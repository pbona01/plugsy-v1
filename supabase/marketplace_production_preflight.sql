-- Read-only checks. Run before installing the marketplace migrations.
select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns
where table_schema='public' and table_name in('profiles','wallet_transactions')
  and column_name in('clerk_id','email','role','balance','updated_at','user_id','user_email','type','amount','status','reference','metadata','balance_before','balance_after','idempotency_key') order by table_name,ordinal_position;
select 'duplicate_clerk_ids' as check_name,count(*) as duplicate_groups from(select clerk_id from public.profiles where clerk_id is not null group by clerk_id having count(*)>1) duplicates;
select conrelid::regclass as table_name,conname,pg_get_constraintdef(oid) as definition from pg_constraint
where conrelid in('public.profiles'::regclass,'public.wallet_transactions'::regclass) order by table_name,conname;
select table_name,column_name as required_column_without_default from information_schema.columns
where table_schema='public' and table_name='wallet_transactions' and is_nullable='NO' and column_default is null
  and column_name not in('user_id','user_email','type','amount','status','reference','metadata','balance_before','balance_after','idempotency_key','updated_at');
-- Expected: no duplicate IDs, no unsupported required wallet columns.
-- Check wallet constraints allow purchase, refund, commission, marketplace_sale
-- and status success. Do NOT drop existing wallet protections to make this pass.
