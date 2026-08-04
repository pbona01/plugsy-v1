import { createClient } from "@supabase/supabase-js";
import { deterministicEventUuid, sendOneSignal } from "../api/_oneSignal.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: {
    schema: "public"
  },
  global: {
    headers: { "x-connection-encrypted": "true" }
  }
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const action = req.query?.action || urlObj.searchParams.get("action");

  if (action === "create-room") {
    try {
      const { chatId, hostId, hostName, hostAvatar, calleeId, chatName, callType } = req.body;

      if (!chatId || !hostId) {
        return res.status(400).json({ success: false, error: "Missing chatId or hostId" });
      }

      let roomUrl = "";
      let roomName = "";

      const dailyApiKey = process.env.DAILY_API_KEY;

      if (dailyApiKey) {
        const dailyRes = await fetch("https://api.daily.co/v1/rooms", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + dailyApiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            properties: {
              exp: Math.floor(Date.now() / 1000) + 3600,
              enable_chat: false,
              enable_screenshare: true,
              start_video_off: callType === "voice",
              start_audio_off: false,
              enable_prejoin_ui: false
            }
          })
        });

        const room = await dailyRes.json();
        if (!room.url) {
          throw new Error(room.error || "Failed to create Daily.co room");
        }
        roomUrl = room.url;
        roomName = room.name;
      } else {
        // Fallback for preview / local testing
        roomName = `lobby-${chatId.slice(0, 8)}-${Date.now().toString().slice(-4)}`;
        roomUrl = `https://mock.daily.co/${roomName}`;
      }

      const { data: call, error: callErr } = await supabase
        .from("calls")
        .insert({
          chat_id: chatId,
          host_id: hostId,
          host_name: hostName,
          host_avatar: hostAvatar,
          callee_id: calleeId,
          chat_name: chatName,
          call_type: callType || "video",
          room_url: roomUrl,
          room_name: roomName,
          status: "ringing",
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      if (callErr) throw callErr;

      await supabase
        .from("chats")
        .update({ active_call_room: roomUrl, active_call_status: "ringing" })
        .eq("id", chatId);

      await supabase.from("messages").insert({
        chat_id: chatId,
        sender_id: hostId,
        sender_role: "user",
        sender_name: hostName || "Someone",
        content: (hostName || "Someone") + " started a " + (callType || "video") + " call",
        message_type: "call_event",
        user_id: hostId,
        is_from_user: true,
        is_bot: false,
        read_by_admin: true,
        read_by_user: true,
        created_at: new Date().toISOString()
      });

      // Send an URGENT push notification
      if (calleeId) {
        await sendOneSignal({
          title: "Incoming call",
          body: "Tap to answer",
          url: "/chats/" + chatId + "?incoming_call=" + call.id,
          targeting: { include_aliases: { external_id: [calleeId] } },
          requestKey: deterministicEventUuid("incoming-call", call.id),
        });
      }
      if (false && calleeId) {
        fetch("/api/notifications?action=removed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: calleeId,
            title: "📞 " + (hostName || "Someone") + " is calling you",
            body: "Tap to answer",
            url: "/chats/" + chatId + "?incoming_call=" + call.id,
            tag: "incoming-call-" + call.id
          })
        }).catch(() => {});
      }

      return res.status(200).json({
        success: true, callId: call.id, roomUrl, roomName
      });
    } catch (e) {
      console.error("[calls-create-room] crash:", e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (action === "end-call") {
    try {
      const { callId, chatId, roomName } = req.body;

      if (!callId) {
        return res.status(400).json({ success: false, error: "Missing callId" });
      }

      const { data: call } = await supabase
        .from("calls")
        .select("status")
        .eq("id", callId)
        .single();

      const finalStatus = call?.status === "declined" || call?.status === "missed" ? call.status : "ended";

      await supabase.from("calls").update({
        status: finalStatus,
        ended_reason: finalStatus === "ended" ? "completed" : finalStatus,
        ended_at: new Date().toISOString()
      }).eq("id", callId);

      await supabase.from("chats").update({
        active_call_room: null, active_call_status: null
      }).eq("id", chatId);

      const dailyApiKey = process.env.DAILY_API_KEY;
      if (dailyApiKey && roomName) {
        await fetch("https://api.daily.co/v1/rooms/" + roomName, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + dailyApiKey }
        }).catch(() => {});
      }

      return res.status(200).json({ success: true });
    } catch (e) {
      console.error("[calls-end-call] crash:", e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(404).json({ success: false, error: "Action not found" });
}
