# Plugsy database scalability v1

This phase adds only query-support indexes and a read-only preflight. The
migration has not been run. The repository does not include a complete initial
schema history, so live metadata must be reviewed before applying it.

## Implemented indexes

| Table | Query path | Existing index evidence | New index | Why | Confidence | Rollout risk |
| --- | --- | --- | --- | --- | --- | --- |
| `messages` | `chat_id`, cursor `(created_at,id)`, newest/older pages | Phase 1 query exists; no equivalent in repository migrations | `idx_messages_chat_created_id` | Supports bounded newest, older, and newer cursor scans | High | Large table; assess concurrent rollout separately |
| `chat_members` | `user_id = ?` then chat IDs | No initial-schema index evidence | `idx_chat_members_user_chat` | Supports inbox/status membership discovery | High | Low write volume relative to reads; verify equivalence live |
| `chat_members` | `chat_id = ?` / `chat_id IN (...)` with member lookup | No initial-schema index evidence | `idx_chat_members_chat_user` | Supports active-chat membership and recipient lookup | High | Verify no equivalent unique index live |
| `calls` | `chat_id`, active `status`, newest `started_at` | Query exists in PersonalChat/call paths; no index evidence | `idx_calls_chat_status_started` | Supports active-call recovery | High | Small-to-medium table; verify live size |
| `chats` | public groups ordered by `member_count` with limit 10 | Query exists in ChatHub; no index evidence | `idx_chats_public_group_member_count` | Partial index scans only public groups | High | Verify predicate matches live column types |
| `orders` | status set ordered by `created_at` | Dashboard query exists; unique payment indexes do not cover this order | `idx_orders_status_created_at` | Supports dashboard order history filtering | Medium-high | Order volume and status distribution need live review |
| `orders` | `delivery_status = 'login_sent'` ordered by `created_at` | Admin subscription query exists | `idx_orders_delivery_created_at` | Supports admin subscription listing | High | Admin path; verify table size |
| `subscriptions` | `user_id = ? AND status = 'active'` | Dashboard query exists; no equivalent evidence | `idx_subscriptions_user_status` | Supports dashboard subscription lookup | High | Verify existing user/status index live |
| `statuses` | user set, unexpired, ordered by created time | StatusHub query exists; no index evidence | `idx_statuses_user_expires_created` | Supports own and related status feeds | High | Status retention/volume needs live review |
| `status_views` | `viewer_id = ?` and viewed status IDs | StatusHub query exists; no equivalent evidence | `idx_status_views_viewer_status` | Supports viewed-status lookup | High | Verify conflict/index coverage live |
| `status_views` | `status_id = ?` ordered by `viewed_at` | Status viewer query exists | `idx_status_views_status_viewed_at` | Supports viewer list loading | High | Verify existing status/viewer uniqueness live |
| `vp_portfolios` | public `slug = ?` lookup | PublicPortfolio query exists; no index evidence | `idx_vp_portfolios_slug` | Supports public portfolio entry lookup | High | Verify live slug constraint/index |

## Recommended but needs live database verification

- `profiles.clerk_id`, `profiles.username`, and `profiles.one_link_username`:
  application queries are frequent, but repository migrations already prove
  functional unique indexes for lower-cased `username` and
  `one_link_username`; the initial schema status for `clerk_id` is unknown.
  Do not add duplicates without the preflight result.
- Wallet transaction, withdrawal, funding-reference, and idempotency paths:
  existing migrations prove several unique financial indexes, while the
  remaining initial-schema indexes are not represented. Because these paths
  are high risk, verify live plans and existing definitions before adding any
  non-unique support index.
- `one_link_page_views_daily_v1(owner_user_id, view_date)` is already proven
  by its composite primary key; no duplicate index is proposed.
- Portfolio item/category owner/order indexes may help editor reads, but the
  repository does not establish live cardinality or existing indexes.

## Known from repository vs. must verify live

Known: the application query shapes listed above, the Phase 1 message cursor,
the additive migration naming, the unique profile username/One Link indexes,
the daily analytics primary key, and recent wallet uniqueness indexes.

Must verify live: the complete initial schema, primary keys and foreign keys
for legacy tables, equivalent indexes, table/index sizes, index scan usage,
duplicate definitions, and whether large production tables need a controlled
concurrent-index rollout. The repository does not prove that the normal
migration runner supports transactionless `CREATE INDEX CONCURRENTLY`, so the
migration intentionally uses ordinary `CREATE INDEX IF NOT EXISTS`; rollout
owners should choose a controlled concurrent procedure where necessary.

## Redundant indexes avoided

- No separate ascending message index: PostgreSQL can scan the same B-tree in
  reverse order.
- No separate `profiles(username)` or `profiles(one_link_username)` index:
  repository migrations prove lower-cased unique indexes for those identifiers.
- No `one_link_page_views_daily_v1` index: its `(owner_user_id, view_date)`
  primary key already supplies that access path.
- No wallet uniqueness indexes: recent wallet migrations already define the
  relevant unique/reference/idempotency coverage, and wallet behavior is out
  of scope.
- No global single-column indexes for every filter column: each implemented
  index matches a concrete filter/order path.

## Safe rollout notes

Review `supabase/audits/database_scalability_v1_preflight.sql` against the live
database first. Compare definitions and sizes, then choose an approved
maintenance window or a separately controlled concurrent-index procedure for
large tables. Do not run this migration automatically from this branch.
