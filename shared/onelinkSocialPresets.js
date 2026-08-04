import { normalizeExternalUrl } from "./onelink.js";

const PRESETS = Object.freeze({
  instagram: { label: "Instagram username", host: "instagram.com", path: (value) => `/${value}` },
  tiktok: { label: "TikTok username", host: "tiktok.com", path: (value) => `/@${value}`, at: true },
  x: { label: "X username", host: "x.com", path: (value) => `/${value}` },
  facebook: { label: "Facebook username", host: "facebook.com", path: (value) => `/${value}` },
  linkedin: { label: "LinkedIn profile slug", host: "linkedin.com", path: (value) => `/in/${value}` },
  youtube: { label: "YouTube handle", host: "youtube.com", path: (value) => `/@${value}`, at: true },
  whatsapp: { label: "WhatsApp number", host: "wa.me", phone: true },
  telegram: { label: "Telegram username", host: "t.me", path: (value) => `/${value}` },
  snapchat: { label: "Snapchat username", host: "snapchat.com", path: (value) => `/add/${value}` },
  github: { label: "GitHub username", host: "github.com", path: (value) => `/${value}` },
  behance: { label: "Behance username", host: "behance.net", path: (value) => `/${value}` },
  dribbble: { label: "Dribbble username", host: "dribbble.com", path: (value) => `/${value}` },
});

const HOST_ALIASES = Object.freeze({
  instagram: ["instagram.com"], tiktok: ["tiktok.com"], x: ["x.com", "twitter.com"],
  facebook: ["facebook.com"], linkedin: ["linkedin.com"], youtube: ["youtube.com"],
  whatsapp: ["wa.me", "api.whatsapp.com"], telegram: ["t.me", "telegram.me"],
  snapchat: ["snapchat.com"], github: ["github.com"], behance: ["behance.net"], dribbble: ["dribbble.com"],
});
const CONTROL = /[\u0000-\u001F\u007F]/;
const HANDLE = /^[A-Za-z0-9._-]{1,64}$/;

/** @param {string} platform */
export function getOneLinkSocialPreset(platform) {
  return PRESETS[String(platform || "").trim().toLowerCase()] || null;
}

/** @param {string} platform */
export function supportsOneLinkSocialHandle(platform) {
  return Boolean(getOneLinkSocialPreset(platform));
}

/** @param {string} platform @param {unknown} input */
export function normalizeOneLinkSocialInput(platform, input) {
  const preset = getOneLinkSocialPreset(platform);
  const rawInput = typeof input === "string" ? input : "";
  const raw = rawInput.trim();
  if (!preset || !raw || CONTROL.test(rawInput)) return { valid: false, input: raw, value: "", code: "SOCIAL_HANDLE_INVALID" };
  if (preset.phone) {
    const value = raw.replace(/[+\s()\-]/g, "");
    if (!/^\d{8,15}$/.test(value)) return { valid: false, input: raw, value: "", code: "WHATSAPP_NUMBER_INVALID" };
    return { valid: true, input: raw, value, code: "OK" };
  }
  const value = raw.replace(/^@+/, "");
  if (!value || /[\s\\/?#:]/.test(value) || !HANDLE.test(value)) return { valid: false, input: raw, value: "", code: "SOCIAL_HANDLE_INVALID" };
  return { valid: true, input: raw, value, code: "OK" };
}

/** @param {string} platform @param {unknown} input */
export function buildOneLinkSocialUrl(platform, input) {
  const preset = getOneLinkSocialPreset(platform);
  const normalized = normalizeOneLinkSocialInput(platform, input);
  if (!preset || !normalized.valid) return { valid: false, input: normalized.input, url: "", code: normalized.code };
  const url = preset.phone ? `https://wa.me/${normalized.value}` : `https://${preset.host}${preset.path(normalized.value)}`;
  return normalizeExternalUrl(url) ? { valid: true, input: normalized.input, url, code: "OK" } : { valid: false, input: normalized.input, url: "", code: "SOCIAL_URL_INVALID" };
}

/** @param {string} platform @param {unknown} url */
export function parseOneLinkSocialUrl(platform, url) {
  const preset = getOneLinkSocialPreset(platform);
  const normalizedUrl = normalizeExternalUrl(url);
  if (!preset || !normalizedUrl) return null;
  try {
    const parsed = new URL(normalizedUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!(HOST_ALIASES[platform] || []).includes(host) || parsed.username || parsed.password || parsed.hash || (parsed.search && !(platform === "whatsapp" && host === "api.whatsapp.com"))) return null;
    if (preset.phone && host === "api.whatsapp.com") {
      const phone = parsed.searchParams.get("phone") || "";
      const result = normalizeOneLinkSocialInput(platform, phone);
      return result.valid ? result.value : null;
    }
    const path = parsed.pathname.replace(/\/$/, "");
    let value = "";
    if (platform === "linkedin") value = path.match(/^\/in\/([^/]+)$/i)?.[1] || "";
    else if (platform === "youtube") value = path.match(/^\/@([^/]+)$/i)?.[1] || "";
    else if (platform === "tiktok") value = path.match(/^\/@([^/]+)$/i)?.[1] || "";
    else if (platform === "snapchat") value = path.match(/^\/add\/([^/]+)$/i)?.[1] || "";
    else if (platform === "whatsapp") value = path.match(/^\/([^/]+)$/)?.[1] || "";
    else value = path.match(/^\/([^/]+)$/)?.[1] || "";
    const result = normalizeOneLinkSocialInput(platform, value);
    return result.valid ? result.value : null;
  } catch { return null; }
}

/** @param {string} platform @param {unknown} input */
export function parseOneLinkSocialInput(platform, input) {
  return normalizeOneLinkSocialInput(platform, input);
}

/** @param {Array<{platform?: string, url?: string}>} socials */
export function findDuplicateOneLinkSocialUrls(socials) {
  const counts = new Map();
  for (const social of Array.isArray(socials) ? socials : []) {
    const url = normalizeExternalUrl(social?.url);
    if (url) counts.set(url, (counts.get(url) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([url]) => url));
}

/** @param {Array<{platform?: string}>} socials */
export function findDuplicateOneLinkSocialPlatforms(socials) {
  const counts = new Map();
  for (const social of Array.isArray(socials) ? socials : []) {
    const platform = String(social?.platform || "").trim().toLowerCase();
    if (platform) counts.set(platform, (counts.get(platform) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([platform]) => platform));
}

/** @param {number} currentIndex @param {"next"|"previous"|"first"|"last"} direction @param {number[]} enabledIndices @param {number} total */
export function getNextOneLinkSocialPickerIndex(currentIndex, direction, enabledIndices, total) {
  const enabled = [...new Set((enabledIndices || []).filter((index) => Number.isInteger(index) && index >= 0 && index < total))].sort((a, b) => a - b);
  if (!enabled.length) return -1;
  if (direction === "first") return enabled[0];
  if (direction === "last") return enabled[enabled.length - 1];
  const position = enabled.indexOf(currentIndex);
  if (position < 0) return direction === "next" ? enabled[0] : enabled[enabled.length - 1];
  return enabled[(position + (direction === "next" ? 1 : -1) + enabled.length) % enabled.length];
}

/**
 * Apply the first-valid enablement rule without persisting editor-only state.
 * @param {{currentEnabled?: boolean, autoEnableEligible?: boolean, valid: boolean}} state
 * @returns {{enabled: boolean, autoEnableEligible: boolean}}
 */
export function resolveOneLinkSocialEnablement({ currentEnabled = false, autoEnableEligible = false, valid }) {
  if (!valid) return { enabled: false, autoEnableEligible };
  if (autoEnableEligible) return { enabled: true, autoEnableEligible: false };
  return { enabled: Boolean(currentEnabled), autoEnableEligible: false };
}

/** @param {boolean} checked @returns {{enabled: boolean, autoEnableEligible: boolean}} */
export function applyManualOneLinkSocialEnablement(checked) {
  return { enabled: Boolean(checked), autoEnableEligible: false };
}
