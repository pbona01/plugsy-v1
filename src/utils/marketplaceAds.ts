export type MarketplaceAdPixels = { metaPixelId?: string | null; tiktokPixelId?: string | null };
export type MarketplaceAdProduct = { id: string; title: string; category?: string; price: number; currency?: string };

const consentKey = "plugsy:marketplace:cookie-consent:v1";
const getMarketingConsent = () => {
  try { return JSON.parse(localStorage.getItem(consentKey) || "{}").marketing === true; }
  catch { return false; }
};

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: (...args: any[]) => void;
    ttq?: any;
    __plugsyMetaPixels?: Set<string>;
    __plugsyTikTokPixels?: Set<string>;
  }
}

function ensureMeta(id: string) {
  window.__plugsyMetaPixels ||= new Set<string>();
  if (!window.fbq) {
    const fbq: any = function (...args: any[]) { fbq.callMethod ? fbq.callMethod.apply(fbq, args) : fbq.queue.push(args); };
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = [];
    window.fbq = fbq;
    const script = document.createElement("script"); script.async = true; script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
  if (!window.__plugsyMetaPixels.has(id)) { window.fbq("init", id); window.__plugsyMetaPixels.add(id); }
}

function ensureTikTok(id: string) {
  window.__plugsyTikTokPixels ||= new Set<string>();
  if (!window.ttq) {
    const ttq: any = window.ttq = [];
    ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
    ttq.setAndDefer = (target: any, method: string) => { target[method] = (...args: any[]) => { target.push([method, ...args]); }; };
    ttq.methods.forEach((method: string) => ttq.setAndDefer(ttq, method));
    ttq._i = {}; ttq._t = {}; ttq._o = {};
    ttq.instance = (pixel: string) => { const instance = ttq._i[pixel] || []; ttq.methods.forEach((method: string) => ttq.setAndDefer(instance, method)); return instance; };
    ttq.load = (pixel: string, options?: any) => { ttq._i[pixel] = []; ttq._t[pixel] = Date.now(); ttq._o[pixel] = options || {}; const script = document.createElement("script"); script.async = true; script.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(pixel)}&lib=ttq`; document.head.appendChild(script); };
  }
  if (!window.__plugsyTikTokPixels.has(id)) { window.ttq.load(id); window.__plugsyTikTokPixels.add(id); }
}

export function trackMarketplaceProductView(pixels: MarketplaceAdPixels | null | undefined, product: MarketplaceAdProduct) {
  if (!getMarketingConsent()) return;
  if (pixels?.metaPixelId) {
    ensureMeta(pixels.metaPixelId);
    window.fbq?.("track", "ViewContent", { content_ids: [product.id], content_name: product.title, content_category: product.category, content_type: "product", value: product.price, currency: product.currency || "NGN" });
  }
  if (pixels?.tiktokPixelId) {
    ensureTikTok(pixels.tiktokPixelId);
    window.ttq?.instance?.(pixels.tiktokPixelId)?.track?.("ViewContent", { content_id: product.id, content_name: product.title, content_category: product.category, content_type: "product", value: product.price, currency: product.currency || "NGN" });
  }
}

export function trackMarketplaceCheckout(pixels: MarketplaceAdPixels | null | undefined, product: MarketplaceAdProduct) {
  if (!getMarketingConsent()) return;
  if (pixels?.metaPixelId) { ensureMeta(pixels.metaPixelId); window.fbq?.("track", "InitiateCheckout", { content_ids: [product.id], content_name: product.title, value: product.price, currency: product.currency || "NGN" }); }
  if (pixels?.tiktokPixelId) { ensureTikTok(pixels.tiktokPixelId); window.ttq?.instance?.(pixels.tiktokPixelId)?.track?.("InitiateCheckout", { content_id: product.id, content_name: product.title, value: product.price, currency: product.currency || "NGN" }); }
}

export function trackMarketplacePurchase(pixels: MarketplaceAdPixels | null | undefined, product: MarketplaceAdProduct, eventId: string, value = product.price) {
  if (!eventId || !getMarketingConsent()) return;
  const amount = Number(value || 0);
  if (pixels?.metaPixelId) { ensureMeta(pixels.metaPixelId); window.fbq?.("track", "Purchase", { content_ids: [product.id], content_name: product.title, content_type: "product", value: amount, currency: product.currency || "NGN" }, { eventID: eventId }); }
  if (pixels?.tiktokPixelId) { ensureTikTok(pixels.tiktokPixelId); window.ttq?.instance?.(pixels.tiktokPixelId)?.track?.("Purchase", { content_id: product.id, content_name: product.title, content_type: "product", value: amount, currency: product.currency || "NGN" }, { event_id: eventId }); }
}

export function marketplaceMarketingConsent() { return getMarketingConsent(); }
