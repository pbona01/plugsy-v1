import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin exposes a dedicated TikTok portfolio ads section", () => {
  const admin = read("src/pages/Admin.tsx");
  const panel = read("src/components/admin/TikTokAdsPanel.tsx");
  assert.match(admin, /id: 'portfolio-ads'/);
  assert.match(admin, /<TikTokAdsPanel getToken=\{getToken\}/);
  assert.match(panel, /Campaign attribution/);
  assert.match(panel, /Create a trackable portfolio URL/);
  assert.match(panel, /TikTok Events API/);
  assert.match(panel, /Privacy-safe by design/);
});

test("portfolio tracking is consent gated and stores only pseudonymous attribution", () => {
  const client = read("src/utils/portfolioAds.ts");
  const api = read("api-handlers/portfolio-ads.js");
  const misc = read("api/misc.js");
  const vercel = read("vercel.json");
  const migration = read("supabase/migrations/20261009100000_portfolio_ads_analytics_v1.sql");
  assert.match(client, /CONSENT_NOT_GRANTED/);
  assert.match(client, /utm_source/);
  assert.match(client, /ttclid/);
  assert.match(client, /DB4HTERC77UFAQAVQO80/);
  assert.match(client, /trackPlugsyTikTokEvent\(tiktokPixelId/);
  assert.match(client, /if \(consent\.marketing\)/);
  assert.match(vercel, /https:\/\/analytics\.tiktok\.com/);
  assert.match(api, /body\.analyticsConsent !== true && body\.marketingConsent !== true/);
  assert.match(api, /session_id_hash: sha256\(sessionId\)/);
  assert.match(api, /click_id_hash: clickId \? sha256\(clickId\) : null/);
  assert.match(misc, /portfolioAdsHandler/);
  assert.match(vercel, /\/api\/portfolio-ads\(\.\*\).*\/api\/misc\?route=portfolio-ads/s);
  assert.doesNotMatch(migration, /email text|ip_address text|user_agent text/i);
  assert.match(migration, /revoke all on table public\.portfolio_ad_events_v1 from anon, authenticated/);
});

test("TikTok credentials are encrypted and never returned to the browser", () => {
  const adminApi = read("api-handlers/admin.js");
  const crypto = read("api/_marketplaceAds.js");
  assert.match(adminApi, /encryptMarketplaceAdToken\(token\)/);
  assert.match(adminApi, /DEFAULT_PORTFOLIO_TIKTOK_PIXEL_ID = "DB4HTERC77UFAQAVQO80"/);
  assert.match(adminApi, /tiktokTokenConnected: Boolean/);
  assert.doesNotMatch(adminApi, /tiktokAccessToken:\s*data\./);
  assert.match(crypto, /aes-256-gcm/);
});

test("public portfolios record views after consent and classify contact actions", () => {
  const portfolio = read("src/pages/PublicPortfolio.tsx");
  assert.match(portfolio, /trackPortfolioAdEvent\(activeSlug, "ViewContent"\)/);
  assert.match(portfolio, /isContact \? "Contact" : "ClickButton"/);
  assert.match(portfolio, /<MarketplaceCookieConsent \/>/);
});

test("CompleteRegistration fires only after a new authenticated Plugsy profile is confirmed", () => {
  const app = read("src/App.tsx");
  const auth = read("src/lib/authUtils.ts");
  const profileSync = read("api/_profileSync.js");
  const client = read("src/utils/portfolioAds.ts");
  const api = read("api-handlers/portfolio-ads.js");
  assert.match(profileSync, /created: !existing/);
  assert.match(auth, /_wasCreated: data\.created === true/);
  assert.match(app, /if \(profile\?\._wasCreated\)/);
  assert.match(app, /trackPortfolioRegistration\(token\)/);
  assert.match(client, /"CompleteRegistration", authToken/);
  assert.match(api, /eventName === "CompleteRegistration"/);
  assert.match(api, /requireVerifiedClerkUser\(req, res\)/);
  assert.match(api, /REGISTRATION_NOT_NEW/);
});
