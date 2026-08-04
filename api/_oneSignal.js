import { createHash } from "node:crypto";

const PROVIDER_URL = "https://api.onesignal.com/notifications";
const DEFAULT_URL = "https://www.plugsy.ng/dashboard";
const MAX_TITLE_LENGTH = 65;
const MAX_BODY_LENGTH = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const text = (value) => (typeof value === "string" ? value.trim() : "");

export const isUuid = (value) => UUID_PATTERN.test(text(value));
export const deterministicEventUuid = (namespace, eventId) => {
  const digest = createHash("sha256").update(`${text(namespace)}:${text(eventId)}`).digest("hex");
  const variant = ((parseInt(digest.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(18, 20)}-${digest.slice(20, 32)}`;
};

export const getOneSignalConfiguration = () => {
  const appId = text(process.env.ONESIGNAL_APP_ID);
  const appApiKey = text(process.env.ONESIGNAL_APP_API_KEY) || text(process.env.ONESIGNAL_REST_API_KEY);
  return {
    appId,
    appApiKey,
    configured: Boolean(appId && appApiKey),
    appIdConfigured: Boolean(appId),
    appApiKeyConfigured: Boolean(appApiKey),
    deprecatedKeyFallbackActive: Boolean(!text(process.env.ONESIGNAL_APP_API_KEY) && text(process.env.ONESIGNAL_REST_API_KEY)),
  };
};

export const safeConfigurationStatus = () => {
  const config = getOneSignalConfiguration();
  return {
    success: true,
    configured: config.configured,
    appIdConfigured: config.appIdConfigured,
    appApiKeyConfigured: config.appApiKeyConfigured,
    clientAppIdExpected: true,
    deprecatedKeyFallbackActive: config.deprecatedKeyFallbackActive,
  };
};

export const validateInternalRoute = (value) => {
  const route = text(value) || "/dashboard";
  if (
    route.length > 512 ||
    !route.startsWith("/") ||
    route.startsWith("//") ||
    route.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(route) ||
    /^(?:javascript|data|https?):/i.test(route) ||
    route.includes("@")
  ) return null;
  try {
    const parsed = new URL(route, "https://www.plugsy.ng");
    if (parsed.origin !== "https://www.plugsy.ng") return null;
  } catch { return null; }
  return route;
};

const validContent = (value, limit) => {
  const result = text(value);
  return result && result.length <= limit && !/[\u0000-\u001F\u007F]/.test(result) ? result : null;
};

export const buildOneSignalPayload = ({ title, body, url, targeting, idempotencyKey }) => {
  if (!targeting || typeof targeting !== "object" || Array.isArray(targeting)) {
    throw new Error("ONESIGNAL_TARGETING_REQUIRED");
  }
  const methods = ["included_segments", "filters", "include_aliases", "include_subscription_ids"]
    .filter((key) => targeting[key] !== undefined);
  if (methods.length !== 1) throw new Error("ONESIGNAL_TARGETING_INVALID");
  const route = validateInternalRoute(url);
  if (!route) throw new Error("NOTIFICATION_URL_INVALID");
  const validTitle = validContent(title, MAX_TITLE_LENGTH);
  const validBody = validContent(body, MAX_BODY_LENGTH);
  if (!validTitle || !validBody) throw new Error("NOTIFICATION_CONTENT_INVALID");
  if (idempotencyKey !== undefined && !isUuid(idempotencyKey)) throw new Error("ONESIGNAL_IDEMPOTENCY_INVALID");
  const payload = {
    app_id: getOneSignalConfiguration().appId,
    target_channel: "push",
    headings: { en: validTitle },
    contents: { en: validBody },
    url: `https://www.plugsy.ng${route}`,
    ...targeting,
  };
  if (idempotencyKey) payload.idempotency_key = idempotencyKey;
  if (Array.isArray(payload.include_subscription_ids)) {
    payload.include_subscription_ids = [...new Set(payload.include_subscription_ids.map(text).filter(Boolean))];
    if (payload.include_subscription_ids.length === 0) throw new Error("ONESIGNAL_TARGETING_INVALID");
  }
  if (!payload.headings.en || !payload.contents.en) throw new Error("NOTIFICATION_CONTENT_REQUIRED");
  return payload;
};

export const mapOneSignalFailure = (status, network = false) => {
  if (network || status === 408 || status === 429 || status >= 500) return "ONESIGNAL_TEMPORARILY_UNAVAILABLE";
  if (status === 401 || status === 403) return "ONESIGNAL_AUTH_FAILED";
  if (status === 400) return "ONESIGNAL_REQUEST_REJECTED";
  return "ONESIGNAL_INVALID_RESPONSE";
};

export async function sendOneSignal({ title, body, url, targeting, requestKey = undefined }) {
  const config = getOneSignalConfiguration();
  if (!config.configured) return { ok: false, code: "ONESIGNAL_CONFIGURATION_UNAVAILABLE" };
  let payload;
  try { payload = buildOneSignalPayload({ title, body, url, targeting, idempotencyKey: requestKey }); }
  catch (error) { return { ok: false, code: error.message === "NOTIFICATION_URL_INVALID" ? error.message : "ONESIGNAL_REQUEST_REJECTED" }; }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(PROVIDER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${config.appApiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) return { ok: false, code: mapOneSignalFailure(response.status) };
    const id = text(data?.id || data?.message_id);
    if (!id) return { ok: false, code: "ONESIGNAL_NO_ELIGIBLE_SUBSCRIPTIONS" };
    return { ok: true, code: "ONESIGNAL_ACCEPTED", messageId: id };
  } catch {
    return { ok: false, code: mapOneSignalFailure(0, true) };
  } finally { clearTimeout(timeout); }
}

export const oneSignalProviderUrl = PROVIDER_URL;
export const oneSignalDefaultUrl = DEFAULT_URL;
