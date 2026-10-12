import { trackPlugsyTikTokEvent } from "./marketplaceAds";

export type PortfolioAdEventName =
  | "ViewContent"
  | "ClickButton"
  | "Contact"
  | "SubmitForm"
  | "CompleteRegistration"
  | "Purchase";

type Consent = { analytics: boolean; marketing: boolean };
type Attribution = { source: string; medium: string; campaign: string; content: string; term: string; ttclid: string };

const consentKey = "plugsy:marketplace:cookie-consent:v1";
const sessionKey = "plugsy:portfolio-ad-session:v1";
const attributionKey = "plugsy:portfolio-ad-attribution:v1";
const persistentAttributionKey = "plugsy:portfolio-ad-attribution-persisted:v1";
const portfolioSlugKey = "plugsy:portfolio-ad-slug:v1";
const persistentPortfolioSlugKey = "plugsy:portfolio-ad-slug-persisted:v1";
const pendingRegistrationKey = "plugsy:portfolio-ad-registration-pending:v1";
const tiktokPixelId = "DB4HTERC77UFAQAVQO80";
const attributionLifetimeMs = 24 * 60 * 60 * 1000;

export function readPlugsyAdConsent(): Consent {
  try {
    const value = JSON.parse(localStorage.getItem(consentKey) || "{}");
    return { analytics: value.analytics === true, marketing: value.marketing === true };
  } catch {
    return { analytics: false, marketing: false };
  }
}

export function hasPortfolioAdAttribution(search?: string): boolean {
  const value = search ?? (typeof window === "undefined" ? "" : window.location.search);
  const params = new URLSearchParams(value);
  const source = safeValue(params.get("utm_source"), 80).toLowerCase();
  const medium = safeValue(params.get("utm_medium"), 80).toLowerCase();
  return params.get("portfolio_campaign") === "builder"
    || source === "tiktok"
    || medium === "paid_social"
    || Boolean(safeValue(params.get("ttclid"), 220));
}

const safeValue = (value: string | null, max: number) => String(value || "").trim().slice(0, max);

function readAttribution(): Attribution {
  const params = new URLSearchParams(window.location.search);
  const incoming: Attribution = {
    source: safeValue(params.get("utm_source"), 80).toLowerCase(),
    medium: safeValue(params.get("utm_medium"), 80).toLowerCase(),
    campaign: safeValue(params.get("utm_campaign"), 120),
    content: safeValue(params.get("utm_content"), 120),
    term: safeValue(params.get("utm_term"), 120),
    ttclid: safeValue(params.get("ttclid"), 220),
  };
  const hasIncoming = Boolean(incoming.source || incoming.campaign || incoming.ttclid);
  try {
    if (hasIncoming) {
      sessionStorage.setItem(attributionKey, JSON.stringify(incoming));
      localStorage.setItem(persistentAttributionKey, JSON.stringify({ ...incoming, savedAt: Date.now() }));
    }
    const sessionStored = JSON.parse(sessionStorage.getItem(attributionKey) || "{}");
    const persistentStored = JSON.parse(localStorage.getItem(persistentAttributionKey) || "{}");
    const persistedIsFresh = Number.isFinite(Number(persistentStored.savedAt))
      && Date.now() - Number(persistentStored.savedAt) <= attributionLifetimeMs;
    const stored = Object.keys(sessionStored).length ? sessionStored : persistedIsFresh ? persistentStored : {};
    if (!persistedIsFresh && persistentStored.savedAt) localStorage.removeItem(persistentAttributionKey);
    return {
      source: safeValue(hasIncoming ? incoming.source : stored.source, 80).toLowerCase() || "direct",
      medium: safeValue(hasIncoming ? incoming.medium : stored.medium, 80).toLowerCase() || "none",
      campaign: safeValue(hasIncoming ? incoming.campaign : stored.campaign, 120) || "(not set)",
      content: safeValue(hasIncoming ? incoming.content : stored.content, 120),
      term: safeValue(hasIncoming ? incoming.term : stored.term, 120),
      ttclid: safeValue(hasIncoming ? incoming.ttclid : stored.ttclid, 220),
    };
  } catch {
    return { ...incoming, source: incoming.source || "direct", medium: incoming.medium || "none", campaign: incoming.campaign || "(not set)" };
  }
}

function sessionId() {
  try {
    const existing = sessionStorage.getItem(sessionKey);
    if (existing) return existing;
    const value = crypto.randomUUID();
    sessionStorage.setItem(sessionKey, value);
    return value;
  } catch {
    return crypto.randomUUID();
  }
}

export async function trackPortfolioAdEvent(portfolioSlug: string, eventName: PortfolioAdEventName, authToken?: string | null, stableEventId?: string) {
  const consent = readPlugsyAdConsent();
  if (!consent.analytics && !consent.marketing) return { recorded: false, reason: "CONSENT_NOT_GRANTED" };
  const attribution = readAttribution();
  const eventId = stableEventId || crypto.randomUUID();
  try {
    sessionStorage.setItem(portfolioSlugKey, portfolioSlug);
    localStorage.setItem(persistentPortfolioSlugKey, JSON.stringify({ slug: portfolioSlug, savedAt: Date.now() }));
  } catch { /* attribution remains best effort */ }
  if (consent.marketing) {
    trackPlugsyTikTokEvent(tiktokPixelId, eventName, {
      content_id: portfolioSlug,
      content_name: `Portfolio: ${portfolioSlug}`,
      content_type: "product",
    }, eventId);
  } else window.ttq?.revokeConsent?.();
  const response = await fetch("/api/portfolio-ads?action=track", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    keepalive: true,
    body: JSON.stringify({
      eventName,
      eventId,
      sessionId: sessionId(),
      portfolioSlug,
      analyticsConsent: consent.analytics,
      marketingConsent: consent.marketing,
      attribution,
      pageUrl: window.location.href.slice(0, 500),
    }),
  });
  if (!response.ok) throw new Error("Portfolio event could not be recorded.");
  return response.json();
}

export async function trackPortfolioRegistration(authToken: string) {
  let portfolioSlug = "";
  try {
    portfolioSlug = String(sessionStorage.getItem(portfolioSlugKey) || "").trim();
    if (!portfolioSlug) {
      const persisted = JSON.parse(localStorage.getItem(persistentPortfolioSlugKey) || "{}");
      if (Date.now() - Number(persisted.savedAt || 0) <= attributionLifetimeMs) portfolioSlug = String(persisted.slug || "").trim();
    }
  } catch { /* no attributable portfolio */ }
  if (!portfolioSlug || !authToken) return { recorded: false, reason: "ATTRIBUTION_NOT_FOUND" };
  const consent = readPlugsyAdConsent();
  if (!consent.analytics && !consent.marketing) return { recorded: false, reason: "CONSENT_NOT_GRANTED" };
  const pending = { portfolioSlug, eventId: crypto.randomUUID(), createdAt: Date.now() };
  try { localStorage.setItem(pendingRegistrationKey, JSON.stringify(pending)); } catch { /* retry remains best effort */ }
  const result = await trackPortfolioAdEvent(portfolioSlug, "CompleteRegistration", authToken, pending.eventId);
  try { localStorage.removeItem(pendingRegistrationKey); } catch { /* no-op */ }
  return result;
}

export async function retryPendingPortfolioRegistration(authToken: string) {
  if (!authToken) return { recorded: false, reason: "AUTH_REQUIRED" };
  let pending: { portfolioSlug?: string; eventId?: string; createdAt?: number } = {};
  try { pending = JSON.parse(localStorage.getItem(pendingRegistrationKey) || "{}"); } catch { /* malformed pending state */ }
  const isFresh = Number.isFinite(Number(pending.createdAt))
    && Date.now() - Number(pending.createdAt) <= 30 * 60 * 1000;
  if (!isFresh || !pending.portfolioSlug || !pending.eventId) {
    try { localStorage.removeItem(pendingRegistrationKey); } catch { /* no-op */ }
    return { recorded: false, reason: "NO_PENDING_REGISTRATION" };
  }
  const result = await trackPortfolioAdEvent(pending.portfolioSlug, "CompleteRegistration", authToken, pending.eventId);
  try { localStorage.removeItem(pendingRegistrationKey); } catch { /* no-op */ }
  return result;
}
