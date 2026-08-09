# Plugsy database scalability v1

This branch is a safe database preflight and index-candidate foundation. It
does not apply database indexes. **Merging this branch does not apply database
indexes.** The repository does not contain a complete historical schema or
index history, so every candidate requires live read-only verification first.

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

Then review the output and create a separate approved production rollout.
Hot/large tables—including messages, orders, and status-related tables—need a
controlled concurrent build when live size or traffic justifies it. The
repository does not prove that its normal migration runner safely supports
transactionless `CREATE INDEX CONCURRENTLY`, so no automatic migration is
provided. `supabase/rollouts/database_scalability_v1_candidates.sql` is a
manual review artifact and must not be executed as-is.
