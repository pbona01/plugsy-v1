-- ============================================================================
-- PLUGSY DATABASE SCALABILITY V1: CANDIDATE ROLLOUT ARTIFACT
-- ============================================================================
-- THIS IS NOT A SUPABASE MIGRATION. DO NOT EXECUTE THIS FILE.
--
-- DO NOT EXECUTE BEFORE:
-- 1. database_scalability_v1_preflight.sql has been run;
-- 2. equivalent indexes have been checked;
-- 3. table sizes have been reviewed;
-- 4. rollout method has been approved;
-- 5. hot/large tables have a concurrent-index plan.
--
-- Each statement below is a logical candidate only. The normal form is shown
-- for review; production rollout must use a separately approved procedure.
-- For messages, orders, and status-related tables, use a CONTROLLED
-- CONCURRENT BUILD if live size/traffic justifies it. The repository does not
-- prove that the normal migration runner supports transactionless concurrent
-- builds. These statements are intentionally not executable by automation.

-- READY CANDIDATE: messages(chat_id, created_at DESC, id DESC)
-- Production form, if approved: CREATE INDEX CONCURRENTLY IF NOT EXISTS ...
create index if not exists idx_messages_chat_created_id
  on public.messages (chat_id, created_at desc, id desc);

-- READY CANDIDATE: chat_members(user_id, chat_id)
create index if not exists idx_chat_members_user_chat
  on public.chat_members (user_id, chat_id);

-- READY CANDIDATE: chat_members(chat_id, user_id)
create index if not exists idx_chat_members_chat_user
  on public.chat_members (chat_id, user_id);

-- READY CANDIDATE: calls(chat_id, status, started_at DESC)
create index if not exists idx_calls_chat_status_started
  on public.calls (chat_id, status, started_at desc);

-- READY CANDIDATE: public groups ordered by member_count DESC
create index if not exists idx_chats_public_group_member_count
  on public.chats (member_count desc)
  where chat_type = 'group' and is_public = true;

-- READY CANDIDATE: orders(delivery_status, created_at DESC)
-- CONTROLLED CONCURRENT BUILD REQUIRED IF LIVE SIZE/TRAFFIC JUSTIFIES IT.
create index if not exists idx_orders_delivery_created_at
  on public.orders (delivery_status, created_at desc);

-- READY CANDIDATE: subscriptions(user_id, status)
create index if not exists idx_subscriptions_user_status
  on public.subscriptions (user_id, status);

-- READY CANDIDATE: status_views(viewer_id, status_id)
-- CONTROLLED CONCURRENT BUILD REQUIRED IF LIVE SIZE/TRAFFIC JUSTIFIES IT.
create index if not exists idx_status_views_viewer_status
  on public.status_views (viewer_id, status_id);

-- READY CANDIDATE: status_views(status_id, viewed_at DESC)
-- CONTROLLED CONCURRENT BUILD REQUIRED IF LIVE SIZE/TRAFFIC JUSTIFIES IT.
create index if not exists idx_status_views_status_viewed_at
  on public.status_views (status_id, viewed_at desc);

-- READY CANDIDATE: vp_portfolios(slug)
create index if not exists idx_vp_portfolios_slug
  on public.vp_portfolios (slug);
