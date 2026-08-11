-- Support bounded status, unread-count, and inbox reads under concurrent load.
create index if not exists idx_statuses_user_expires_created_v1
  on public.statuses (user_id, expires_at, created_at desc);

create index if not exists idx_status_views_viewer_viewed_v1
  on public.status_views (viewer_id, viewed_at desc);

create index if not exists idx_status_views_status_viewed_v1
  on public.status_views (status_id, viewed_at desc);

create index if not exists idx_messages_support_unread_v1
  on public.messages (chat_id, read_by_user, created_at desc)
  where read_by_user = false;

create index if not exists idx_chat_members_user_chat_v1
  on public.chat_members (user_id, chat_id);
