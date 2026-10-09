insert into public.portfolio_ad_settings_v1 (id, tiktok_pixel_id, enabled, updated_at)
values ('primary', 'DB4HTERC77UFAQAVQO80', false, now())
on conflict (id) do update
set tiktok_pixel_id = excluded.tiktok_pixel_id,
    updated_at = now();
