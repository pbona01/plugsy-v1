# Operating Plugsy at scale

This is the handover guide for keeping Plugsy understandable and reliable as
concurrent users, chat traffic, and transaction volume increase.

## System boundaries

| Concern | Owner | Rule |
| --- | --- | --- |
| Browser UI | React/Vite | Fetch bounded pages; do not poll full histories. |
| Realtime presence | Supabase Presence | Presence is live state; `profiles.last_login_at` is only a coarse fallback. |
| Messages and calls | Supabase/Postgres + Realtime | Use indexed cursor queries and narrowly scoped channels. |
| Money | Vercel wallet API + Postgres RPC + Fly payout worker | Database operations are authoritative and idempotent; never retry an ambiguous payout. |
| Notifications | Vercel API + OneSignal | Notification delivery is a secondary effect, never a prerequisite for a transaction. |
| Scheduled work | Vercel Cron + Postgres job lease | Each run claims a lease, processes a bounded batch, and must be safe to repeat. |

## Non-negotiable scalability rules

1. Never use `select("*")` for a growing table in a user-facing path.
2. Every list endpoint needs a stable order, a page size, and a cursor/range.
3. A fallback poll is allowed only when Realtime is unavailable, must pause in a
   hidden tab, and must request only data newer than a cursor.
4. Client Realtime channels must be scoped to one chat, user, or call. Do not
   subscribe every user to whole-table changes.
5. Background jobs claim `claim_scheduled_job_lease` before work, process at
   most one bounded batch, and persist an idempotency key before external
   delivery where duplicates would matter.
6. Add a database index only after production `EXPLAIN` verifies its query
   shape and an equivalent index/constraint does not already exist.

## Existing safeguards

- Personal chat uses 50-message cursor pagination and a 30-second
  visibility-aware fallback for missed events.
- Support chat now bounds its history sync to 100 canonical and 100 legacy
  rows, and marks only delivered unread messages as read.
- Incoming-call fallback caches memberships and polls calls no more than every
  15 seconds while the tab is visible.
- Scheduled cleanup/reminder jobs use a database lease and 100/200-row batches.
- OneSignal audience counts classify recipients once instead of scanning the
  complete audience twice.

## Production checks before a traffic increase

- Record peak concurrent users, open Realtime channels, messages/minute, DB
  CPU, slow-query count, function p95 duration, and cron run duration.
- Run `EXPLAIN (ANALYZE, BUFFERS)` against the exact production-shaped query
  for messages, calls, bookings, statuses, and notification subscriptions.
- Load test authenticated Realtime Broadcast and Postgres Changes separately;
  move high-fanout features to private Broadcast before they approach their
  Realtime plan limits.
- Verify Vercel cron calls include `Authorization: Bearer $CRON_SECRET` and
  that a duplicate invocation returns `JOB_ALREADY_RUNNING`.
- Verify a failed push/email/Telegram delivery does not roll back a completed
  order, wallet movement, or message insert.

## Queue threshold

Introduce a durable `outbox_events` table and worker when any job can perform
more than 100 external deliveries, take longer than 30 seconds at p95, or need
retries. The request that creates the business record writes an outbox row in
the same transaction; a worker claims rows with `FOR UPDATE SKIP LOCKED` and
records the provider result. Do not use in-memory queues in Vercel Functions.

## Deployment order

1. Apply `20260811100000_scheduled_job_leases_v1.sql`.
2. Set a strong `CRON_SECRET` in Vercel Production and Preview.
3. Deploy the application.
4. Trigger each cron once in a controlled environment; confirm its bounded
   batch and lease behavior in logs.
5. Monitor the metrics above for seven days before changing polling or batch
   limits.
