import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { rejectDisallowedOrigin } from "../api/_httpSecurity.js";
import { decryptMarketplaceAdToken } from "../api/_marketplaceAds.js";
import { requireVerifiedClerkUser } from "../api/_clerkAuth.js";

const EVENT_NAMES = new Set([
  "ViewContent",
  "ClickButton",
  "Contact",
  "SubmitForm",
  "CompleteRegistration",
  "Purchase",
]);
const text = (value, max = 160) => String(value || "").trim().slice(0, max);
const sha256 = (value) => createHash("sha256").update(String(value || "")).digest("hex");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PORTFOLIO_BUILDER_SLUG = "plugsy-portfolio-builder";
const PORTFOLIO_BUILDER_ID = "00000000-0000-4000-8000-000000000001";
const rateWindows = new Map();

function client() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("PORTFOLIO_ADS_CONFIG_REQUIRED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function deviceType(userAgent) {
  const ua = String(userAgent || "").toLowerCase();
  if (/bot|crawler|spider|preview|facebookexternalhit|tiktokbot/.test(ua)) return "bot";
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobile|iphone|android/.test(ua)) return "mobile";
  return ua ? "desktop" : "unknown";
}

function safeHost(value) {
  try { return new URL(String(value || "")).hostname.slice(0, 120) || null; } catch { return null; }
}

function requestIp(req) {
  return text(req.headers?.["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress, 80);
}

function withinRateLimit(req) {
  const key = sha256(requestIp(req) || "unknown");
  const now = Date.now();
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 60;
}

function safePageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !/(^|\.)plugsy\.ng$/i.test(url.hostname)) return undefined;
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

async function sendTikTokEvent(settings, event, req, rawClickId) {
  if (!settings?.enabled || !settings?.tiktok_pixel_id || !settings?.tiktok_access_token_encrypted) return "disabled";
  const token = decryptMarketplaceAdToken(settings.tiktok_access_token_encrypted);
  const response = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Access-Token": token },
    body: JSON.stringify({
      event_source: "web",
      event_source_id: settings.tiktok_pixel_id,
      data: [{
        event: event.event_name,
        event_time: Math.floor(new Date(event.occurred_at).getTime() / 1000),
        event_id: event.event_id,
        user: {
          ttclid: rawClickId || undefined,
          ip: requestIp(req) || undefined,
          user_agent: text(req.headers?.["user-agent"], 500) || undefined,
          external_id: [event.session_id_hash],
        },
        page: { url: safePageUrl(req.body?.pageUrl), referrer: safePageUrl(req.headers?.referer) },
        properties: {
          content_id: event.portfolio_id,
          content_name: `Portfolio: ${event.portfolio_slug}`,
          content_type: "product",
        },
      }],
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || (payload?.code !== undefined && Number(payload.code) !== 0)) {
    throw new Error(`TikTok Events API returned ${response.status}.`);
  }
  return "sent";
}

async function handleTrack(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST is required." });
  const body = req.body || {};
  if (!withinRateLimit(req)) return res.status(429).json({ success: false, error: "Too many analytics events." });
  if (body.analyticsConsent !== true && body.marketingConsent !== true) {
    return res.status(202).json({ success: true, recorded: false, reason: "CONSENT_NOT_GRANTED" });
  }
  const eventName = text(body.eventName, 40);
  const eventId = text(body.eventId, 60);
  const sessionId = text(body.sessionId, 100);
  const slug = text(body.portfolioSlug, 100).toLowerCase();
  if (!EVENT_NAMES.has(eventName) || !uuidPattern.test(eventId) || !uuidPattern.test(sessionId) || !/^[a-z0-9][a-z0-9_-]{1,99}$/.test(slug)) {
    return res.status(400).json({ success: false, error: "Invalid analytics event." });
  }
  const device = deviceType(req.headers?.["user-agent"]);
  if (device === "bot") return res.status(202).json({ success: true, recorded: false, reason: "AUTOMATION_FILTERED" });

  const supabase = client();
  let registrationActor = null;
  if (eventName === "CompleteRegistration") {
    registrationActor = await requireVerifiedClerkUser(req, res);
    if (!registrationActor) return;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("created_at")
      .eq("clerk_id", registrationActor.userId)
      .maybeSingle();
    if (profileError) throw profileError;
    const createdAt = new Date(profile?.created_at || 0).getTime();
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > 30 * 60_000) {
      return res.status(202).json({ success: true, recorded: false, reason: "REGISTRATION_NOT_NEW" });
    }
  }
  let portfolio = slug === PORTFOLIO_BUILDER_SLUG
    ? { id: PORTFOLIO_BUILDER_ID, slug: PORTFOLIO_BUILDER_SLUG, status: "published" }
    : null;
  if (!portfolio) {
    const { data, error: portfolioError } = await supabase
      .from("vp_portfolios")
      .select("id,slug,status")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (portfolioError) throw portfolioError;
    portfolio = data;
  }
  if (!portfolio) return res.status(404).json({ success: false, error: "Published portfolio not found." });

  const attribution = body.attribution && typeof body.attribution === "object" ? body.attribution : {};
  const clickId = body.marketingConsent === true ? text(attribution.ttclid, 220) : "";
  const country = text(req.headers?.["x-vercel-ip-country"], 2).toUpperCase();
  const row = {
    event_id: eventId,
    event_name: eventName,
    portfolio_id: portfolio.id,
    portfolio_slug: portfolio.slug,
    session_id_hash: sha256(sessionId),
    source: text(attribution.source, 80).toLowerCase() || "direct",
    medium: text(attribution.medium, 80).toLowerCase() || "none",
    campaign: text(attribution.campaign, 120) || "(not set)",
    content: text(attribution.content, 120) || null,
    term: text(attribution.term, 120) || null,
    click_id_hash: clickId ? sha256(clickId) : null,
    referrer_host: safeHost(req.headers?.referer),
    device_type: device,
    country_code: /^[A-Z]{2}$/.test(country) ? country : null,
    marketing_consent: body.marketingConsent === true,
    provider_delivery_status: body.marketingConsent === true ? "pending" : "not_requested",
  };
  const { data: inserted, error: insertError } = await supabase
    .from("portfolio_ad_events_v1")
    .insert(row)
    .select("*")
    .single();
  if (insertError?.code === "23505") return res.status(200).json({ success: true, recorded: true, duplicate: true });
  if (insertError) throw insertError;

  if (body.marketingConsent === true) {
    let status = "failed";
    try {
      const { data: settings } = await supabase.from("portfolio_ad_settings_v1").select("*").eq("id", "primary").maybeSingle();
      status = await sendTikTokEvent(settings, inserted, req, clickId);
    } catch (error) {
      console.error("[portfolio-ads] TikTok delivery failed:", error?.message || error);
    }
    await supabase.from("portfolio_ad_events_v1").update({ provider_delivery_status: status }).eq("id", inserted.id);
  }
  return res.status(200).json({ success: true, recorded: true, eventId: inserted.event_id });
}

export default async function handler(req, res) {
  if (rejectDisallowedOrigin(req, res, { methods: "POST, OPTIONS", headers: "Authorization, Content-Type" })) return;
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    const url = new URL(req.originalUrl || req.url, `http://${req.headers?.host || "localhost"}`);
    const action = req.query?.action || url.searchParams.get("action") || "track";
    if (action === "track") return await handleTrack(req, res);
    return res.status(404).json({ success: false, error: "Unknown action." });
  } catch (error) {
    console.error("[portfolio-ads] request failed:", error?.message || error);
    return res.status(503).json({ success: false, error: "Portfolio analytics are temporarily unavailable." });
  }
}
