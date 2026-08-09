-- ============================================================================
-- PLUGSY DATABASE SCALABILITY V1: PRODUCTION ROLLOUT RECORD
-- ============================================================================
-- THIS IS NOT A SUPABASE MIGRATION. DO NOT EXECUTE THIS FILE.
--
-- PRODUCTION ROLLOUT WAS COMPLETED MANUALLY ON 2026-08-09.
-- This is a historical/manual rollout record only, not an automatic migration
-- or an instruction to repeat production changes.
--
-- DO NOT EXECUTE BEFORE:
-- 1. database_scalability_v1_preflight.sql has been run;
-- 2. equivalent indexes have been checked;
-- 3. table sizes have been reviewed;
-- 4. rollout method has been approved;
-- 5. hot/large tables have a concurrent-index plan.
--
-- Each applied statement below records the logical production form.
-- For messages, orders, and status-related tables, use a CONTROLLED
-- CONCURRENT BUILD if live size/traffic justifies it. The repository does not
-- prove that the normal migration runner supports transactionless concurrent
-- builds. These statements are intentionally not executable by automation.

-- APPLIED MANUALLY TO PRODUCTION 2026-08-09
-- VERIFIED: valid=true, ready=true, live=true
create index if not exists idx_messages_chat_created_id
  on public.messages (chat_id, created_at desc, id desc);

-- APPLIED MANUALLY TO PRODUCTION 2026-08-09
-- VERIFIED: valid=true, ready=true, live=true
create index if not exists idx_chat_members_user_chat
  on public.chat_members (user_id, chat_id);

-- APPLIED MANUALLY TO PRODUCTION 2026-08-09
-- VERIFIED: valid=true, ready=true, live=true
create index if not exists idx_chat_members_chat_user
  on public.chat_members (chat_id, user_id);

-- APPLIED MANUALLY TO PRODUCTION 2026-08-09
-- VERIFIED: valid=true, ready=true, live=true
create index if not exists idx_calls_chat_status_started
  on public.calls (chat_id, status, started_at desc);

-- APPLIED MANUALLY TO PRODUCTION 2026-08-09
-- VERIFIED: valid=true, ready=true, live=true
create index if not exists idx_chats_public_group_member_count
  on public.chats (member_count desc)
  where chat_type = 'group' and is_public = true;

-- APPLIED MANUALLY TO PRODUCTION 2026-08-09
-- VERIFIED: valid=true, ready=true, live=true
create index if not exists idx_orders_delivery_created_at
  on public.orders (delivery_status, created_at desc);

-- APPLIED MANUALLY TO PRODUCTION 2026-08-09
-- VERIFIED: valid=true, ready=true, live=true
create index if not exists idx_subscriptions_user_status
  on public.subscriptions (user_id, status);

-- APPLIED MANUALLY TO PRODUCTION 2026-08-09
-- VERIFIED: valid=true, ready=true, live=true
create index if not exists idx_status_views_viewer_status
  on public.status_views (viewer_id, status_id);

-- idx_status_views_status_viewed_at (status_id, viewed_at DESC)
-- NOT APPLIED
-- NEEDS LIVE PLAN TESTING
-- existing status_id indexes already provide leading-key access

-- idx_vp_portfolios_slug (slug)
-- NOT APPLIED
-- REDUNDANT IN PRODUCTION
-- existing idx_vp_portfolios_slug and UNIQUE vp_portfolios_slug_key
