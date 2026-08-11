-- Phase 1 of the live RLS rollout. This migration is additive: it does not
-- enable RLS or remove existing policies, so it is safe to deploy before the
-- browser-query refactor is complete.

create or replace function public.current_clerk_id_v1()
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select nullif(coalesce(auth.jwt() ->> 'sub', auth.uid()::text), '');
$$;

create or replace function public.is_plugsy_admin_v1()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles
    where clerk_id = public.current_clerk_id_v1()
      and lower(coalesce(role, '')) = 'admin'
  );
$$;

revoke all on function public.current_clerk_id_v1() from public, anon;
grant execute on function public.current_clerk_id_v1() to authenticated, service_role;
revoke all on function public.is_plugsy_admin_v1() from public, anon;
grant execute on function public.is_plugsy_admin_v1() to authenticated, service_role;

-- Direct access to profiles currently exposes email, wallet balance, bank
-- details, and provider recipient codes. New public/directory reads must use
-- this deliberately limited view instead of public.profiles.
create or replace view public.profile_directory_v1
with (security_barrier = true)
as
select
  clerk_id,
  username,
  full_name,
  bio,
  profile_pic_url,
  image_url,
  medal_tier,
  medal_number,
  wallet_tag,
  one_link_username,
  one_link_display_name,
  one_link_biography,
  one_link_avatar_url,
  one_link_wallpaper_url,
  one_link_wallpaper_text_mode,
  one_link_settings,
  one_link_updated_at,
  last_login_at
from public.profiles;

revoke all on public.profile_directory_v1 from public;
grant select on public.profile_directory_v1 to anon, authenticated;
