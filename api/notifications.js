import { createClient } from "@supabase/supabase-js";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { randomUUID } from "node:crypto";
import { requireVerifiedClerkAdmin, requireVerifiedClerkUser } from "./_clerkAuth.js";
import { deterministicEventUuid, safeConfigurationStatus, sendOneSignal } from "./_oneSignal.js";
import { canonicalizeChatMembers, classifyVerifiedAudience, isSupportChat, resolveCanonicalClerkId } from "./_recipient.js";
import { subscriptionActorCode } from "./_subscriptionAuth.js";

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

const AUDIENCE_LIMIT = 20000;
async function verifiedSegmentRecipients(supabase, segment) {
  const pageSize = 500;
  const rows = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase.from("push_subscriptions").select("user_id").not("onesignal_player_id", "is", null).range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) return { error: true, code: "RECIPIENT_LOOKUP_FAILED", ids: [] };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  const candidates = [...new Set((await canonicalizeChatMembers(supabase, rows)).filter(Boolean))];
  if (candidates.length > AUDIENCE_LIMIT) return { error: true, code: "AUDIENCE_LIMIT_EXCEEDED", ids: [], adminIds: [], userIds: [] };
  const profiles = new Map();
  for (let offset = 0; offset < candidates.length; offset += 500) {
    const batch = candidates.slice(offset, offset + 500);
    const { data, error } = await supabase.from("profiles").select("clerk_id,role").in("clerk_id", batch);
    if (error) return { error: true, code: "RECIPIENT_LOOKUP_FAILED", ids: [] };
    for (const profile of data || []) profiles.set(profile.clerk_id, String(profile.role || "").toLowerCase() === "admin");
  }
  const clerkAdmins = new Map();
  try {
    for (let offset = 0; ; offset += 100) {
      const users = await clerkClient.users.getUserList({ limit: 100, offset });
      for (const user of users || []) clerkAdmins.set(user.id, String(user.publicMetadata?.role || user.public_metadata?.role || "").toLowerCase() === "admin");
      if (!users || users.length < 100) break;
    }
  } catch {
    return { error: true, code: "CLERK_AUDIENCE_LOOKUP_FAILED", ids: [] };
  }
  const classified = classifyVerifiedAudience(candidates, new Set([...profiles].filter(([, admin]) => admin).map(([id]) => id)), new Set([...clerkAdmins].filter(([, admin]) => admin).map(([id]) => id)), AUDIENCE_LIMIT);
  if (classified.error) return { error: true, code: classified.code, ids: [], adminIds: [], userIds: [] };
  const ids = segment === "admin"
    ? classified.admin
    : segment === "user"
      ? classified.user
      : [...classified.admin, ...classified.user];
  return { error: false, code: "OK", ids, adminIds: classified.admin, userIds: classified.user };
}

export async function collectVerifiedAudience(supabase) {
  // Classify once. The old implementation scanned every push subscription and
  // every Clerk user twice just to render the admin subscriber counts.
  const audience = await verifiedSegmentRecipients(supabase, "all");
  if (audience.error) return { error: true, code: audience.code, admin: [], user: [] };
  return { error: false, admin: audience.adminIds, user: audience.userIds };
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
  const memberIds = await canonicalizeChatMembers(supabase, memberships || []);
  if (isSupportChat(chat)) {
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
  const recipients = memberIds.filter((id) => id !== actor.userId);
  if (String(chat.chat_type || "").toLowerCase() === "dm" && recipients.length !== 1) {
    return fail(res, 409, "DM_RECIPIENT_INVALID", "This direct message recipient set is invalid.");
  }
  if (recipients.length > 20000) return fail(res, 413, "AUDIENCE_LIMIT_EXCEEDED", "This chat has too many notification recipients.");
  if (recipients.length === 0) return fail(res, 200, "ONESIGNAL_NO_ELIGIBLE_SUBSCRIPTIONS", "No eligible subscribers were found.");
  const result = await sendOneSignal({ title: chat.chat_type === "channel" ? "New announcement" : `New message from ${String(message.sender_name || "a Plugsy member").slice(0, 60)}`, body: messageText(message), url: `/chats/${chat.id}`, targeting: { include_aliases: { external_id: recipients } }, requestKey: deterministicEventUuid("message", message.id) });
  return safeOutcome(res, result);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const action = actionOf(req);
  const body = bodyOf(req);
  const supabase = serviceClient();
  if (!supabase && ["register-subscription", "unregister-subscription", "subscription-status", "notify-message", "status", "get-subscriber-counts", "broadcast-all", "broadcast-segment"].includes(action)) return fail(res, 503, "NOTIFICATION_SERVICE_UNAVAILABLE", "Notification service is temporarily unavailable.");

  if (action === "register-subscription") {
    if (req.method !== "POST") return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    const actor = await requireVerifiedClerkUser(req, res); if (!actor) return;
    if (subscriptionActorCode(body.expectedUserId, actor.userId) !== "OK") return fail(res, 409, "SUBSCRIPTION_ACTOR_CHANGED", "Subscription ownership changed.");
    const subscriptionId = String(body.subscriptionId || "").trim();
    if (!subscriptionId || subscriptionId.length > 256) return fail(res, 400, "SUBSCRIPTION_INVALID", "Subscription details are invalid.");
    const { data: profile } = await supabase.from("profiles").select("role").eq("clerk_id", actor.userId).maybeSingle();
    const { error: saveError } = await supabase.from("push_subscriptions").upsert({ user_id: actor.userId, user_role: profile?.role || "user", onesignal_player_id: subscriptionId, subscription: { id: subscriptionId, playerId: subscriptionId }, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (saveError) return fail(res, 503, "SUBSCRIPTION_SAVE_FAILED", "Your notification subscription could not be saved.");
    return res.status(200).json({ success: true });
  }
  if (action === "unregister-subscription") {
    if (req.method !== "POST") return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    const actor = await requireVerifiedClerkUser(req, res); if (!actor) return;
    if (subscriptionActorCode(body.expectedUserId, actor.userId) !== "OK") return fail(res, 409, "SUBSCRIPTION_ACTOR_CHANGED", "Subscription ownership changed.");
    const { error } = await supabase.from("push_subscriptions").update({ onesignal_player_id: null, subscription: null, updated_at: new Date().toISOString() }).eq("user_id", actor.userId);
    if (error) return fail(res, 503, "SUBSCRIPTION_SAVE_FAILED", "Your notification subscription could not be updated.");
    return res.status(200).json({ success: true });
  }
  if (action === "subscription-status") {
    if (req.method !== "GET") return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    const actor = await requireVerifiedClerkUser(req, res); if (!actor) return;
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("onesignal_player_id")
      .eq("user_id", actor.userId)
      .maybeSingle();
    if (error) return fail(res, 503, "SUBSCRIPTION_STATUS_UNAVAILABLE", "Notification status is temporarily unavailable.");
    return res.status(200).json({ success: true, registered: Boolean(data?.onesignal_player_id) });
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
    const audience = await collectVerifiedAudience(supabase);
    if (audience.error) return fail(res, 503, "SUBSCRIBER_COUNT_UNAVAILABLE", "Subscriber counts are temporarily unavailable.");
    return res.status(200).json({ success: true, counts: { all: audience.user.length + audience.admin.length, user: audience.user.length, admin: audience.admin.length } });
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
