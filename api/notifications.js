import { createClient } from "@supabase/supabase-js";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { randomUUID } from "node:crypto";
import { requireVerifiedClerkAdmin, requireVerifiedClerkUser } from "./_clerkAuth.js";
import { deterministicEventUuid, safeConfigurationStatus, sendOneSignal } from "./_oneSignal.js";
import { canonicalClerkId, resolveCanonicalClerkId } from "./_recipient.js";

const actionOf = (req) => {
  const parsed = new URL(req.originalUrl || req.url || "/", `http://${req.headers?.host || "localhost"}`);
  return String(req.query?.action || parsed.searchParams.get("action") || "").trim().toLowerCase();
};
const bodyOf = (req) => {
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body && typeof req.body === "object" ? req.body : {};
};
const fail = (res, status, code, message) => res.status(status).json({ success: false, code, error: message });
const serviceClient = () => {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
};
const safeOutcome = (res, result) => {
  const messages = {
    ONESIGNAL_CONFIGURATION_UNAVAILABLE: "OneSignal configuration is unavailable.",
    ONESIGNAL_AUTH_FAILED: "OneSignal authentication failed.",
    ONESIGNAL_TEMPORARILY_UNAVAILABLE: "OneSignal is temporarily unavailable.",
    ONESIGNAL_REQUEST_REJECTED: "OneSignal rejected the notification request.",
    ONESIGNAL_NO_ELIGIBLE_SUBSCRIPTIONS: "No eligible subscribers were found.",
    NOTIFICATION_CONTENT_INVALID: "Notification content is invalid.",
    NOTIFICATION_URL_INVALID: "The notification route is invalid.",
    ONESIGNAL_IDEMPOTENCY_INVALID: "Notification request identity is invalid.",
  };
  if (result.ok) return res.status(200).json({ success: true, code: result.code, messageId: result.messageId });
  return res.status(result.code === "ONESIGNAL_NO_ELIGIBLE_SUBSCRIPTIONS" ? 200 : 502).json({ success: false, code: result.code, error: messages[result.code] || "Notification could not be accepted." });
};
const actorId = (value) => /^user_[A-Za-z0-9_-]{3,}$/.test(String(value || "").trim()) ? String(value).trim() : "";
const recentEnough = (value) => { const time = Date.parse(value || ""); return Number.isFinite(time) && Date.now() - time >= 0 && Date.now() - time <= 10 * 60 * 1000; };
const messageText = (message) => {
  if (message.message_type === "image" || message.attachment_type === "image") return "Sent an image";
  if (message.message_type === "audio" || message.attachment_type === "audio/webm") return "Sent a voice note";
  if (message.message_type === "sticker") return "Sent a sticker";
  return String(message.content || "Sent a message").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 180) || "Sent a message";
};

async function requireAdmin(req, res, supabase) {
  return requireVerifiedClerkAdmin(req, res, supabase);
}

async function verifiedSegmentRecipients(supabase, segment) {
  const { data, error } = await supabase.from("push_subscriptions").select("user_id").not("onesignal_player_id", "is", null);
  if (error) return { error: true, ids: [] };
  const candidates = [...new Set(await Promise.all((data || []).map((row) => resolveCanonicalClerkId(supabase, row.user_id))))].filter(Boolean);
  const ids = [];
  for (const id of candidates) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("clerk_id", id).maybeSingle();
    let clerkAdmin = false;
    try { const user = await clerkClient.users.getUser(id); clerkAdmin = String(user?.publicMetadata?.role || user?.public_metadata?.role || "").toLowerCase() === "admin"; } catch { /* profile verification remains authoritative when Clerk lookup is unavailable */ }
    const admin = String(profile?.role || "").toLowerCase() === "admin" || clerkAdmin;
    if ((segment === "admin" && admin) || (segment === "user" && !admin)) ids.push(id);
  }
  return { error: false, ids: [...new Set(ids)].slice(0, 2000) };
}

async function notifyMessage(req, res, supabase) {
  if (req.method !== "POST") return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return;
  const messageId = String(bodyOf(req).messageId || "").trim();
  if (!messageId || messageId.length > 128) return fail(res, 400, "MESSAGE_ID_INVALID", "Message identity is invalid.");
  const { data: message, error: messageError } = await supabase.from("messages").select("id,chat_id,sender_id,sender_role,sender_name,content,message_type,attachment_type,created_at").eq("id", messageId).maybeSingle();
  if (messageError || !message) return fail(res, 404, "MESSAGE_NOT_FOUND", "Message was not found.");
  if (!recentEnough(message.created_at)) return fail(res, 409, "MESSAGE_TOO_OLD", "This message is no longer eligible for notification delivery.");
  if (message.sender_id !== actor.userId) return fail(res, 403, "MESSAGE_SENDER_REQUIRED", "Only the message sender can request delivery.");
  const { data: chat, error: chatError } = await supabase.from("chats").select("id,chat_type,user_id,name").eq("id", message.chat_id).maybeSingle();
  if (chatError || !chat) return fail(res, 404, "CHAT_NOT_FOUND", "Chat was not found.");
  const { data: actorProfile } = await supabase.from("profiles").select("role").eq("clerk_id", actor.userId).maybeSingle();
  const { data: memberships, error: memberError } = await supabase.from("chat_members").select("user_id").eq("chat_id", chat.id);
  if (memberError) return fail(res, 503, "CHAT_MEMBERS_UNAVAILABLE", "Chat recipients are temporarily unavailable.");
  const memberIds = [...new Set((memberships || []).map((row) => actorId(row.user_id)).filter(Boolean))];
  if (chat.chat_type === "support" || !chat.chat_type) {
    if (message.sender_role === "user") {
      const owner = await resolveCanonicalClerkId(supabase, chat.user_id);
      if (owner !== actor.userId) return fail(res, 403, "CHAT_MEMBERSHIP_REQUIRED", "Chat membership is required.");
      const admins = await verifiedSegmentRecipients(supabase, "admin");
      if (admins.error) return fail(res, 503, "RECIPIENT_LOOKUP_FAILED", "Notification recipients are temporarily unavailable.");
      if (!admins.ids.length) return safeOutcome(res, { ok: false, code: "ONESIGNAL_NO_ELIGIBLE_SUBSCRIPTIONS" });
      const result = await sendOneSignal({ title: "New message from a Plugsy user", body: messageText(message), url: "/admin/chats", targeting: { include_aliases: { external_id: admins.ids } }, requestKey: deterministicEventUuid("message", message.id) });
      return safeOutcome(res, result);
    }
    const clerkAdmin = String(actor.clerkUser?.publicMetadata?.role || actor.clerkUser?.public_metadata?.role || "").toLowerCase() === "admin";
    if (String(actorProfile?.role || "").toLowerCase() !== "admin" && !clerkAdmin) return fail(res, 403, "ADMIN_REQUIRED", "Admin access is required.");
    const owner = await resolveCanonicalClerkId(supabase, chat.user_id);
    if (!owner) return fail(res, 200, "ONESIGNAL_NO_ELIGIBLE_SUBSCRIPTIONS", "No eligible subscribers were found.");
    const result = await sendOneSignal({ title: "New message from Plugsy", body: messageText(message), url: "/dashboard/messages", targeting: { include_aliases: { external_id: [owner] } }, requestKey: deterministicEventUuid("message", message.id) });
    return safeOutcome(res, result);
  }
  if (!memberIds.includes(actor.userId)) return fail(res, 403, "CHAT_MEMBERSHIP_REQUIRED", "Chat membership is required.");
  const recipients = memberIds.filter((id) => id !== actor.userId).slice(0, 2000);
  if (recipients.length === 0) return fail(res, 200, "ONESIGNAL_NO_ELIGIBLE_SUBSCRIPTIONS", "No eligible subscribers were found.");
  const result = await sendOneSignal({ title: chat.chat_type === "channel" ? "New announcement" : `New message from ${String(message.sender_name || "a Plugsy member").slice(0, 60)}`, body: messageText(message), url: `/chats/${chat.id}`, targeting: { include_aliases: { external_id: recipients } }, requestKey: deterministicEventUuid("message", message.id) });
  return safeOutcome(res, result);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const action = actionOf(req);
  const body = bodyOf(req);
  const supabase = serviceClient();
  if (!supabase && ["register-subscription", "notify-message", "status", "get-subscriber-counts", "broadcast-all", "broadcast-segment"].includes(action)) return fail(res, 503, "NOTIFICATION_SERVICE_UNAVAILABLE", "Notification service is temporarily unavailable.");

  if (action === "register-subscription") {
    if (req.method !== "POST") return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    const actor = await requireVerifiedClerkUser(req, res); if (!actor) return;
    const subscriptionId = String(body.subscriptionId || "").trim();
    if (!subscriptionId || subscriptionId.length > 256) return fail(res, 400, "SUBSCRIPTION_INVALID", "Subscription details are invalid.");
    const { data: profile } = await supabase.from("profiles").select("role").eq("clerk_id", actor.userId).maybeSingle();
    const { error: saveError } = await supabase.from("push_subscriptions").upsert({ user_id: actor.userId, user_role: profile?.role || "user", onesignal_player_id: subscriptionId, subscription: { id: subscriptionId }, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (saveError) return fail(res, 503, "SUBSCRIPTION_SAVE_FAILED", "Your notification subscription could not be saved.");
    return res.status(200).json({ success: true });
  }
  if (action === "notify-message") return notifyMessage(req, res, supabase);
  if (action === "send-test-to-self") {
    if (req.method !== "POST") return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    const actor = await requireVerifiedClerkUser(req, res); if (!actor) return;
    const result = await sendOneSignal({ title: "Plugsy notification test", body: "This is an actor-scoped notification test.", url: "/dashboard", targeting: { include_aliases: { external_id: [actor.userId] } }, requestKey: body.requestKey || randomUUID() });
    return safeOutcome(res, result);
  }
  if (action === "status") {
    if (req.method !== "GET") return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    if (!await requireAdmin(req, res, supabase)) return;
    return res.status(200).json(safeConfigurationStatus());
  }
  if (action === "get-subscriber-counts") {
    if (req.method !== "GET") return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    if (!await requireAdmin(req, res, supabase)) return;
    const { data, error: countError } = await supabase.from("push_subscriptions").select("user_role,onesignal_player_id");
    if (countError) return fail(res, 503, "SUBSCRIBER_COUNT_UNAVAILABLE", "Subscriber counts are temporarily unavailable.");
    const rows = (data || []).filter((row) => row.onesignal_player_id);
    return res.status(200).json({ success: true, counts: { all: rows.length, user: rows.filter((row) => row.user_role === "user").length, admin: rows.filter((row) => row.user_role === "admin").length } });
  }
  if (!["broadcast-all", "broadcast-segment", "send-test-to-self"].includes(action)) return fail(res, 404, "NOTIFICATION_ACTION_UNAVAILABLE", "Notification action is unavailable.");
  if (req.method !== "POST") return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  const actor = await requireAdmin(req, res, supabase); if (!actor) return;
  let targeting = action === "broadcast-all" ? { included_segments: ["Subscribed Users"] } : null;
  if (action === "broadcast-segment" && ["user", "admin"].includes(body.segment)) {
    const recipients = await verifiedSegmentRecipients(supabase, body.segment);
    if (recipients.error) return fail(res, 503, "RECIPIENT_LOOKUP_FAILED", "Notification recipients are temporarily unavailable.");
    if (!recipients.ids.length) return safeOutcome(res, { ok: false, code: "ONESIGNAL_NO_ELIGIBLE_SUBSCRIPTIONS" });
    targeting = { include_aliases: { external_id: recipients.ids } };
  }
  if (!targeting) return fail(res, 400, "NOTIFICATION_TARGET_INVALID", "Notification target is invalid.");
  const result = await sendOneSignal({ title: body.title, body: body.body, url: body.url, targeting, requestKey: body.requestKey || randomUUID() });
  return safeOutcome(res, result);
}
