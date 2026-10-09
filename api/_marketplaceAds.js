import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const text = (value) => String(value || "").trim();

function key() {
  const value = text(process.env.MARKETPLACE_ADS_ENCRYPTION_KEY);
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("MARKETPLACE_ADS_ENCRYPTION_KEY must be a 32-byte hex key.");
  return Buffer.from(value, "hex");
}

export function encryptMarketplaceAdToken(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${ciphertext.toString("hex")}`;
}

export function decryptMarketplaceAdToken(value) {
  const [iv, tag, ciphertext] = text(value).split(".");
  if (!/^[a-f0-9]{24}$/i.test(iv || "") || !/^[a-f0-9]{32}$/i.test(tag || "") || !/^[a-f0-9]+$/i.test(ciphertext || "")) throw new Error("AD_TOKEN_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "hex")), decipher.final()]).toString("utf8");
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export async function sendMarketplacePurchaseEvents(supabase, { sellerId, listing, reference, amount, currency = "NGN", email = "", sourceUrl = "", userAgent = "", ip = "" }) {
  const { data: config, error } = await supabase.from("marketplace_ad_integrations")
    .select("meta_pixel_id,meta_access_token_encrypted,tiktok_pixel_id,tiktok_access_token_encrypted")
    .eq("seller_id", sellerId).maybeSingle();
  if (error) throw error;
  if (!config) return;
  const time = Math.floor(Date.now() / 1000);
  const normalizedEmail = text(email).toLowerCase();
  const hashedEmail = normalizedEmail ? sha256(normalizedEmail) : undefined;
  const tasks = [];

  if (config.meta_pixel_id && config.meta_access_token_encrypted) tasks.push((async () => {
    const version = /^v\d+\.\d+$/.test(text(process.env.META_GRAPH_API_VERSION)) ? text(process.env.META_GRAPH_API_VERSION) : "v26.0";
    const accessToken = decryptMarketplaceAdToken(config.meta_access_token_encrypted);
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(config.meta_pixel_id)}/events?access_token=${encodeURIComponent(accessToken)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [{ event_name: "Purchase", event_time: time, event_id: reference, action_source: "website", event_source_url: sourceUrl || undefined,
        user_data: { em: hashedEmail ? [hashedEmail] : undefined, client_user_agent: userAgent || undefined, client_ip_address: ip || undefined },
        custom_data: { currency, value: Number(amount), content_ids: [listing.id], content_name: listing.title, content_type: "product" } }] }),
    });
    if (!response.ok) throw new Error(`Meta Conversions API returned ${response.status}.`);
  })());

  if (config.tiktok_pixel_id && config.tiktok_access_token_encrypted) tasks.push((async () => {
    const accessToken = decryptMarketplaceAdToken(config.tiktok_access_token_encrypted);
    const response = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
      method: "POST", headers: { "Content-Type": "application/json", "Access-Token": accessToken },
      body: JSON.stringify({ event_source: "web", event_source_id: config.tiktok_pixel_id, data: [{ event: "Purchase", event_time: time, event_id: reference,
        user: { email: hashedEmail }, page: { url: sourceUrl || undefined }, properties: { currency, value: Number(amount), contents: [{ content_id: listing.id, content_name: listing.title, content_type: "product", price: Number(amount), quantity: 1 }] } }] }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || (result?.code !== undefined && Number(result.code) !== 0)) throw new Error(`TikTok Events API returned ${response.status}.`);
  })());

  const results = await Promise.allSettled(tasks);
  for (const result of results) if (result.status === "rejected") console.error("[marketplace] ad purchase event pending", result.reason?.message || result.reason);
}
