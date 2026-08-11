import { supabase } from "../lib/supabase";
import { executeMessageSendContract } from "../utils/messageSendContract";
import {
  isSupportChat,
  LEGACY_SUPPORT_MESSAGE_ROLES,
  selectSupportChatsForUser,
} from "../utils/supportChatMessages";

export const sendBroadcastSafely = async (channelName: string, eventName: string, payload: any = {}) => {
  console.log(`[broadcast-safely] attempting to send '${eventName}' to '${channelName}'`);

  // The notification listener and inbox refresh listener deliberately use
  // separate channel instances. Relay unread events before any early return
  // below so both channels receive the event regardless of connection state.
  if (eventName === "new_unread" && channelName.startsWith("user-events-") && !channelName.endsWith("-inbox")) {
    void sendBroadcastSafely(`${channelName}-inbox`, eventName, payload);
  }
  
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
  supportChatIds?: string[];
}

const mapSupportChat = (
  chat: any,
  supportChatIds = [String(chat.id)],
): Chat => ({
  id: chat.id,
  userId: chat.user_id,
  userEmail: chat.user_email,
  orderId: chat.order_id,
  status: chat.status,
  needsAdminAttention: chat.needs_admin_attention,
  assignedAdminId: chat.assigned_admin_id,
  lastMessage: chat.last_message,
  lastMessageAt: chat.last_message_at
    ? new Date(chat.last_message_at).getTime()
    : undefined,
  createdAt: new Date(chat.created_at).getTime(),
  updatedAt: new Date(chat.updated_at).getTime(),
  supportChatIds,
});

export const getSupportChatRows = async (userId: string) => {
  const canonicalUserId = String(userId || "").trim();
  if (!canonicalUserId) throw new Error("SUPPORT_CHAT_USER_REQUIRED");

  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("user_id", canonicalUserId);

  if (error) throw new Error("SUPPORT_CHAT_LOOKUP_FAILED");
  return selectSupportChatsForUser(data || [], canonicalUserId);
};

export const getCanonicalSupportChatRow = async (userId: string) =>
  (await getSupportChatRows(userId))[0] || null;

export const getUnreadSupportMessageCount = async (userId: string) => {
  const canonicalUserId = String(userId || "").trim();
  if (!canonicalUserId) return 0;

  const supportChats = await getSupportChatRows(canonicalUserId);
  const supportChatIds = supportChats
    .map((chat) => String(chat.id || ""))
    .filter(Boolean);
  let canonicalCount = 0;

  if (supportChatIds.length > 0) {
    const { count, error } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("chat_id", supportChatIds)
      .eq("read_by_user", false)
      .neq("sender_role", "user");

    if (error) throw new Error("SUPPORT_UNREAD_LOOKUP_FAILED");
    canonicalCount = count || 0;
  }

  const { count: legacyCount, error: legacyError } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .is("chat_id", null)
    .eq("user_id", canonicalUserId)
    .in("sender_role", [...LEGACY_SUPPORT_MESSAGE_ROLES])
    .eq("read_by_user", false);

  if (legacyError) throw new Error("SUPPORT_UNREAD_LOOKUP_FAILED");
  return canonicalCount + (legacyCount || 0);
};

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
    const canonicalUserId = String(userId || "").trim();
    if (!canonicalUserId) throw new Error("SUPPORT_CHAT_USER_REQUIRED");

    const existingChats = await getSupportChatRows(canonicalUserId);
    const existingChat = existingChats[0];
    if (existingChat) {
      return mapSupportChat(
        existingChat,
        existingChats
          .map((chat) => String(chat.id || ""))
          .filter(Boolean),
      );
    }

    const { data: newChat, error: createError } = await supabase
      .from("chats")
      .insert([
        {
          user_id: canonicalUserId,
          user_email: userEmail,
          status: "open",
          needs_admin_attention: true,
        },
      ])
      .select()
      .single();

    if (createError || !newChat) {
      throw new Error("SUPPORT_CHAT_CREATE_FAILED");
    }

    return mapSupportChat(newChat, [String(newChat.id)]);
  },

  async sendMessage(
    chatId: string,
    payload: Partial<ChatMessage>,
    getToken?: any,
  ) {
    try {
      const canonicalChatId = String(chatId || "").trim();
      if (!canonicalChatId) throw new Error("CHAT_ID_REQUIRED");
      const usesServerWriter =
        payload.senderRole === "admin" ||
        payload.senderRole === "system" ||
        payload.senderRole === "bot";
      let serverAuthToken = "";

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
      if (usesServerWriter) {
        serverAuthToken = getToken
          ? await getToken().catch(() => "")
          : "";
        if (!serverAuthToken) throw new Error("AUTH_REQUIRED");
      }

      const { data: chatData, error: chatFetchError } = await supabase
        .from("chats")
        .select("chat_type, user_email, user_id")
        .eq("id", canonicalChatId)
        .maybeSingle();
      if (chatFetchError) throw new Error("CHAT_LOOKUP_FAILED");
      if (!chatData) throw new Error("CHAT_NOT_FOUND");

      const chatType = chatData.chat_type || "support";
      const supportChat = isSupportChat(chatData);
      const conversationOwnerUserId = supportChat
        ? String(chatData.user_id || "").trim()
        : String(payload.userId || chatData.user_id || "").trim();
      if (
        supportChat &&
        (!conversationOwnerUserId ||
          !conversationOwnerUserId.startsWith("user_"))
      ) {
        throw new Error("SUPPORT_CHAT_OWNER_REQUIRED");
      }
      if (supportChat) {
        const canonicalSupportChat = await getCanonicalSupportChatRow(
          conversationOwnerUserId,
        );
        if (canonicalSupportChat?.id !== canonicalChatId) {
          throw new Error("SUPPORT_CHAT_NOT_CANONICAL");
        }
      }

      console.log("Sending chat message", {
        chatId: canonicalChatId,
        senderRole: payload.senderRole,
      });
      const dbPayload: any = {
        chat_id: canonicalChatId,
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
        user_id: conversationOwnerUserId || undefined,
        is_bot: payload.senderRole === "bot" || payload.senderRole === "system",
      };

      if (payload.senderRole === "user") {
        dbPayload.read_by_admin = false;
      }

      let createdMsgId;
      let fullMessageObj: any = null;

      return await executeMessageSendContract({
        insert: async () => {
      if (usesServerWriter) {
        const res = await fetch("/api/admin?action=add", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serverAuthToken}`,
          },
          body: JSON.stringify({ collection: "messages", data: dbPayload }),
        });
        const resultData = await res.json();
        if (!res.ok || resultData.error) {
          throw new Error(resultData.error || "Message insert failed");
        }
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

      if (!createdMsgId || !fullMessageObj) {
        throw new Error("Message insert did not return a message ID");
      }

      return { createdMsgId, fullMessageObj };
        },
        getInsertedId: ({ createdMsgId }) => createdMsgId,
        runPostInsertSideEffects: async ({
          createdMsgId,
          fullMessageObj,
        }) => {
      // BROADCAST TO FIX REALTIME IF POSTGRES_CHANGES FAILS
      if (fullMessageObj) {
        sendBroadcastSafely(`chat-presence:${canonicalChatId}`, "new_message", fullMessageObj);
        sendBroadcastSafely(`support-chat-${canonicalChatId}`, "new_message", fullMessageObj);
        sendBroadcastSafely('admin-broadcast', "new_message", fullMessageObj);
        
        const targetUserId = conversationOwnerUserId;
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
      }
      if (usesServerWriter) {
        const res = await fetch("/api/admin?action=update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serverAuthToken}`,
          },
          body: JSON.stringify({
            collection: "chats",
            id: canonicalChatId,
            data: updatePayload,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "Chat summary update failed");
        }
      } else {
        const { error: summaryError } = await supabase
          .from("chats")
          .update(updatePayload)
          .eq("id", canonicalChatId);
        if (summaryError) throw summaryError;
      }

      try {
        const token = getToken ? await getToken().catch(() => "") : serverAuthToken;
        if (token && createdMsgId) {
          await fetch("/api/notifications?action=notify-message", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ messageId: createdMsgId }),
          });
        }
      } catch {
        console.error("[chat-notification] push failed safely");
      }

      // If user is sending a message (not an attachment), and not an admin/system message
      // we might want to log it for AI or just let the admin handle it.

        },
        logPostInsertError: (message) =>
          console.error(message, {
            chatId: canonicalChatId,
            senderRole: payload.senderRole,
          }),
      });
    } catch (error) {
      throw error;
    }
  },
};
