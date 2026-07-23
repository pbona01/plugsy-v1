import { supabase } from "../lib/supabase";
import { sendOrderToTelegram } from "../lib/notifications";

export const sendBroadcastSafely = async (channelName: string, eventName: string, payload: any = {}) => {
  console.log(`[broadcast-safely] attempting to send '${eventName}' to '${channelName}'`);
  
  // Look for any existing channel matching the name or topic
  const existingChannel = supabase.getChannels().find(
    c => c.topic === `realtime:${channelName}` || c.topic === channelName || c.name === channelName
  );
  
  if (existingChannel) {
    if (existingChannel.state === 'joined') {
      console.log(`[broadcast-safely] using existing joined channel`);
      existingChannel.send({ type: "broadcast", event: eventName, payload }).catch(console.error);
      return;
    } else {
      console.log(`[broadcast-safely] existing channel found but state is '${existingChannel.state}'. Subscribing to trigger broadcast once joined, but WILL NOT remove it.`);
      existingChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          existingChannel.send({ type: "broadcast", event: eventName, payload }).catch(console.error);
        }
      });
      return;
    }
  }

  console.log(`[broadcast-safely] no existing channel found. creating temporary channel for broadcast`);
  const tempChannel = supabase.channel(channelName);
  tempChannel.subscribe((status) => {
    console.log(`[broadcast-safely] temp channel status: ${status}`);
    if (status === 'SUBSCRIBED') {
      tempChannel.send({
        type: "broadcast",
        event: eventName,
        payload
      }).catch(e => console.error("Broadcast err", e));
      
      // Since we created this channel as a temp, we can safely remove it after a delay
      setTimeout(() => { 
        supabase.removeChannel(tempChannel).catch(() => {}); 
      }, 2000);
    }
  });
};

export const sendDMNotification = async (
  otherUserId: string,
  senderName: string,
  messageText: string,
  chatId: string,
  messageType: string
) => {
  try {
    const preview = messageType === "image" ? "📷 Photo" :
      messageType === "sticker" ? "😄 Sticker" :
      messageText.slice(0, 60);

    const res = await fetch("/api/notifications?action=send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: otherUserId,
        title: "💬 " + senderName,
        body: preview,
        url: "/chats/" + chatId,
        tag: "dm-" + chatId
      })
    });
    const data = await res.json();
    console.log("[dm-notif] result:", data);

    if (data.playerIds === 0) {
      console.log("[dm-notif] no push sub for:", otherUserId,
        "— badge only fallback");
      // Increment unread count as fallback
      const { data: chat } = await supabase
        .from("chats")
        .select("unread_count")
        .eq("id", chatId)
        .single();

      await supabase
        .from("chats")
        .update({ 
          unread_count: (chat?.unread_count || 0) + 1 
        })
        .eq("id", chatId);
    }
  } catch (e) {
    console.error("[dm-notif] error:", e);
  }
};

export interface ChatMessage {
  id?: string;
  chatId: string;
  orderId: string;
  senderId?: string;
  senderName?: string;
  senderRole: "user" | "admin" | "bot" | "system" | "assistant";
  message: string;
  attachmentUrl?: string;
  attachmentType?: string;
  messageType?: string;
  audioUrl?: string;
  createdAt: number;
  readByAdmin?: boolean;
  readByUser?: boolean;
  userId?: string;
  status?: "pending" | "sent" | "failed";
  event?: string;
}

export interface Chat {
  id?: string;
  userId: string;
  userEmail: string;
  orderId: string;
  status: "open" | "closed";
  needsAdminAttention: boolean;
  assignedAdminId?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  createdAt: number;
  updatedAt: number;
}

export const CHAT_BOT_RULES = {
  START:
    "Our team is notified once your Paystack payment is successful. If you just paid, please hold while we prepare your logins.",
  RECEIPT_RECEIVED: "Logins are being prepared. This usually takes 5-15 mins.",
  ABOUT_PAYMENT:
    "Once you select a plan and complete your Paystack payment, your premium logins will be prepared. No manual work is needed from your end.",
  TIME_CONFIRMATION:
    "Logins are usually prepared and sent here in the chat as soon as possible. Please stay tuned.",
  DURATION:
    "Your subscription countdown starts as soon as we send your premium logins.",
  HUMAN_SUPPORT:
    "I’ll notify the team so they can send your logins or assist you further.",
};

export const chatService = {
  async getOrCreateChat(userId: string, userEmail: string): Promise<Chat> {
    try {
      const { data: existingChat, error: fetchError } = await supabase
        .from("chats")
        .select("*")
        .eq("user_id", String(userId))
        .limit(1)
        .maybeSingle();

      if (existingChat) {
        return {
          id: existingChat.id,
          userId: existingChat.user_id,
          userEmail: existingChat.user_email,
          orderId: existingChat.order_id,
          status: existingChat.status,
          needsAdminAttention: existingChat.needs_admin_attention,
          assignedAdminId: existingChat.assigned_admin_id,
          lastMessage: existingChat.last_message,
          lastMessageAt: existingChat.last_message_at
            ? new Date(existingChat.last_message_at).getTime()
            : undefined,
          createdAt: new Date(existingChat.created_at).getTime(),
          updatedAt: new Date(existingChat.updated_at).getTime(),
        };
      }

      // Create new chat
      const { data: newChat, error: createError } = await supabase
        .from("chats")
        .insert([
          {
            user_id: String(userId),
            user_email: userEmail,
            status: "open",
            needs_admin_attention: true,
          },
        ])
        .select()
        .maybeSingle();

      if (createError) throw createError;

      return {
        id: newChat.id,
        userId: newChat.user_id,
        userEmail: newChat.user_email,
        orderId: newChat.order_id,
        status: newChat.status,
        needsAdminAttention: newChat.needs_admin_attention,
        assignedAdminId: newChat.assigned_admin_id,
        lastMessage: newChat.last_message,
        lastMessageAt: newChat.last_message_at
          ? new Date(newChat.last_message_at).getTime()
          : undefined,
        createdAt: new Date(newChat.created_at).getTime(),
        updatedAt: new Date(newChat.updated_at).getTime(),
      };
    } catch (error) {
      throw error;
    }
  },

  async sendMessage(
    chatId: string,
    payload: Partial<ChatMessage>,
    getToken?: any,
  ) {
    try {
      if (getToken) {
        let token = await getToken({ template: "supabase" }).catch(() => null);
        if (!token) {
          token = await getToken({ template: "Supabase" }).catch(() => null);
        }
        if (token) {
          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const headers = (supabase as any).rest.headers || {};
          headers["Authorization"] = `Bearer ${token}`;
          if (supabaseAnonKey) {
            headers["apikey"] = supabaseAnonKey;
          }
        }
      }

      console.log("SENDING MESSAGE:", payload.message, "to chat:", chatId);
      const dbPayload: any = {
        chat_id: chatId,
        sender_id: payload.senderId,
        sender_name: payload.senderName,
        sender_role: payload.senderRole,
        content: payload.message,
        attachment_url: payload.attachmentUrl,
        attachment_type: payload.attachmentType,
        message_type: payload.messageType,
        audio_url: payload.audioUrl,
        read_by_admin: payload.readByAdmin || false,
        read_by_user: payload.readByUser || false,
        order_id: payload.orderId,
        user_id: payload.userId,
        is_bot: payload.senderRole === "bot" || payload.senderRole === "system",
      };

      console.log("PAYLOAD TO INSERT:", dbPayload);

      if (payload.senderRole === "user") {
        dbPayload.read_by_admin = false;
      }

      let createdMsgId;
      let fullMessageObj: any = null;

      if (
        payload.senderRole === "admin" ||
        payload.senderRole === "system" ||
        payload.senderRole === "bot"
      ) {
        const res = await fetch("/api/admin?action=add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collection: "messages", data: dbPayload }),
        });
        const resultData = await res.json();
        if (resultData.error) throw new Error(resultData.error);
        createdMsgId = resultData.id;
        fullMessageObj = { ...dbPayload, id: createdMsgId, created_at: new Date().toISOString() };
      } else {
        const { data: msg, error: msgError } = await supabase
          .from("messages")
          .insert([dbPayload])
          .select();

        if (msgError) throw msgError;
        createdMsgId = msg?.[0]?.id;
        fullMessageObj = msg?.[0];
      }

      const { data: chatData } = await supabase
        .from("chats")
        .select("chat_type, user_email, user_id")
        .eq("id", chatId)
        .maybeSingle();
      const chatType = chatData?.chat_type || "support";

      // BROADCAST TO FIX REALTIME IF POSTGRES_CHANGES FAILS
      if (fullMessageObj) {
        sendBroadcastSafely(`chat-presence:${chatId}`, "new_message", fullMessageObj);
        sendBroadcastSafely(`support-chat-${chatId}`, "new_message", fullMessageObj);
        sendBroadcastSafely('admin-broadcast', "new_message", fullMessageObj);
        
        const targetUserId = payload.userId || chatData?.user_id;
        if (targetUserId) {
          sendBroadcastSafely(`user-events-${targetUserId}`, "new_message", fullMessageObj);
        }
      }

      // Update chat last message
      const updatePayload: any = {
        last_message:
          payload.message || (payload.audioUrl ? "🎤 Voice Note" : (payload.attachmentUrl ? "📷 Image" : "")),
        last_message_at: new Date().toISOString(),
      };

      if (payload.senderRole === "user") {
        updatePayload.needs_admin_attention = true;

        if (chatType === "support" || !chatType) {
          // TRIGGER 2 (Reverse): User sends message to Support, notify Admins
          fetch("/api/notifications?action=notify-admins", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: "💬 New user message",
              body: (payload.senderName || chatData?.user_email) + ": " + 
                ((payload.message || "").length > 50 
                  ? (payload.message || "").slice(0, 50) + "..." 
                  : (payload.message || "Sent an attachment")),
              url: "/admin/chats",
              tag: "user-support-message"
            })
          }).catch(e => console.error("[admin-notif] error:", e.message));

          // Trigger Telegram Alert only once per session per chat
          const sessionKey = `telegram_alert_sent_${chatId}`;

          if (
            typeof window !== "undefined" &&
            !sessionStorage.getItem(sessionKey)
          ) {
            sessionStorage.setItem(sessionKey, "true");
            import("../lib/telegram").then(({ sendTelegramAlert }) => {
              const email = chatData?.user_email || payload.senderName || "Customer";
              sendTelegramAlert(
                `💬 <b>NEW CUSTOMER MESSAGE:</b> ${payload.message || (payload.audioUrl ? "🎤 Voice Note" : "Sent an attachment")} (User: ${email})`
              );
            });
          }
      const sendDMNotification = async (
        otherUserId: string,
        senderName: string,
        messageText: string,
        chatId: string,
        messageType: string
      ) => {
        try {
          const preview = messageType === "image" ? "📷 Photo" :
            messageType === "sticker" ? "😄 Sticker" :
            messageText.slice(0, 60);

          const res = await fetch("/api/notifications?action=send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: otherUserId,
              title: "💬 " + senderName,
              body: preview,
              url: "/chats/" + chatId,
              tag: "dm-" + chatId
            })
          });
          const data = await res.json();
          console.log("[dm-notif] result:", data);

          if (data.playerIds === 0) {
            console.log("[dm-notif] no push sub for:", otherUserId,
              "— badge only fallback");
            // Increment unread count as fallback
            const { data: chat } = await supabase
              .from("chats")
              .select("unread_count")
              .eq("id", chatId)
              .single();

            await supabase
              .from("chats")
              .update({ 
                unread_count: (chat?.unread_count || 0) + 1 
              })
              .eq("id", chatId);
          }
        } catch (e) {
          console.error("[dm-notif] error:", e);
        }
      };

      // After successful insert...
      // (This will go in the "if (payload.senderRole === "user")" block)

          // TRIGGER 4: Community/group chat message
          const messageContent = payload.message || "";
          const message_type = payload.messageType;
          const currentUserId = payload.senderId;
          const currentUserName = payload.senderName;

          Promise.all([
            supabase.from("chat_members").select("user_id").eq("chat_id", chatId).neq("user_id", currentUserId),
            supabase.from("chats").select("name").eq("id", chatId).single()
          ]).then(([membersRes, chatRes]) => {
            const groupMembers = membersRes.data;
            const community = chatRes.data;
            const communityName = community?.name || "Community";
            const preview = message_type === "image"
              ? "📷 Photo"
              : message_type === "sticker"
              ? "😄 Sticker"
              : messageContent.length > 50
                ? messageContent.slice(0, 50) + "..."
                : messageContent || "Sent an attachment";

            (groupMembers || []).forEach(member => {
              // Restore realtime broadcast
              sendBroadcastSafely(`user-events-${member.user_id}`, "new_unread");

              fetch("/api/notifications?action=send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userId: member.user_id,
                  title: communityName,
                  body: (currentUserName || "Someone") + ": " + preview,
                  url: "/chats/" + chatId,
                  tag: "group-" + chatId
                })
              }).catch(e => console.error("[group-notif]", e.message));
            });
          });
        }
      } else if (payload.senderRole === "admin") {
        // Trigger push notification to user
        if (chatType === "support" || !chatType) {
          // TRIGGER 2: Support chat message received by user (Admin replied)
          const targetUserId = payload.userId || chatData?.user_id;
          const messageContent = payload.message || "";

          if (targetUserId) {
            // Restore realtime broadcast
            sendBroadcastSafely(`user-events-${targetUserId}`, "new_unread");

            fetch("/api/notifications?action=send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: targetUserId,
                title: "💬 New message from Plugsy",
                body: messageContent.length > 60
                  ? messageContent.slice(0, 60) + "..."
                  : messageContent || "Sent an attachment",
                url: "/dashboard/messages",
                tag: "support-message"
              })
            }).catch(e => console.error("[support-notif] error:", e.message));
          }
        } else {
           // Admin sending in a group/channel/dm
          supabase.from("chat_members").select("user_id").eq("chat_id", chatId).neq("user_id", payload.senderId).then(({ data: members }) => {
             members?.forEach(m => {
                // Restore realtime broadcast
                sendBroadcastSafely(`user-events-${m.user_id}`, "new_unread");

                fetch("/api/notifications?action=send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    userId: m.user_id,
                    title: chatType === "channel" ? "Announcement" : "Message from Admin",
                    body: payload.message || (payload.audioUrl ? "Sent a voice note" : "Sent an attachment"),
                    url: `/chats/${chatId}`,
                    tag: "new-message",
                  }),
                }).catch(console.error);
             });
          });
        }
      }

      if (
        payload.senderRole === "admin" ||
        payload.senderRole === "system" ||
        payload.senderRole === "bot"
      ) {
        const res = await fetch("/api/admin?action=update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collection: "chats",
            id: chatId,
            data: updatePayload,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
      } else {
        await supabase.from("chats").update(updatePayload).eq("id", chatId);
      }

      // If user is sending a message (not an attachment), and not an admin/system message
      // we might want to log it for AI or just let the admin handle it.

      return createdMsgId;
    } catch (error) {
      throw error;
    }
  },
};
