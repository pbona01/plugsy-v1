-- Compatibility follow-up for the public profile directory. Chat presence uses
-- last_login_at, so it must be exposed alongside the other intentionally
-- non-sensitive display fields. Existing grants remain unchanged.

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
