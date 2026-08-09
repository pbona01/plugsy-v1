-- READ-ONLY DATABASE SCALABILITY V1 PREFLIGHT.
-- Do not execute the candidate rollout artifact automatically.

-- 1. Table size and row estimates, including statuses retained for deferred
-- live-plan testing.
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
    'subscriptions', 'statuses', 'status_views', 'vp_portfolios', 'profiles'
  )
order by pg_total_relation_size(c.oid) desc, c.relname;

-- 2. All existing indexes, validity flags, size, and usage statistics.
select
  s.schemaname,
  s.relname as table_name,
  s.indexrelname as index_name,
  ix.indisvalid,
  ix.indisready,
  ix.indislive,
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

-- 3. One catalog projection is reused by the duplicate and coverage reports.
-- The catalog-vector fields are the exact structural signature. Index names
-- are deliberately absent from that signature.
with index_catalog as (
  select
    i.oid as index_oid,
    t.oid as table_oid,
    tn.nspname as schema_name,
    t.relname as table_name,
    i.relname as index_name,
    am.amname as access_method,
    ix.indnkeyatts,
    ix.indnatts,
    ix.indkey::text as indkey_signature,
    ix.indcollation::text as indcollation_signature,
    ix.indclass::text as indclass_signature,
    ix.indoption::text as indoption_signature,
    ix.indisunique,
    ix.indisprimary,
    ix.indisvalid,
    ix.indisready,
    ix.indislive,
    coalesce((
      select string_agg(
        coalesce(quote_ident(a.attname), pg_get_indexdef(i.oid, pos, true)),
        ',' order by pos
      )
      from generate_series(1, ix.indnatts) as positions(pos)
      left join pg_attribute a
        on a.attrelid = t.oid and a.attnum = ix.indkey[pos - 1]
      where pos <= ix.indnkeyatts
    ), '') as key_columns,
    coalesce((
      select string_agg(
        case when (ix.indoption[pos - 1] & 1) = 1 then 'DESC' else 'ASC' end,
        ',' order by pos
      )
      from generate_series(1, ix.indnkeyatts) as positions(pos)
    ), '') as key_directions,
    coalesce((
      select string_agg(
        quote_ident(a.attname),
        ',' order by pos
      )
      from generate_series(ix.indnkeyatts + 1, ix.indnatts) as positions(pos)
      join pg_attribute a
        on a.attrelid = t.oid and a.attnum = ix.indkey[pos - 1]
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
), structural_duplicates as (
  select
    table_oid,
    schema_name,
    table_name,
    access_method,
    indnkeyatts,
    indnatts,
    indkey_signature,
    indcollation_signature,
    indclass_signature,
    indoption_signature,
    expression_definition,
    predicate_definition,
    indisunique,
    indisprimary,
    count(*) as equivalent_index_count,
    string_agg(index_name, ', ' order by index_name) as exact_equivalent_indexes,
    bool_and(indisvalid) as all_valid,
    bool_and(indisready) as all_ready
  from index_catalog
  group by
    table_oid, schema_name, table_name, access_method, indnkeyatts, indnatts,
    indkey_signature, indcollation_signature, indclass_signature,
    indoption_signature, expression_definition, predicate_definition,
    indisunique, indisprimary
  having count(*) > 1
)
-- 4. Exact structural duplicates: same catalog vectors and semantics, with
-- index names excluded from the grouping key.
select *
from structural_duplicates
order by table_name, exact_equivalent_indexes;

-- 5. Candidate-by-candidate review. exact_equivalent_indexes means the same
-- candidate semantics. covering_same_key_indexes intentionally includes
-- UNIQUE/PRIMARY indexes because they may already provide the access path.
-- Prefix/superset lists are review signals, not planner guarantees.
with candidate_specs(index_name, table_name, key_columns, key_directions, included_columns, access_method, is_unique, is_primary, predicate_fragment_one, predicate_fragment_two) as (
  values
    ('idx_messages_chat_created_id', 'messages', 'chat_id,created_at,id', 'ASC,DESC,DESC', '', 'btree', false, false, '', ''),
    ('idx_chat_members_user_chat', 'chat_members', 'user_id,chat_id', 'ASC,ASC', '', 'btree', false, false, '', ''),
    ('idx_chat_members_chat_user', 'chat_members', 'chat_id,user_id', 'ASC,ASC', '', 'btree', false, false, '', ''),
    ('idx_calls_chat_status_started', 'calls', 'chat_id,status,started_at', 'ASC,ASC,DESC', '', 'btree', false, false, '', ''),
    ('idx_chats_public_group_member_count', 'chats', 'member_count', 'DESC', '', 'btree', false, false, 'chat_type', 'is_public'),
    ('idx_orders_delivery_created_at', 'orders', 'delivery_status,created_at', 'ASC,DESC', '', 'btree', false, false, '', ''),
    ('idx_subscriptions_user_status', 'subscriptions', 'user_id,status', 'ASC,ASC', '', 'btree', false, false, '', ''),
    ('idx_status_views_viewer_status', 'status_views', 'viewer_id,status_id', 'ASC,ASC', '', 'btree', false, false, '', ''),
    ('idx_status_views_status_viewed_at', 'status_views', 'status_id,viewed_at', 'ASC,DESC', '', 'btree', false, false, '', ''),
    ('idx_vp_portfolios_slug', 'vp_portfolios', 'slug', 'ASC', '', 'btree', false, false, '', '')
), index_catalog as (
  select
    i.oid as index_oid,
    t.relname as table_name,
    i.relname as index_name,
    am.amname as access_method,
    ix.indnkeyatts,
    ix.indnatts,
    ix.indisunique,
    ix.indisprimary,
    ix.indisvalid,
    ix.indisready,
    ix.indislive,
    coalesce((
      select string_agg(
        coalesce(quote_ident(a.attname), pg_get_indexdef(i.oid, pos, true)),
        ',' order by pos
      )
      from generate_series(1, ix.indnatts) as positions(pos)
      left join pg_attribute a
        on a.attrelid = t.oid and a.attnum = ix.indkey[pos - 1]
      where pos <= ix.indnkeyatts
    ), '') as key_columns,
    coalesce((
      select string_agg(
        case when (ix.indoption[pos - 1] & 1) = 1 then 'DESC' else 'ASC' end,
        ',' order by pos
      )
      from generate_series(1, ix.indnkeyatts) as positions(pos)
    ), '') as key_directions,
    coalesce((
      select string_agg(quote_ident(a.attname), ',' order by pos)
      from generate_series(ix.indnkeyatts + 1, ix.indnatts) as positions(pos)
      join pg_attribute a
        on a.attrelid = t.oid and a.attnum = ix.indkey[pos - 1]
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
), candidate_matches as (
  select
    c.index_name as candidate_name,
    c.table_name,
    c.key_columns as candidate_key_columns,
    c.key_directions as candidate_key_directions,
    i.index_name,
    i.access_method,
    i.indisunique,
    i.indisprimary,
    i.indisvalid,
    i.indisready,
    i.indislive,
    i.key_columns,
    i.key_directions,
    i.included_columns,
    i.predicate_definition,
    i.index_size,
    i.idx_scan,
    (
      i.key_columns = c.key_columns
      and i.key_directions = c.key_directions
      and i.included_columns = c.included_columns
      and i.access_method = c.access_method
      and i.indisunique = c.is_unique
      and i.indisprimary = c.is_primary
      and (
        (c.predicate_fragment_one = '' and i.predicate_definition = '')
        or (
          lower(i.predicate_definition) like '%' || lower(c.predicate_fragment_one) || '%'
          and lower(i.predicate_definition) like '%' || lower(c.predicate_fragment_two) || '%'
        )
      )
    ) as is_exact_candidate_match,
    (
      i.key_columns = c.key_columns
      and i.key_directions = c.key_directions
      and i.included_columns = c.included_columns
      and (
        (c.predicate_fragment_one = '' and i.predicate_definition = '')
        or (
          lower(i.predicate_definition) like '%' || lower(c.predicate_fragment_one) || '%'
          and lower(i.predicate_definition) like '%' || lower(c.predicate_fragment_two) || '%'
        )
      )
    ) as is_same_key_coverage,
    position(c.key_columns || ',' in i.key_columns || ',') = 1 as starts_with_candidate_keys,
    position(i.key_columns || ',' in c.key_columns || ',') = 1 as candidate_starts_with_existing_keys
  from candidate_specs c
  left join index_catalog i on i.table_name = c.table_name
)
select
  cm.candidate_name,
  cm.table_name,
  exists (select 1 from candidate_matches n where n.candidate_name = cm.candidate_name and n.index_name = cm.candidate_name) as proposed_name_exists,
  coalesce(jsonb_agg(jsonb_build_object(
    'index_name', index_name, 'key_columns', key_columns, 'key_directions', key_directions,
    'predicate', predicate_definition, 'unique', indisunique, 'primary', indisprimary,
    'valid', indisvalid, 'ready', indisready, 'live', indislive,
    'size', index_size, 'idx_scan', idx_scan
  ) order by index_name) filter (where is_exact_candidate_match), '[]'::jsonb) as exact_equivalent_indexes,
  coalesce(jsonb_agg(jsonb_build_object(
    'index_name', index_name, 'key_columns', key_columns, 'key_directions', key_directions,
    'predicate', predicate_definition, 'unique', indisunique, 'primary', indisprimary,
    'valid', indisvalid, 'ready', indisready, 'live', indislive,
    'size', index_size, 'idx_scan', idx_scan
  ) order by index_name) filter (where is_same_key_coverage), '[]'::jsonb) as covering_same_key_indexes,
  coalesce(jsonb_agg(jsonb_build_object(
    'index_name', index_name, 'key_columns', key_columns, 'key_directions', key_directions,
    'predicate', predicate_definition, 'unique', indisunique, 'primary', indisprimary,
    'valid', indisvalid, 'ready', indisready, 'live', indislive,
    'size', index_size, 'idx_scan', idx_scan
  ) order by index_name) filter (where starts_with_candidate_keys), '[]'::jsonb) as candidate_key_prefix_or_superset_indexes,
  coalesce(jsonb_agg(jsonb_build_object(
    'index_name', index_name, 'key_columns', key_columns, 'key_directions', key_directions,
    'predicate', predicate_definition, 'unique', indisunique, 'primary', indisprimary,
    'valid', indisvalid, 'ready', indisready, 'live', indislive,
    'size', index_size, 'idx_scan', idx_scan
  ) order by index_name) filter (where candidate_starts_with_existing_keys), '[]'::jsonb) as existing_key_prefix_indexes
from candidate_matches cm
group by cm.candidate_name, cm.table_name
order by cm.table_name, cm.candidate_name;

-- 6. Existing constraints, including primary and unique constraints that may
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

-- 7. Query-plan examples for manual review only. These are comments and must
-- not be executed here. Replace placeholders in a controlled read-only
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
--   AND (
--     created_at < '<CREATED_AT>'
--     OR (
--       created_at = '<CREATED_AT>'
--       AND id < '<MESSAGE_ID>'
--     )
--   )
-- ORDER BY created_at DESC, id DESC
-- LIMIT 50;

-- EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
-- SELECT id, chat_id, sender_id, content, created_at
-- FROM public.messages
-- WHERE chat_id = '<CHAT_ID>'
--   AND (
--     created_at > '<CREATED_AT>'
--     OR (
--       created_at = '<CREATED_AT>'
--       AND id > '<MESSAGE_ID>'
--     )
--   )
-- ORDER BY created_at ASC, id ASC
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

-- Dashboard ownership/status plan comparison. No candidate index is created
-- for this path until live cardinality and plans select a shape.
-- EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
-- SELECT id, user_id, user_email, status, created_at
-- FROM public.orders
-- WHERE (
--   user_id = '<USER_ID>'
--   OR user_email = '<USER_EMAIL>'
-- )
-- AND status IN ('paid', 'confirmed', 'completed', 'success', 'active', 'pending')
-- ORDER BY created_at DESC;

-- EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
-- SELECT id, user_id, expires_at, created_at
-- FROM public.statuses
-- WHERE user_id = '<USER_ID>'
--   AND expires_at > '<NOW>'
-- ORDER BY created_at DESC;

-- EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
-- SELECT id, user_id, expires_at, created_at
-- FROM public.statuses
-- WHERE user_id IN ('<USER_ID_1>', '<USER_ID_2>')
--   AND expires_at > '<NOW>'
-- ORDER BY created_at ASC;

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
