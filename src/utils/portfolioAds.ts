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
const tiktokPixelId = "DB4HTERC77UFAQAVQO80";

export function readPlugsyAdConsent(): Consent {
  try {
    const value = JSON.parse(localStorage.getItem(consentKey) || "{}");
    return { analytics: value.analytics === true, marketing: value.marketing === true };
  } catch {
    return { analytics: false, marketing: false };
  }
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
    if (hasIncoming) sessionStorage.setItem(attributionKey, JSON.stringify(incoming));
    const stored = JSON.parse(sessionStorage.getItem(attributionKey) || "{}");
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

export async function trackPortfolioAdEvent(portfolioSlug: string, eventName: PortfolioAdEventName) {
  const consent = readPlugsyAdConsent();
  if (!consent.analytics && !consent.marketing) return { recorded: false, reason: "CONSENT_NOT_GRANTED" };
  const attribution = readAttribution();
  const eventId = crypto.randomUUID();
  if (consent.marketing) {
    trackPlugsyTikTokEvent(tiktokPixelId, eventName, {
      content_id: portfolioSlug,
      content_name: `Portfolio: ${portfolioSlug}`,
      content_type: "product",
    }, eventId);
  } else window.ttq?.revokeConsent?.();
  const response = await fetch("/api/portfolio-ads?action=track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
