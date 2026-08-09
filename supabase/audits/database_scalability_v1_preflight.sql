-- READ-ONLY DATABASE SCALABILITY V1 PREFLIGHT.
-- Do not execute the candidate rollout artifact automatically.

-- 1. Table size and row estimates for candidate tables.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.reltuples::bigint as estimated_rows,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
  pg_size_pretty(pg_relation_size(c.oid)) as table_size
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'messages', 'chat_members', 'calls', 'chats', 'orders',
    'subscriptions', 'status_views', 'vp_portfolios', 'profiles'
  )
order by pg_total_relation_size(c.oid) desc, c.relname;

-- 2. All existing indexes, validity flags, size, and usage statistics.
select
  s.schemaname,
  s.relname as table_name,
  s.indexrelname as index_name,
  ix.indisvalid,
  ix.indisready,
  ix.indisunique,
  ix.indisprimary,
  s.idx_scan,
  s.idx_tup_read,
  s.idx_tup_fetch,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size,
  pg_get_indexdef(s.indexrelid) as index_definition
from pg_stat_user_indexes s
join pg_index ix on ix.indexrelid = s.indexrelid
where s.schemaname = 'public'
order by s.relname, s.indexrelname;

-- 3. Structural signatures intentionally exclude index names. They include
-- table, access method, uniqueness, key definitions/order, included columns,
-- expressions, predicate, and validity flags. The next result identifies
-- equivalent definitions with different names.
with index_catalog as (
  select
    i.oid as index_oid,
    t.oid as table_oid,
    tn.nspname as schema_name,
    t.relname as table_name,
    i.relname as index_name,
    am.amname as access_method,
    ix.indisunique,
    ix.indisprimary,
    ix.indisvalid,
    ix.indisready,
    ix.indnkeyatts,
    ix.indnatts,
    coalesce((
      select string_agg(
        format(
          '%s %s',
          coalesce(quote_ident(a.attname), pg_get_indexdef(i.oid, p, true)),
          case when (ix.indoption[p] & 1) = 1 then 'DESC' else 'ASC' end ||
          ' NULLS ' || case when (ix.indoption[p] & 2) = 2 then 'FIRST' else 'LAST' end
        ),
        ',' order by p
      )
      from generate_subscripts(ix.indkey, 1) as positions(p)
      left join pg_attribute a
        on a.attrelid = t.oid and a.attnum = ix.indkey[p]
      where p <= ix.indnkeyatts
    ), '') as key_signature,
    coalesce((
      select string_agg(quote_ident(a.attname), ',' order by p)
      from generate_subscripts(ix.indkey, 1) as positions(p)
      join pg_attribute a
        on a.attrelid = t.oid and a.attnum = ix.indkey[p]
      where p > ix.indnkeyatts
    ), '') as included_columns,
    coalesce(pg_get_expr(ix.indexprs, t.oid), '') as expression_definition,
    coalesce(pg_get_expr(ix.indpred, t.oid), '') as predicate_definition,
    pg_size_pretty(pg_relation_size(i.oid)) as index_size,
    st.idx_scan
  from pg_index ix
  join pg_class i on i.oid = ix.indexrelid
  join pg_class t on t.oid = ix.indrelid
  join pg_namespace tn on tn.oid = t.relnamespace
  join pg_am am on am.oid = i.relam
  left join pg_stat_user_indexes st on st.indexrelid = i.oid
  where tn.nspname = 'public'
)
select
  schema_name,
  table_name,
  access_method,
  indisunique,
  indisprimary,
  key_signature,
  included_columns,
  expression_definition,
  predicate_definition,
  count(*) as equivalent_index_count,
  string_agg(index_name, ', ' order by index_name) as equivalent_index_names,
  bool_and(indisvalid) as all_valid,
  bool_and(indisready) as all_ready
from index_catalog
group by
  schema_name, table_name, access_method, indisunique, indisprimary,
  key_signature, included_columns, expression_definition, predicate_definition
having count(*) > 1
order by table_name, equivalent_index_names;

-- 4. Candidate-by-candidate name, structural-family, prefix/superset, validity,
-- uniqueness, size, and scan review. The structural family output is based on
-- catalog columns rather than reconstructed CREATE INDEX text, so names do
-- not hide equivalent definitions.
with candidate_specs(index_name, table_name, key_columns, access_method, is_unique, is_primary, included_columns, predicate_fragment, predicate_fragment_two) as (
  values
    ('idx_messages_chat_created_id', 'messages', 'chat_id ASC NULLS LAST,created_at DESC NULLS FIRST,id DESC NULLS FIRST', 'btree', false, false, '', '', ''),
    ('idx_chat_members_user_chat', 'chat_members', 'user_id ASC NULLS LAST,chat_id ASC NULLS LAST', 'btree', false, false, '', '', ''),
    ('idx_chat_members_chat_user', 'chat_members', 'chat_id ASC NULLS LAST,user_id ASC NULLS LAST', 'btree', false, false, '', '', ''),
    ('idx_calls_chat_status_started', 'calls', 'chat_id ASC NULLS LAST,status ASC NULLS LAST,started_at DESC NULLS FIRST', 'btree', false, false, '', '', ''),
    ('idx_chats_public_group_member_count', 'chats', 'member_count DESC NULLS FIRST', 'btree', false, false, '', 'chat_type', 'is_public'),
    ('idx_orders_delivery_created_at', 'orders', 'delivery_status ASC NULLS LAST,created_at DESC NULLS FIRST', 'btree', false, false, '', '', ''),
    ('idx_subscriptions_user_status', 'subscriptions', 'user_id ASC NULLS LAST,status ASC NULLS LAST', 'btree', false, false, '', '', ''),
    ('idx_status_views_viewer_status', 'status_views', 'viewer_id ASC NULLS LAST,status_id ASC NULLS LAST', 'btree', false, false, '', '', ''),
    ('idx_status_views_status_viewed_at', 'status_views', 'status_id ASC NULLS LAST,viewed_at DESC NULLS FIRST', 'btree', false, false, '', '', ''),
    ('idx_vp_portfolios_slug', 'vp_portfolios', 'slug ASC NULLS LAST', 'btree', false, false, '', '', '')
), index_catalog as (
  select
    i.oid as index_oid,
    t.oid as table_oid,
    t.relname as table_name,
    i.relname as index_name,
    am.amname as access_method,
    ix.indisunique,
    ix.indisprimary,
    ix.indisvalid,
    ix.indisready,
    ix.indnkeyatts,
    ix.indnatts,
    coalesce((
      select string_agg(
        format(
          '%s %s',
          coalesce(quote_ident(a.attname), pg_get_indexdef(i.oid, p, true)),
          case when (ix.indoption[p] & 1) = 1 then 'DESC' else 'ASC' end ||
          ' NULLS ' || case when (ix.indoption[p] & 2) = 2 then 'FIRST' else 'LAST' end
        ),
        ',' order by p
      )
      from generate_subscripts(ix.indkey, 1) as positions(p)
      left join pg_attribute a
        on a.attrelid = t.oid and a.attnum = ix.indkey[p]
      where p <= ix.indnkeyatts
    ), '') as key_signature,
    coalesce((
      select string_agg(quote_ident(a.attname), ',' order by p)
      from generate_subscripts(ix.indkey, 1) as positions(p)
      join pg_attribute a
        on a.attrelid = t.oid and a.attnum = ix.indkey[p]
      where p > ix.indnkeyatts
    ), '') as included_columns,
    coalesce(pg_get_expr(ix.indpred, t.oid), '') as predicate_definition,
    pg_size_pretty(pg_relation_size(i.oid)) as index_size,
    st.idx_scan
  from pg_index ix
  join pg_class i on i.oid = ix.indexrelid
  join pg_class t on t.oid = ix.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_am am on am.oid = i.relam
  left join pg_stat_user_indexes st on st.indexrelid = i.oid
  where n.nspname = 'public'
)
select
  c.index_name as candidate_name,
  c.table_name,
  exists (select 1 from index_catalog i where i.index_name = c.index_name and i.table_name = c.table_name) as proposed_name_exists,
  coalesce((
    select string_agg(i.index_name, ', ' order by i.index_name)
    from index_catalog i
    where i.table_name = c.table_name
      and i.index_name <> c.index_name
      and i.access_method = c.access_method
      and i.indisunique = c.is_unique
      and i.indisprimary = c.is_primary
      and i.key_signature = c.key_columns
      and i.included_columns = c.included_columns
      and (c.predicate_fragment = '' or lower(i.predicate_definition) like '%' || lower(c.predicate_fragment) || '%')
      and (c.predicate_fragment_two = '' or lower(i.predicate_definition) like '%' || lower(c.predicate_fragment_two) || '%')
  ), '') as structurally_equivalent_other_names,
  coalesce((
    select string_agg(i.index_name, ', ' order by i.index_name)
    from index_catalog i
    where i.table_name = c.table_name
      and i.key_signature like split_part(c.key_columns, ',', 1) || '%'
  ), '') as possible_prefix_or_superset_names,
  i.indisvalid,
  i.indisready,
  i.indisunique,
  i.indisprimary,
  i.index_size,
  i.idx_scan
from candidate_specs c
left join index_catalog i
  on i.table_name = c.table_name and i.index_name = c.index_name
order by c.table_name, c.index_name;

-- 5. Existing constraints, including primary and unique constraints that may
-- already provide an index and make a candidate redundant.
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

-- 6. Query-plan examples for manual review only. These are comments and must
-- not be executed here. Replace placeholders only in a controlled read-only
-- session. EXPLAIN ANALYZE is intentionally not used.
-- EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
-- SELECT id, chat_id, sender_id, content, created_at
-- FROM public.messages
-- WHERE chat_id = '<CHAT_ID>'
-- ORDER BY created_at DESC, id DESC
-- LIMIT 50;

-- EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
-- SELECT id, chat_id, sender_id, content, created_at
-- FROM public.messages
-- WHERE chat_id = '<CHAT_ID>'
--   AND (created_at, id) < ('<CREATED_AT>', '<MESSAGE_ID>')
-- ORDER BY created_at DESC, id DESC
-- LIMIT 50;

-- EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
-- SELECT chat_id
-- FROM public.chat_members
-- WHERE user_id = '<USER_ID>';

-- EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
-- SELECT id, chat_id, status, started_at
-- FROM public.calls
-- WHERE chat_id = '<CHAT_ID>' AND status = 'active'
-- ORDER BY started_at DESC
-- LIMIT 1;

-- EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
-- SELECT id, name, member_count
-- FROM public.chats
-- WHERE chat_type = 'group' AND is_public = true
-- ORDER BY member_count DESC
-- LIMIT 10;

-- EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
-- SELECT id, created_at, delivery_status
-- FROM public.orders
-- WHERE delivery_status = 'login_sent'
-- ORDER BY created_at DESC;

-- EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
-- SELECT id, slug, owner_id
-- FROM public.vp_portfolios
-- WHERE slug = '<PUBLIC_SLUG>'
-- LIMIT 1;
