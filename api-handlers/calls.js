import { createClient } from "@supabase/supabase-js";
import { requireVerifiedClerkUser } from "../api/_clerkAuth.js";
import { resolveCanonicalClerkId } from "../api/_recipient.js";
import { deterministicEventUuid, sendOneSignal } from "../api/_oneSignal.js";

const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const bodyOf = (req) => typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
const actionOf = (req) => new URL(req.url || "/", `http://${req.headers?.host || "localhost"}`).searchParams.get("action");
const fail = (res, status, code) => res.status(status).json({ success: false, code });

async function members(chatId) {
  const { data, error } = await supabase.from("chat_members").select("user_id").eq("chat_id", chatId);
  if (error) throw new Error("CHAT_MEMBERS_UNAVAILABLE");
  const ids = await Promise.all((data || []).map((row) => resolveCanonicalClerkId(supabase, row.user_id)));
  return [...new Set(ids.filter(Boolean))];
}
async function authorizedChat(actor, chatId) {
  const { data: chat } = await supabase.from("chats").select("id,user_id,chat_type,name").eq("id", chatId).maybeSingle();
  if (!chat) return null;
  const owner = await resolveCanonicalClerkId(supabase, chat.user_id);
  const ids = [...new Set([...(await members(chat.id)), owner].filter(Boolean))];
  const { data: profile } = await supabase.from("profiles").select("role").eq("clerk_id", actor.userId).maybeSingle();
  const isSupportAdmin = chat.chat_type === "support" && String(profile?.role || "").toLowerCase() === "admin";
  return ids.includes(actor.userId) || isSupportAdmin ? { chat, ids } : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return fail(res, 405, "METHOD_NOT_ALLOWED");
  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return;
  const body = bodyOf(req);
  const action = actionOf(req);
  if (action === "create-room") {
    const chatId = String(body.chatId || "").trim();
    const authChat = chatId ? await authorizedChat(actor, chatId) : null;
    if (!authChat) return fail(res, 403, "CHAT_MEMBERSHIP_REQUIRED");
    const recipients = authChat.ids.filter((id) => id !== actor.userId);
    if (!recipients.length || (authChat.chat.chat_type === "direct" && recipients.length !== 1)) return fail(res, 409, "CALL_RECIPIENT_INVALID");
    const callType = body.callType === "voice" ? "voice" : "video";
    const { data: profile } = await supabase.from("profiles").select("full_name,profile_pic_url,image_url").eq("clerk_id", actor.userId).maybeSingle();
    const hostName = profile?.full_name || actor.fullName || "Plugsy User";
    const hostAvatar = profile?.profile_pic_url || profile?.image_url || null;
    let roomUrl = "", roomName = "";
    const dailyKey = String(process.env.DAILY_API_KEY || "").trim();
    if (dailyKey) {
      const response = await fetch("https://api.daily.co/v1/rooms", { method: "POST", headers: { Authorization: `Bearer ${dailyKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ properties: { exp: Math.floor(Date.now() / 1000) + 3600, enable_chat: false, enable_screenshare: true, start_video_off: callType === "voice", start_audio_off: false, enable_prejoin_ui: false } }) });
      const room = await response.json().catch(() => ({}));
      if (!response.ok || !room.url || !room.name) return fail(res, 502, "CALL_PROVIDER_UNAVAILABLE");
      roomUrl = room.url; roomName = room.name;
    } else { roomName = `lobby-${chatId.slice(0, 8)}-${Date.now().toString().slice(-4)}`; roomUrl = `https://mock.daily.co/${roomName}`; }
    const { data: call, error } = await supabase.from("calls").insert({ chat_id: chatId, host_id: actor.userId, host_name: hostName, host_avatar: hostAvatar, callee_id: recipients[0], chat_name: authChat.chat.name || "Plugsy chat", call_type: callType, room_url: roomUrl, room_name: roomName, status: "ringing", started_at: new Date().toISOString() }).select().single();
    if (error || !call) return fail(res, 503, "CALL_CREATE_FAILED");
    await supabase.from("chats").update({ active_call_room: roomUrl, active_call_status: "ringing" }).eq("id", chatId);
    await supabase.from("messages").insert({ chat_id: chatId, sender_id: actor.userId, sender_role: "user", sender_name: hostName, content: `${hostName} started a ${callType} call`, message_type: "call_event", user_id: actor.userId, is_from_user: true, is_bot: false, read_by_admin: true, read_by_user: true, created_at: new Date().toISOString() });
    const push = await sendOneSignal({ title: "Incoming call", body: `${hostName} is calling you`, url: `/chats/${chatId}?incoming_call=${call.id}`, targeting: { include_aliases: { external_id: recipients } }, requestKey: deterministicEventUuid("incoming-call", call.id) });
    if (!push.ok) console.warn("[calls] notification secondary effect failed", { code: push.code });
    return res.status(200).json({ success: true, callId: call.id, roomUrl, roomName });
  }
  if (action === "end-call") {
    const callId = String(body.callId || "").trim();
    const { data: call } = callId ? await supabase.from("calls").select("id,chat_id,room_name,status,host_id").eq("id", callId).maybeSingle() : { data: null };
    if (!call) return fail(res, 404, "CALL_NOT_FOUND");
    const authChat = await authorizedChat(actor, call.chat_id);
    if (!authChat || (call.host_id !== actor.userId && !authChat.ids.includes(actor.userId))) return fail(res, 403, "CALL_PARTICIPATION_REQUIRED");
    const status = ["declined", "missed"].includes(call.status) ? call.status : "ended";
    await supabase.from("calls").update({ status, ended_reason: status === "ended" ? "completed" : status, ended_at: new Date().toISOString() }).eq("id", call.id);
    await supabase.from("chats").update({ active_call_room: null, active_call_status: null }).eq("id", call.chat_id);
    const dailyKey = String(process.env.DAILY_API_KEY || "").trim();
    if (dailyKey && call.room_name) await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(call.room_name)}`, { method: "DELETE", headers: { Authorization: `Bearer ${dailyKey}` } }).catch(() => {});
    return res.status(200).json({ success: true });
  }
  return fail(res, 404, "ACTION_NOT_FOUND");
}
