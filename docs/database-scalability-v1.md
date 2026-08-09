# Plugsy database scalability v1

This document records the database scalability v1 preflight and the actual
production rollout. The repository does not contain a complete historical
schema or index history, so live catalog and query-plan evidence remains the
source of truth for future changes.

## Production rollout  2026-08-09

The read-only preflight was completed manually against production. Phase 2
production indexing status: **COMPLETE**.

Exactly eight indexes were applied manually in production with
`CREATE INDEX CONCURRENTLY IF NOT EXISTS`. All eight were verified after
creation with `indisvalid = true`, `indisready = true`, and `indislive = true`.

### PRODUCTION APPLIED

The applied indexes are recorded as logical reference statements in
`supabase/rollouts/database_scalability_v1_candidates.sql`. Observed sizes
immediately after rollout were: `idx_calls_chat_status_started` 16 kB,
`idx_chat_members_chat_user` 16 kB, `idx_chat_members_user_chat` 16 kB,
`idx_chats_public_group_member_count` 16 kB, `idx_messages_chat_created_id`
256 kB, `idx_orders_delivery_created_at` 16 kB,
`idx_status_views_viewer_status` 8192 bytes, and
`idx_subscriptions_user_status` 8192 bytes. These are observed values, not
permanent size guarantees.

No RLS, business logic, wallet/payment logic, or application data was changed.
No migration was created.

### DEFERRED

`idx_status_views_status_viewed_at (status_id, viewed_at DESC)` was **NOT
APPLIED** and needs live query-plan/cardinality testing. Production already
has `idx_status_views_status (status_id)` and
`status_views_status_id_viewer_id_key UNIQUE (status_id, viewer_id)`, which
provide status_id-leading access. The ordering index may help at larger
viewer counts, but requires evidence before adding write amplification.

### REDUNDANT / DO NOT CREATE

`idx_vp_portfolios_slug (slug)` was **NOT APPLIED** and is redundant in
production because both `idx_vp_portfolios_slug (slug)` and
`vp_portfolios_slug_key UNIQUE (slug)` already exist.

## Ready candidates

These are high-confidence logical candidates supported by concrete repository
query paths. They remain candidates and are marked `CANDIDATE - DO NOT APPLY
UNTIL LIVE EQUIVALENCE CHECK` in the rollout artifact.

| Table | Query shape | Candidate | Evidence | Rollout note |
| --- | --- | --- | --- | --- |
| `messages` | `chat_id`, newest/older cursor, `created_at DESC, id DESC`, limit 50 | `idx_messages_chat_created_id` | `PersonalChat.tsx` bounded message queries | Controlled concurrent build required if live size/traffic justifies it |
| `chat_members` | `user_id = ?` then chat IDs | `idx_chat_members_user_chat` | `ChatHub.tsx` inbox membership query | Verify equivalent or unique index live |
| `chat_members` | `chat_id = ?` / member lookup | `idx_chat_members_chat_user` | `PersonalChat.tsx` active-chat membership query | Verify equivalent or unique index live |
| `calls` | `chat_id`, `status = active`, newest `started_at` | `idx_calls_chat_status_started` | `PersonalChat.tsx` and call handler recovery | Verify table size and equivalent live |
| `chats` | public groups ordered by `member_count DESC`, limit 10 | `idx_chats_public_group_member_count` | `ChatHub.tsx` discovery query | Verify predicate and live size |
| `orders` | `delivery_status = login_sent`, `created_at DESC` | `idx_orders_delivery_created_at` | `Admin.tsx` listing query | Controlled concurrent build required if live size/traffic justifies it |
| `subscriptions` | `user_id = ? AND status = active` | `idx_subscriptions_user_status` | `Dashboard.tsx` subscription query | Verify equivalent live |
| `status_views` | `viewer_id = ?`, status IDs | `idx_status_views_viewer_status` | `StatusHub.tsx` viewed-status query | Controlled concurrent build required if live size/traffic justifies it |
| `status_views` | `status_id = ?`, `viewed_at DESC` | `idx_status_views_status_viewed_at` | `StatusHub.tsx` viewer-list query | Controlled concurrent build required if live size/traffic justifies it |
| `vp_portfolios` | public `slug = ?` lookup | `idx_vp_portfolios_slug` | `PublicPortfolio.tsx` lookup | Verify existing slug constraint/index live |

## Needs live plan testing

- `orders`: the Dashboard query filters by current `user_id` or legacy
  `user_email`, filters a status set, and orders by `created_at`. The former
  `idx_orders_status_created_at` candidate was removed because it is not a
  direct ownership-selective match. Compare `(user_id, created_at DESC)` and,
  only if legacy email lookup materially matters, `(user_email, created_at
  DESC)` or ownership-plus-status variants using live plans and cardinality.
- `statuses`: `(user_id, expires_at, created_at DESC)` has a range predicate
  before the ordering key and cannot be claimed to fully provide both. Compare
  it with `(user_id, created_at DESC)` using active/expired ratios, rows per
  user, and planner output. No status index is in the ready rollout set.
- Wallet transactions, withdrawals, funding references, idempotency paths,
  portfolio access/purchase paths, and profile `clerk_id` remain live-review
  candidates only because their schema history or financial risk is not
  established here.

## Skipped or redundant

- No profile username or One Link username index: repository migrations prove
  lower-cased unique indexes for those identifiers.
- No `one_link_page_views_daily_v1(owner_user_id, view_date)` index: its
  composite primary key already provides that index.
- No wallet uniqueness/support indexes: existing wallet migrations prove
  relevant financial uniqueness in part, while the incomplete initial schema
  requires live verification and wallet behavior is high risk.
- No separate ascending message index: the same B-tree can be traversed in
  reverse.
- No `idx_orders_status_created_at` or `idx_statuses_user_expires_created`:
  both require live plan testing and are intentionally absent from the ready
  candidate artifact.

## Future cleanup candidates only

These are investigation candidates only. No removal is approved and this
branch contains no `DROP INDEX` statements:

- `profiles.idx_profiles_clerk_id` / `profiles_clerk_id_key UNIQUE (clerk_id)`.
- `profiles.idx_profiles_purchase_code` / `profiles_purchase_code_key UNIQUE
  (purchase_code)`.
- `profiles.idx_profiles_username` / `profiles_username_key UNIQUE (username)`.
- `profiles_pkey PRIMARY KEY (id)` / `unique_clerk_id UNIQUE (id)`; the latter
  is misleadingly named because it indexes `id`, not `clerk_id`.
- `chats.idx_chats_invite_code` / `chats_invite_code_key UNIQUE (invite_code)`.
- `vp_portfolios.idx_vp_portfolios_slug` / `vp_portfolios_slug_key UNIQUE
  (slug)`.
- `vp_portfolios_paystack_ref_key UNIQUE (paystack_ref)` /
  `vp_portfolios_paystack_ref_unique UNIQUE (paystack_ref)`. Also investigate
  `vp_portfolios_purchase_reference_unique_v2`, a partial unique index for
  active paid rows.

Removal requires dependency, constraint, and query-plan review. Inspect
`pg_constraint`, `pg_depend`, `pg_index`, and usage before any cleanup.

## Preflight and rollout

Run `supabase/audits/database_scalability_v1_preflight.sql` manually in a
reviewed read-only session. It reports table/index size, scan usage, validity,
readiness, live/uniqueness/primary status, structural duplicate signatures,
and candidate-name/equivalence checks. Structural traversal uses explicit
1-based logical positions mapped to the zero-based `int2vector` storage
subscripts. Exact catalog-vector duplicates are reported separately from
same-key coverage by UNIQUE/PRIMARY indexes and from prefix/superset review
signals. It also contains commented plain `EXPLAIN` examples for message
newer/older cursors, dashboard order ownership, and deferred status plans;
none are executed by the script.

Then review the output and record any separately approved production rollout.
Hot/large tables—including messages, orders, and status-related tables—need a
controlled concurrent build when live size or traffic justifies it. The
repository does not prove that its normal migration runner safely supports
transactionless `CREATE INDEX CONCURRENTLY`, so no automatic migration is
provided. `supabase/rollouts/database_scalability_v1_candidates.sql` is a
historical/manual rollout record and must not be executed as-is.

The preflight also showed useful, non-absolute usage evidence:
`idx_chat_members_user` had approximately 47,243 `idx_scan`, and
`idx_orders_delivery_status` had approximately 11,774 `idx_scan`.
`idx_profiles_clerk_id` had high usage, but it coexists with a UNIQUE
`clerk_id` index, so counters alone cannot identify a safe duplicate to remove.
`idx_scan` is not absolute lifetime traffic or a current request rate;
PostgreSQL statistics can reset.
