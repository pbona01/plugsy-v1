-- Additive query-support indexes for the database scalability foundation.
-- Apply only after the read-only preflight has been reviewed against the live database.

create index if not exists idx_messages_chat_created_id
  on public.messages (chat_id, created_at desc, id desc);

create index if not exists idx_chat_members_user_chat
  on public.chat_members (user_id, chat_id);

create index if not exists idx_chat_members_chat_user
  on public.chat_members (chat_id, user_id);

create index if not exists idx_calls_chat_status_started
  on public.calls (chat_id, status, started_at desc);

create index if not exists idx_chats_public_group_member_count
  on public.chats (member_count desc)
  where chat_type = 'group' and is_public = true;

create index if not exists idx_orders_status_created_at
  on public.orders (status, created_at desc);

create index if not exists idx_orders_delivery_created_at
  on public.orders (delivery_status, created_at desc);

create index if not exists idx_subscriptions_user_status
  on public.subscriptions (user_id, status);

create index if not exists idx_statuses_user_expires_created
  on public.statuses (user_id, expires_at, created_at desc);

create index if not exists idx_status_views_viewer_status
  on public.status_views (viewer_id, status_id);

create index if not exists idx_status_views_status_viewed_at
  on public.status_views (status_id, viewed_at desc);

create index if not exists idx_vp_portfolios_slug
  on public.vp_portfolios (slug);
