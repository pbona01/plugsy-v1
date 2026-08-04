import { createClient } from "@supabase/supabase-js";
import { requireVerifiedClerkUser } from "./_clerkAuth.js";
import { getOneSignalConfiguration, safeConfigurationStatus, sendOneSignal } from "./_oneSignal.js";

const getAction = (req) => {
  const parsed = new URL(req.originalUrl || req.url || "/", `http://${req.headers?.host || "localhost"}`);
  return String(req.query?.action || parsed.searchParams.get("action") || "").trim().toLowerCase();
};
const getBody = (req) => {
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body && typeof req.body === "object" ? req.body : {};
};
const error = (res, status, code, message) => res.status(status).json({ success: false, code, error: message });
const isAdmin = (actor, profile) => String(profile?.role || actor.clerkUser?.publicMetadata?.role || actor.clerkUser?.public_metadata?.role || "").toLowerCase() === "admin";
const getServiceClient = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
};
const safeProviderMessage = (result) => result.providerMessage ? ` Provider: ${result.providerMessage}` : "";
const outcome = (res, result, admin = false) => {
  if (result.ok) return res.status(200).json({ success: true, code: result.code, messageId: result.messageId });
  const messages = {
    ONESIGNAL_CONFIGURATION_UNAVAILABLE: "OneSignal configuration is unavailable.",
    ONESIGNAL_AUTH_FAILED: "OneSignal authentication failed.",
    ONESIGNAL_TEMPORARILY_UNAVAILABLE: "OneSignal is temporarily unavailable.",
    ONESIGNAL_REQUEST_REJECTED: "OneSignal rejected the notification request.",
    ONESIGNAL_NO_ELIGIBLE_SUBSCRIPTIONS: "No eligible subscribers were found.",
    NOTIFICATION_URL_INVALID: "The action URL must be an internal Plugsy route.",
  };
  return res.status(result.code === "ONESIGNAL_NO_ELIGIBLE_SUBSCRIPTIONS" ? 200 : 502).json({
    success: false, code: result.code, error: messages[result.code] || "Notification could not be accepted.",
    ...(admin ? { detail: safeProviderMessage(result).trim() } : {}),
  });
};

async function requireAdmin(req, res) {
  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return null;
  const supabase = getServiceClient();
  if (!supabase) { error(res, 503, "NOTIFICATION_SERVICE_UNAVAILABLE", "Notification service is temporarily unavailable."); return null; }
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("clerk_id", actor.userId).maybeSingle();
  if (profileError) { error(res, 503, "ADMIN_LOOKUP_FAILED", "Your admin access could not be verified."); return null; }
  if (!isAdmin(actor, profile)) { error(res, 403, "ADMIN_REQUIRED", "Admin access is required."); return null; }
  return { actor, supabase };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const action = getAction(req);
  const body = getBody(req);

  if (action === "register-subscription") {
    if (req.method !== "POST") return error(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    const actor = await requireVerifiedClerkUser(req, res);
    if (!actor) return;
    const subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId.trim() : "";
    if (!subscriptionId || subscriptionId.length > 256) return error(res, 400, "SUBSCRIPTION_INVALID", "Subscription details are invalid.");
    const supabase = getServiceClient();
    if (!supabase) return error(res, 503, "NOTIFICATION_SERVICE_UNAVAILABLE", "Notification service is temporarily unavailable.");
    const { data: profile } = await supabase.from("profiles").select("role").eq("clerk_id", actor.userId).maybeSingle();
    const { error: saveError } = await supabase.from("push_subscriptions").upsert({ user_id: actor.userId, user_role: profile?.role || "user", onesignal_player_id: subscriptionId, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (saveError) return error(res, 503, "SUBSCRIPTION_SAVE_FAILED", "Your notification subscription could not be saved.");
    return res.status(200).json({ success: true });
  }

  if (action === "status") {
    if (req.method !== "GET") return error(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    if (!await requireAdmin(req, res)) return;
    return res.status(200).json(safeConfigurationStatus());
  }

  if (action === "get-subscriber-counts") {
    if (req.method !== "GET") return error(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { data, error: queryError } = await access.supabase.from("push_subscriptions").select("user_role, onesignal_player_id");
    if (queryError) return error(res, 503, "SUBSCRIBER_COUNT_UNAVAILABLE", "Subscriber counts are temporarily unavailable.");
    const rows = (data || []).filter((row) => typeof row.onesignal_player_id === "string" && row.onesignal_player_id.trim());
    return res.status(200).json({ success: true, counts: { all: rows.length, user: rows.filter((row) => row.user_role === "user").length, admin: rows.filter((row) => row.user_role === "admin").length } });
  }

  if (!["broadcast-all", "broadcast-segment", "send-test-to-self"].includes(action)) {
    return error(res, 404, "NOTIFICATION_ACTION_UNAVAILABLE", "Notification action is unavailable.");
  }
  if (req.method !== "POST") return error(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  const access = await requireAdmin(req, res);
  if (!access) return;
  const { actor } = access;
  const title = body.title;
  const message = body.body;
  const url = body.url;
  let targeting;
  if (action === "broadcast-all") targeting = { included_segments: ["Subscribed Users"] };
  else if (action === "broadcast-segment" && ["user", "admin"].includes(body.segment)) targeting = { filters: [{ field: "tag", key: "user_role", relation: "=", value: body.segment }] };
  else if (action === "send-test-to-self") targeting = { include_aliases: { external_id: [actor.userId] } };
  else return error(res, 400, "NOTIFICATION_TARGET_INVALID", "Notification target is invalid.");
  const result = await sendOneSignal({ title, body: message, url, targeting, requestKey: body.requestKey });
  return outcome(res, result, true);
}
