-- READ-ONLY database scalability preflight.
-- Review manually against the live database before applying the migration.

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.reltuples::bigint as estimated_rows,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'messages', 'chat_members', 'calls', 'chats', 'orders',
    'subscriptions', 'statuses', 'status_views', 'vp_portfolios', 'profiles'
  )
order by pg_total_relation_size(c.oid) desc, c.relname;

select
  s.schemaname,
  s.relname as table_name,
  s.indexrelname as index_name,
  s.idx_scan,
  s.idx_tup_read,
  s.idx_tup_fetch,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size,
  pg_get_indexdef(s.indexrelid) as index_definition
from pg_stat_user_indexes s
where s.schemaname = 'public'
  and s.relname in (
    'messages', 'chat_members', 'calls', 'chats', 'orders',
    'subscriptions', 'statuses', 'status_views', 'vp_portfolios', 'profiles'
  )
order by s.relname, s.indexrelname;

select
  n.nspname as schema_name,
  c.relname as table_name,
  i.relname as index_name,
  pg_get_indexdef(i.oid) as index_definition,
  con.conname as constraint_name,
  con.contype as constraint_type
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_index ix on ix.indrelid = c.oid
join pg_class i on i.oid = ix.indexrelid
left join pg_constraint con on con.conindid = i.oid
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname, i.relname;

select
  n.nspname as schema_name,
  c.relname as table_name,
  pg_get_indexdef(ix.indexrelid) as index_definition,
  count(*) over (partition by c.oid, pg_get_indexdef(ix.indexrelid)) as equivalent_definition_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_index ix on ix.indrelid = c.oid
where n.nspname = 'public'
order by equivalent_definition_count desc, c.relname;

select
  n.nspname as schema_name,
  c.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_get_constraintdef(con.oid) as constraint_definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by c.relname, con.conname;
