import { LiquidGlass } from "../components/ui/LiquidGlass";
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { supabase, setSupabaseAuth } from "../lib/supabase";
import { useUser, useAuth } from "@clerk/clerk-react";
import { optimizeCloudinaryUrl } from "../lib/cloudinary";
import { compressAndUpload } from "../utils/uploadMedia";
import {
  Search,
  MessageSquare,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  ExternalLink,
  Send,
  Loader2,
  Filter,
  Download,
  AlertTriangle,
  Eye,
  Zap,
  Paperclip,
  Trash2,
  Mic,
  Users,
} from "lucide-react";
import { VoiceNotePlayer } from "../components/chat/VoiceNotePlayer";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { Chat, ChatMessage, chatService } from "../services/chatService";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { useOnlinePresence } from "../contexts/OnlinePresenceContext";
import {
  compareSupportChatsByActivity,
  dedupeSupportChatsByUserId,
  filterSupportChatRows,
  isSupportChat,
  LEGACY_SUPPORT_MESSAGE_ROLES,
  mergeSupportChatMessages,
} from "../utils/supportChatMessages";

const getCleanMessageText = (content: string | null): string => {
  if (!content) return "";
  if (content.startsWith('{"_msg":true,')) {
    try {
      const parsed = JSON.parse(content);
      return parsed.text || "";
    } catch (e) {
      // ignore
    }
  }
  return content;
};

export default function AdminChats() {
  const navigate = useNavigate();
  const { isUserOnline } = useOnlinePresence();
  const [searchParams, setSearchParams] = useSearchParams();
  const order_idParam = searchParams.get("order_id");
  const user_idParam = searchParams.get("user_id");
  const legacyUserIdParam = searchParams.get("userId");
  const typeParam = searchParams.get("type");
  const chat_idParam = searchParams.get("id") || searchParams.get("chat_id");

  const { user } = useUser();
  const { userId, getToken } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showMobileList, setShowMobileList] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "open" | "closed" | "needs_attention"
  >("all");
  const [orders, setOrders] = useState<any[]>([]);
  
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [chatTypeFilter, setChatTypeFilter] = useState<"support" | "group" | "channel" | "all">((typeParam as any) || "support");

  useEffect(() => {
    if (typeParam && (["support", "group", "channel", "all"] as any).includes(typeParam)) {
      setChatTypeFilter(typeParam as any);
    }
  }, [typeParam]);

  const { isRecording, duration, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();
  const formatTimer = (time: number) => {
    const min = Math.floor(time / 60);
    const sec = time % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const handleAdminAudioUpload = async (audioBlob: Blob) => {
      if (!activeChatId) return;
      const activeChat = chats.find(c => c.id === activeChatId);
      if(!activeChat) return;
      setUploading(true);
      setUploadProgress(10);
      try {
        const file = new File([audioBlob], `admin_voicenote_${Date.now()}.webm`, { type: 'audio/webm' });
        const audioUrl = await compressAndUpload(file);
        
        setUploadProgress(80);
        
        const optimisticFileMsg: ChatMessage = {
          id: `temp-${Date.now()}`,
          chatId: activeChatId,
          orderId: activeChat.orderId || "",
          senderRole: "admin",
          message: "",
          senderId: userId || "",
          senderName: user?.fullName || "Admin Support",
          createdAt: Date.now(),
          messageType: "audio",
          audioUrl: audioUrl,
          status: "pending",
        };
        setMessages((prev) => [...prev, optimisticFileMsg]);

        await setSupabaseAuth(getToken, true);
        const insertedId = await chatService.sendMessage(
          activeChatId,
          {
            senderRole: "admin",
            message: "",
            senderId: userId || "",
            senderName: user?.fullName || "Admin Support",
            orderId: activeChat.orderId || undefined,
            userId: activeChat.userId || undefined,
            messageType: "audio",
            audioUrl: audioUrl,
          },
          getToken,
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticFileMsg.id
              ? { ...m, id: insertedId, status: "sent" }
              : m
          )
        );

      } catch {
        console.error("Admin voice note send failed", {
          chatId: activeChatId,
        });
        toast.error('Failed to send voice note');
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchChats = async (retries = 1) => {
    try {
      // Fetch profiles in background
      supabase
        .from("profiles")
        .select("id, clerk_id, last_seen_at, last_login_at, full_name")
        .then(({ data: profilesData }) => {
          if (profilesData) setProfiles(profilesData);
        })
        .catch(() => console.warn("Failed to fetch profiles in AdminChats"));

      const timeout = (ms: number) =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), ms),
        );

      const executeFetch = async () => {
        const { data, error } = await supabase
          .from("chats")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (
          typeof data === "string" &&
          (data as string).includes("<!doctype")
        )
          return [];
        return data || [];
      };

      const data = (await Promise.race([
        executeFetch(),
        timeout(8000),
      ])) as any[];

      let requestedUserId = user_idParam;
      if (!requestedUserId && legacyUserIdParam) {
        if (legacyUserIdParam.startsWith("user_")) {
          requestedUserId = legacyUserIdParam;
        } else {
          const { data: legacyProfile, error: legacyProfileError } =
            await supabase
              .from("profiles")
              .select("clerk_id")
              .eq("id", legacyUserIdParam)
              .maybeSingle();
          if (legacyProfileError) throw new Error("PROFILE_LOOKUP_FAILED");
          requestedUserId = legacyProfile?.clerk_id || null;
        }
      }

      const allMappedChats = data.map((c: any) => ({
          id: c.id,
          userId: c.user_id,
          userEmail: c.user_email,
          orderId: c.order_id,
          status: c.status,
          needsAdminAttention: c.needs_admin_attention,
          lastMessage: c.last_message,
          lastMessageAt: c.last_message_at
            ? new Date(c.last_message_at).getTime()
            : undefined,
          unreadCount: c.unread_count || 0,
          createdAt: new Date(c.created_at).getTime(),
          updatedAt: new Date(c.updated_at).getTime(),
          chatType: c.chat_type,
          name: c.name,
          coverImageUrl: c.cover_image_url,
        }));
      const supportChatIdsByUserId = new Map<string, string[]>();
      const supportUnreadCountByUserId = new Map<string, number>();
      allMappedChats.forEach((chat: any) => {
        if (!isSupportChat(chat) || !String(chat.userId).startsWith("user_")) {
          return;
        }
        const ids = supportChatIdsByUserId.get(chat.userId) || [];
        if (chat.id) ids.push(chat.id);
        supportChatIdsByUserId.set(chat.userId, ids);
        supportUnreadCountByUserId.set(
          chat.userId,
          (supportUnreadCountByUserId.get(chat.userId) || 0) +
            Number(chat.unreadCount || 0),
        );
      });

      const mappedChats = dedupeSupportChatsByUserId(allMappedChats)
        .map((chat: any) => ({
          ...chat,
          supportChatIds: isSupportChat(chat)
            ? supportChatIdsByUserId.get(chat.userId) || [chat.id]
            : [chat.id],
          unreadCount: isSupportChat(chat)
            ? supportUnreadCountByUserId.get(chat.userId) || 0
            : chat.unreadCount,
        }))
        .filter((c: any) => {
          if (chatTypeFilter === "support") return c.chatType !== "dm" && c.chatType !== "group" && c.chatType !== "channel";
          if (chatTypeFilter === "group") return c.chatType === "group";
          if (chatTypeFilter === "channel") return c.chatType === "channel";
          if (chatTypeFilter === "all") return true;
          return c.chatType !== "dm";
        })
        .sort(compareSupportChatsByActivity);
      setChats(mappedChats);
      setLoading(false);
      // Auto select chat
      if (chat_idParam) {
        const requestedRawChat = data.find((chat) => chat.id === chat_idParam);
        const found =
          mappedChats.find((c) => c.id === chat_idParam) ||
          (requestedRawChat && isSupportChat(requestedRawChat)
            ? mappedChats.find(
                (chat) => chat.userId === requestedRawChat.user_id,
              )
            : undefined);
        if (found) {
          setActiveChatId(found.id!);
          setShowMobileList(false);
        }
      } else if (order_idParam) {
        const found = mappedChats.find((c) => c.orderId === order_idParam);
        if (found) {
          setActiveChatId(found.id!);
          setShowMobileList(false);
        }
      } else if (requestedUserId) {
        const found = mappedChats.find((c) => c.userId === requestedUserId);
        if (found) {
          setActiveChatId(found.id!);
          setShowMobileList(false);
        }
      }
    } catch (e: any) {
      console.error("Admin chat list fetch failed");
      if (e.message === "TIMEOUT" && retries > 0) {
        return fetchChats(retries - 1);
      }
      setLoading(false);
    }
  };

  const typingTimeoutRef = useRef<any>(null);
  const presenceChannelRef = useRef<any>(null);

  // Load all chats
  useEffect(() => {
    fetchChats();
  }, [chatTypeFilter]);

  useEffect(() => {
    const chatChannelName = `admin_chats_list_${Date.now()}`;
    const chatChannel = supabase
      .channel(chatChannelName)
      .on('broadcast', { event: 'new_message' }, (payload) => {
          const newMsg = payload.payload as any;
          if (!newMsg?.chat_id) {
            fetchChats();
            return;
          }
          setChats((prev) => {
            const chatIndex = prev.findIndex(
              (c) => c.id === newMsg.chat_id,
            );
            if (chatIndex === -1) {
              fetchChats();
              return prev;
            }
            const updatedChat = {
              ...prev[chatIndex],
              lastMessage:
                newMsg.content || (newMsg.attachment_url ? "📷 Image" : ""),
              lastMessageAt: new Date(newMsg.created_at || newMsg.created_at).getTime(),
              unreadCount:
                newMsg.sender_role === "user" || newMsg.is_from_user
                  ? (prev[chatIndex].unreadCount || 0) + 1
                  : prev[chatIndex].unreadCount,
            };
            const newList = prev.filter((_, i) => i !== chatIndex);
            return [updatedChat, ...newList];
          });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chats" },
        () => fetchChats(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const updatedProfile = payload.new as any;
          setProfiles((prev) =>
            prev.map((p) =>
              p.clerk_id === updatedProfile.clerk_id
                ? { ...p, last_login_at: updatedProfile.last_login_at }
                : p
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
    };
  }, [order_idParam, user_idParam, legacyUserIdParam]);

  // Load all orders for filtering
  useEffect(() => {
    const fetchOrders = async () => {
      const { data } = await supabase.from("orders").select("*");

      // HTML Protection
      if (typeof data === "string" && (data as string).includes("<!doctype"))
        return;

      if (data) setOrders(data);
    };
    fetchOrders();

    const ordersChannelName = `admin_chats_orders_${Date.now()}`;
    const ordersChannel = supabase
      .channel(ordersChannelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        fetchOrders,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  // Handle mobile selection
  const selectChat = (id: string) => {
    setActiveChatId(id);
    setActiveOrder(null);
    setShowMobileList(false);
  };

  // Load messages for active chat
  const activeHistoryChat = chats.find((chat) => chat.id === activeChatId);
  const activeHistoryOwnerCandidate = String(activeHistoryChat?.userId || "");
  const activeHistoryOwnerUserId = activeHistoryOwnerCandidate.startsWith(
    "user_",
  )
    ? activeHistoryOwnerCandidate
    : "";
  const activeHistoryIsSupport = Boolean(
    activeHistoryChat && isSupportChat(activeHistoryChat as any),
  );
  const activeHistoryChatIdsKey = (
    activeHistoryIsSupport
      ? ((activeHistoryChat as any)?.supportChatIds || [activeChatId])
      : [activeChatId]
  )
    .filter(Boolean)
    .join(",");

  useEffect(() => {
    if (!activeChatId) return;
    const activeHistoryChatIds = activeHistoryChatIdsKey
      .split(",")
      .filter(Boolean);

    let pollingInterval: NodeJS.Timeout;

    const fetchMessages = async () => {
      const canonicalResult = await supabase
        .from("messages")
        .select("*")
        .in("chat_id", activeHistoryChatIds)
        .order("created_at", { ascending: true });

      let legacyRows: any[] = [];
      if (activeHistoryIsSupport && activeHistoryOwnerUserId) {
        const legacyResult = await supabase
          .from("messages")
          .select("*")
          .is("chat_id", null)
          .eq("user_id", activeHistoryOwnerUserId)
          .in("sender_role", [...LEGACY_SUPPORT_MESSAGE_ROLES])
          .order("created_at", { ascending: true });
        if (legacyResult.error) {
          console.error("Failed to load legacy support message history");
          return;
        }
        legacyRows = legacyResult.data || [];
      }

      if (canonicalResult.error) {
        console.error("Failed to load support message history");
        return;
      }

      if (canonicalResult.data) {
        const rawRows = activeHistoryIsSupport
          ? filterSupportChatRows(
              [...canonicalResult.data, ...legacyRows],
              activeHistoryChatIds,
              activeHistoryOwnerUserId,
            )
          : canonicalResult.data;
        const msgs = mergeSupportChatMessages(rawRows).map((msg: any) => ({
          id: msg.id,
          chatId: msg.chat_id || activeChatId,
          orderId: msg.order_id,
          userId: msg.user_id,
          senderRole: msg.sender_role,
          message: getCleanMessageText(msg.content),
          attachmentUrl: msg.attachment_url,
          attachmentType: msg.attachment_type,
          audioUrl: msg.audio_url,
          messageType: msg.message_type,
          createdAt: new Date(msg.created_at).getTime(),
        }));

        setMessages((prev) => {
          if (
            msgs.length !== prev.length ||
            (msgs.length > 0 &&
              msgs[msgs.length - 1].id !== prev[prev.length - 1].id)
          ) {
            return msgs;
          }
          return prev;
        });

        const readOperations: any[] = [
          supabase
            .from("messages")
            .update({ read_by_admin: true })
            .in("chat_id", activeHistoryChatIds)
            .eq("read_by_admin", false),
          supabase
            .from("chats")
            .update({ unread_count: 0 })
            .in("id", activeHistoryChatIds),
        ];
        if (activeHistoryIsSupport && activeHistoryOwnerUserId) {
          readOperations.push(
            supabase
              .from("messages")
              .update({ read_by_admin: true })
              .is("chat_id", null)
              .eq("user_id", activeHistoryOwnerUserId)
              .in("sender_role", [...LEGACY_SUPPORT_MESSAGE_ROLES])
              .eq("read_by_admin", false),
          );
        }
        const readResults = await Promise.all(readOperations);
        if (readResults.some((result) => result.error)) {
          console.error("Failed to mark displayed support messages as read");
        }
      }
    };

    fetchMessages();
    pollingInterval = setInterval(fetchMessages, 3000); // 3-second fallback polling

    const channelId = `chat-presence:${activeChatId}`;
    let msgChannel = supabase
      .channel(channelId)
      .on("broadcast", { event: "new_message" }, (payload) => {
        const message = payload.payload as any;
        if (
          activeHistoryChatIds.includes(message?.chat_id) ||
          (message?.chat_id == null &&
            activeHistoryIsSupport &&
            message?.user_id === activeHistoryOwnerUserId &&
            LEGACY_SUPPORT_MESSAGE_ROLES.includes(message?.sender_role))
        ) {
          fetchMessages();
        }
      });
    activeHistoryChatIds.forEach((supportChatId) => {
      msgChannel = msgChannel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${supportChatId}`,
        },
        () => {
          fetchMessages();
        },
      );
    });
    msgChannel.subscribe(async (status) => {
        console.log("Realtime Status:", status);
        if (status === "SUBSCRIBED") {
          await msgChannel.track({
            user_id: "admin",
            username: "Support",
            full_name: "Support Team",
            is_typing: false,
          });
        }
        if (status === "CHANNEL_ERROR") {
          console.log("Messages channel unavailable, falling back to polling.");
          // Fallback to more frequent polling
          clearInterval(pollingInterval);
          pollingInterval = setInterval(fetchMessages, 2000);
        }
      });

    presenceChannelRef.current = msgChannel;

    return () => {
      clearInterval(pollingInterval);
      if (msgChannel) {
        supabase.removeChannel(msgChannel).catch(() => {});
      }
      presenceChannelRef.current = null;
    };
  }, [
    activeChatId,
    activeHistoryChatIdsKey,
    activeHistoryIsSupport,
    activeHistoryOwnerUserId,
  ]);

  useEffect(() => {
    if (!activeChatId) return;
    const activeChat = chats.find((c) => c.id === activeChatId);
    if (activeChat) {
      const userOrders = orders
        .filter((o) => o.user_id === activeChat.userId)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
      if (userOrders.length > 0) {
        setActiveOrder(userOrders[0]);
      } else {
        supabase
          .from("orders")
          .select("*")
          .eq("user_id", activeChat.userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => {
            if (data) setActiveOrder(data);
            else setActiveOrder(null);
          });
      }
    }
  }, [activeChatId, chats, orders]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const isFulfill = searchParams.get("fulfill");
    const planName = searchParams.get("plan") || "Premium Plan";
    if (isFulfill && activeChatId) {
      setInputText(
        `Hello! Here are your logins for ${planName}.\nEmail: [ ]\nPassword: [ ]\nEnjoy!`,
      );
      // Remove query param so it doesn't repeatedly set
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("fulfill");
      newParams.delete("plan");
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, activeChatId, setSearchParams]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    
    if (presenceChannelRef.current) {
      if (e.target.value.trim()) {
        presenceChannelRef.current.track({
          user_id: "admin",
          username: "Support",
          full_name: "Support Team",
          is_typing: true,
        });

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          presenceChannelRef.current.track({
            user_id: "admin",
            username: "Support",
            full_name: "Support Team",
            is_typing: false,
          });
        }, 3000);
      } else {
        presenceChannelRef.current.track({
          user_id: "admin",
          username: "Support",
          full_name: "Support Team",
          is_typing: false,
        });
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChatId) return;

    const msg = inputText.trim();
    const activeChat = chats.find((c) => c.id === activeChatId);
    if (!activeChat) return;

    const optimisticMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      chatId: activeChatId,
      orderId: activeOrder?.id || "",
      senderRole: "admin",
      message: msg,
      senderId: userId || "",
      senderName: user?.fullName || "Admin Support",
      createdAt: Date.now(),
      status: "pending",
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setInputText("");
    if (presenceChannelRef.current) {
       presenceChannelRef.current.track({
         user_id: "admin",
         username: "Support",
         full_name: "Support Team",
         is_typing: false,
       });
    }

    try {
      await setSupabaseAuth(getToken, true);
      const insertedId = await chatService.sendMessage(
        activeChatId,
        {
          senderRole: "admin",
          message: msg,
          senderId: userId || "",
          senderName: user?.fullName || "Admin Support",
          orderId: activeOrder?.id || undefined,
          userId: activeChat.userId,
        },
        getToken,
      );

      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticMsg.id
            ? { ...m, id: insertedId, status: "sent" }
            : m
        )
      );
      // Success
      // Update admin attention flag
      await adminOp("update", {
        collection: "chats",
        id: activeChatId,
        data: {
          needs_admin_attention: false,
          updated_at: new Date().toISOString(),
        },
      });
    } catch {
      console.error("Admin support message send failed", {
        chatId: activeChatId,
        senderRole: "admin",
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticMsg.id ? { ...m, status: "failed" } : m,
        ),
      );
    }
  };

  const adminOp = async (op: string, payload: any = {}) => {
    try {
      const { collection, id, data } = payload;
      let result;
      switch (op) {
        case "add":
          result = await supabase
            .from(collection)
            .insert(data)
            .select()
            .single();
          if (result.error) throw result.error;
          return result.data;
        case "update":
          result = await supabase
            .from(collection)
            .update(data)
            .eq("id", id)
            .select()
            .single();
          if (result.error) throw result.error;
          return result.data;
        case "delete":
          result = await supabase.from(collection).delete().eq("id", id);
          if (result.error) throw result.error;
          return { success: true };
        default:
          throw new Error("Unknown admin op: " + op);
      }
    } catch (err: any) {
      console.error("Admin Op Error:", err);
      throw err;
    }
  };

  const handleConfirmPayment = async () => {
    if (!activeOrder || !activeChatId) return;
    const activeChat = chats.find((chat) => chat.id === activeChatId);
    if (!activeChat?.userId) return;
    const safeAmount = Number(activeOrder.amount || 0);
    if (
      !window.confirm(
        `Confirm payment of ₦${safeAmount.toLocaleString()} for ${activeOrder.user_email || "User"}?`,
      )
    )
      return;

    const now = new Date().toISOString();
    const nowMs = Date.now();
    const optimisticMessageId = `temp-sys-${nowMs}`;
    let systemMessageInserted = false;
    const confirmMessage =
      "Payment Confirmed! 🚀 We are currently preparing your login details. Please stay active; they will be sent here shortly.";

    // Optimistic UI updates
    setActiveOrder((prev: any) =>
      prev ? { ...prev, status: "confirmed", confirmed_at: now } : prev,
    );
    setOrders((prev) =>
      prev.map((o) =>
        o.id === activeOrder.id
          ? { ...o, status: "confirmed", confirmed_at: now }
          : o,
      ),
    );

    // Optimistic Message
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticMessageId,
        chatId: activeChatId,
        orderId: activeOrder.id,
        senderRole: "system",
        message: confirmMessage,
        senderId: userId || "",
        senderName: "System Protocol",
        createdAt: nowMs,
        status: "pending",
      },
    ]);

    try {
      // Update order
      await adminOp("update", {
        collection: "orders",
        id: activeOrder.id,
        data: {
          status: "confirmed",
          confirmed_by: user?.primaryEmailAddress?.emailAddress,
          confirmed_at: now,
          updated_at: now,
        },
      });

      // Send automated message
      const insertedMessageId = await chatService.sendMessage(
        activeChatId,
        {
          senderRole: "system",
          message: confirmMessage,
          senderName: "System Protocol",
          orderId: activeOrder.id,
          userId: activeChat.userId,
        },
        getToken,
      );
      systemMessageInserted = true;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === optimisticMessageId
            ? {
                ...message,
                id: insertedMessageId,
                status: "sent",
              }
            : message,
        ),
      );

      // Create subscription
      const months = activeOrder.plan_months || 1;
      const ends_at_iso = new Date(
        nowMs + months * 29 * 24 * 60 * 60 * 1000,
      ).toISOString();

      await adminOp("add", {
        collection: "subscriptions",
        data: {
          user_id: activeOrder.user_id,
          order_id: activeOrder.id,
          product_name: activeOrder.product_name || "CapCut Max Pro",
          plan_duration: activeOrder.plan_duration,
          starts_at: now,
          ends_at: ends_at_iso,
          status: "active",
          created_at: now,
          updated_at: now,
        },
      });

      await adminOp("update", {
        collection: "chats",
        id: activeChatId,
        data: {
          needs_admin_attention: false,
          updated_at: now,
        },
      });

      // Send email to user
      try {
        const token =
          typeof window !== "undefined" && (window as any).Clerk
            ? await (window as any).Clerk.session?.getToken()
            : null;
        await fetch("/api/email/trigger", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            user_id: activeOrder.user_id,
            email: activeOrder.user_email,
            type: "payment_confirmed",
          }),
        });
      } catch (err) {
        console.warn("Email failed", err);
      }

      toast.success("Payment Confirmed and Subscription provisioned.");
    } catch (error: any) {
      if (!systemMessageInserted) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === optimisticMessageId
              ? { ...message, status: "failed" }
              : message,
          ),
        );
      }
      console.error("Confirm payment error:", error);
      toast.error(
        `Confirm payment failed: ${error.message || "Unknown error"}`,
      );
    }
  };

  const filteredChats = chats.filter((c: any) => {
    if (filter === "open") return c.status === "open";
    if (filter === "closed") return c.status === "closed";
    if (filter === "needs_attention") return c.needs_admin_attention;
    return true;
  });

  return (
    <div className="w-full h-full min-h-0 md:p-6 bg-brand-bg flex items-center justify-center overflow-hidden">
      <LiquidGlass
        chromaticAberration={2}
        className="w-full h-full max-w-[1800px] flex overflow-hidden md:rounded-[2rem] border border-white/5 shadow-2xl relative"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.02), rgba(255,255,255,0.005))",
          backdropFilter: "blur(40px) saturate(1.8)",
        }}
      >
        {/* Search & List */}
        <div
          className={`
          ${showMobileList ? "flex" : "hidden md:flex"}
          w-full md:w-80 lg:w-96 border-r border-white/5 flex-col shrink-0 overflow-hidden z-20
        `}
        >
          <div className="p-6 md:p-4 border-b border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LiquidGlass
                  button
                  chromaticAberration={2}
                  component="button"
                  onClick={() => navigate("/admin")}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-brand-text/5 text-brand-text border border-white/10"
                >
                  <ChevronRight className="rotate-180" size={16} />
                </LiquidGlass>
                <h2 className="text-xl font-black uppercase tracking-[0.05em] text-brand-text drop-shadow-md">
                  Transmissions
                </h2>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <LiquidGlass
                button
                chromaticAberration={2}
                component="button"
                onClick={() => setFilter("all")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border ${filter === "all" ? "bg-brand-accent/20 border-brand-accent/50 text-white shadow-lg shadow-brand-accent/20" : "bg-white/5 border-white/10 text-brand-text-secondary hover:text-white"}`}
                title="All Transmissions"
              >
                <Filter size={14} />
                <span className="hidden lg:inline">All</span>
              </LiquidGlass>
              <LiquidGlass
                button
                chromaticAberration={2}
                component="button"
                onClick={() => setFilter("open")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border ${filter === "open" ? "bg-green-500/20 border-green-500/50 text-green-400 shadow-lg shadow-green-500/20" : "bg-white/5 border-white/10 text-brand-text-secondary hover:text-white"}`}
                title="Open Channels"
              >
                <MessageSquare size={14} />
                <span className="hidden lg:inline">Open</span>
              </LiquidGlass>
              <LiquidGlass
                button
                chromaticAberration={2}
                component="button"
                onClick={() => setFilter("needs_attention")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border ${filter === "needs_attention" ? "bg-red-500/20 border-red-500/50 text-red-400 shadow-lg shadow-red-500/20" : "bg-white/5 border-white/10 text-brand-text-secondary hover:text-white"}`}
                title="Needs Admin Attention"
              >
                <AlertTriangle size={14} />
                <span className="hidden lg:inline">Alerts</span>
              </LiquidGlass>
              <LiquidGlass
                button
                chromaticAberration={2}
                component="button"
                onClick={() => setFilter("closed")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border ${filter === "closed" ? "bg-white/20 border-white/40 text-white" : "bg-white/5 border-white/10 text-brand-text-secondary hover:text-white"}`}
                title="Closed Channels"
              >
                <XCircle size={14} />
                <span className="hidden lg:inline">Closed</span>
              </LiquidGlass>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-2 p-1 border border-brand-border bg-brand-surface rounded-xl">
                <button
                  onClick={() => setChatTypeFilter("support")}
                  className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                    chatTypeFilter === "support"
                      ? "bg-brand-accent text-white shadow-sm"
                      : "text-brand-text-secondary hover:text-brand-text"
                  }`}
                >
                  Support
                </button>
                <button
                  onClick={() => setChatTypeFilter("group")}
                  className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                    chatTypeFilter === "group"
                      ? "bg-brand-accent text-white shadow-sm"
                      : "text-brand-text-secondary hover:text-brand-text"
                  }`}
                >
                  Communities
                </button>
                <button
                  onClick={() => setChatTypeFilter("channel")}
                  className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                    chatTypeFilter === "channel"
                      ? "bg-brand-accent text-white shadow-sm"
                      : "text-brand-text-secondary hover:text-brand-text"
                  }`}
                >
                  Channels
                </button>
                <button
                  onClick={() => setChatTypeFilter("all")}
                  className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                    chatTypeFilter === "all"
                      ? "bg-brand-accent text-white shadow-sm"
                      : "text-brand-text-secondary hover:text-brand-text"
                  }`}
                >
                  All
                </button>
              </div>
              <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary w-4 h-4" />
              <input
                type="text"
                placeholder="Search..."
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 py-2.5 text-xs font-medium focus:ring-1 focus:ring-brand-accent text-white placeholder-brand-text-secondary outline-none transition-all"
              />
            </div>
          </div>
        </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {loading ? (
              <div className="space-y-2.5 p-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 animate-pulse"
                  >
                    <div className="w-9 h-9 rounded-full bg-white/5 shrink-0" />
                    <div className="flex-grow space-y-1.5 min-w-0">
                      <div className="w-20 h-3 bg-white/10 rounded" />
                      <div className="w-2/3 h-2.5 bg-white/5 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="p-12 text-center text-xs font-black uppercase tracking-widest text-brand-text-secondary opacity-40">
                No active transmissions
              </div>
            ) : (
              filteredChats.map((chat) => {
                const now = new Date();
                const time = new Date(chat.lastMessageAt || chat.createdAt);
                const diff = now.getTime() - time.getTime();
                const mins = Math.floor(diff / 60000);
                const hours = Math.floor(diff / 3600000);
                const days = Math.floor(diff / 86400000);

                let timeStr = "now";
                if (mins >= 1 && mins < 60) timeStr = mins + "m";
                else if (hours >= 1 && hours < 24) timeStr = hours + "h";
                else if (days >= 1 && days < 7) timeStr = days + "d";
                else if (days >= 7) timeStr = time.toLocaleDateString();

                const chatProfile = profiles.find((p) => p.clerk_id === chat.userId);
                const isOnline = chatProfile && isUserOnline(chatProfile.clerk_id || chatProfile.id, chatProfile.last_login_at);

                return (
                  <button
                    key={chat.id}
                    style={{
                      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                      background:
                        activeChatId === chat.id
                          ? "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))"
                          : "transparent",
                    }}
                    onClick={() => selectChat(chat.id!)}
                    className={`w-full p-5 md:p-4 text-left border-b border-white/5 relative group hover:bg-white/5 ${activeChatId === chat.id ? "border border-white/20 shadow-lg !border-b-white/20 z-10 scale-[1.01] rounded-xl" : ""}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[12px] bg-brand-accent/20 border border-brand-accent/30 flex items-center justify-center font-black text-xs text-brand-accent uppercase relative shadow-[inset_0_0_12px_rgba(255,255,255,0.1)] overflow-hidden">
                          {chat.coverImageUrl ? (
                            <img src={chat.coverImageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (chat.name || chat.userEmail || "User").charAt(0)
                          )}
                          {chat.needsAdminAttention && (
                            <span
                              className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-red-500 border-2 border-brand-bg animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]"
                              title="Needs attention"
                            />
                          )}
                          {isOnline && (
                            <span
                              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-brand-bg shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse z-10"
                              title="Online"
                            />
                          )}
                        </div>
                        <span className="text-[13px] font-black truncate max-w-[140px] tracking-wide text-brand-text drop-shadow-sm">
                          {chat.name || chat.userEmail || "Unknown"}
                        </span>
                      </div>
                      <span className="text-[10px] font-black uppercase text-brand-text-secondary opacity-80 mt-1">
                        {timeStr}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <p className="text-[11px] font-medium text-brand-text-secondary truncate max-w-[80%] pr-2 group-hover:text-brand-text transition-colors opacity-80">
                        {chat.lastMessage?.length > 40
                          ? chat.lastMessage.slice(0, 40) + "..."
                          : chat.lastMessage || "Channel established..."}
                      </p>
                      {chat.unreadCount ? (
                        <div className="bg-brand-accent text-white rounded-full min-w-[20px] h-5 text-[10px] font-black flex items-center justify-center px-1.5 shadow-[0_0_10px_rgba(0,71,255,0.4)]">
                          {chat.unreadCount}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5 mt-3">
                      <span
                        className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${chat.status === "open" ? "text-green-400 border-green-500/30 bg-green-500/10" : "text-brand-text-secondary opacity-60 border-white/10 bg-white/5"}`}
                      >
                        {chat.status}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div
          className={`
        ${!showMobileList ? "flex" : "hidden md:flex"}
        flex-1 flex flex-col z-10 w-full relative
      `}
        >
          {activeChatId ? (
            <div className="flex flex-col h-full bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.03),transparent_70%)] relative">
              <header className="px-6 md:px-8 py-4 border-b border-white/5 flex justify-between items-center shrink-0 z-10 shadow-sm sticky top-0 bg-brand-bg/50 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  <LiquidGlass
                    button
                    chromaticAberration={2}
                    component="button"
                    onClick={() => setShowMobileList(true)}
                    className="md:hidden w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 text-white shadow-md border border-white/10"
                  >
                    <ChevronRight className="rotate-180" size={20} />
                  </LiquidGlass>
                  <div className="w-10 h-10 rounded-[12px] bg-brand-accent/20 border border-brand-accent/30 flex items-center justify-center text-brand-accent font-black text-sm shadow-[inset_0_0_12px_rgba(255,255,255,0.1)] overflow-hidden">
                    {chats.find((c) => c.id === activeChatId)?.coverImageUrl ? (
                      <img src={chats.find((c) => c.id === activeChatId)?.coverImageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (
                        chats.find((c) => c.id === activeChatId)?.name ||
                        chats.find((c) => c.id === activeChatId)?.userEmail ||
                        "User"
                      )
                        .charAt(0)
                        .toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[13px] font-black uppercase tracking-[0.05em] truncate max-w-[180px] sm:max-w-none text-white drop-shadow-sm">
                      {chats.find((c) => c.id === activeChatId)?.name ||
                        chats.find((c) => c.id === activeChatId)?.userEmail ||
                        "Unknown"}
                    </h3>
                    {chats.find((c) => c.id === activeChatId)
                      ?.needsAdminAttention && (
                      <span
                        className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse ml-2 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                        title="Needs attention"
                      />
                    )}
                    <div className="text-[9px] font-black text-brand-text-secondary uppercase tracking-widest flex items-center gap-1.5 opacity-80 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full shadow-[0_0_6px_rgba(74,222,128,0.6)] ${activeOrder ? 'bg-green-400' : 'bg-blue-400'}`} />
                      {chats.find(c => c.id === activeChatId)?.chatType === 'group' ? 'Community Protocol' : 
                       chats.find(c => c.id === activeChatId)?.chatType === 'channel' ? 'Broadcast Channel' : 
                       activeOrder ? `ID: ${activeOrder.order_reference}` : 'General Support'}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  {chats.find(c => c.id === activeChatId)?.chatType === 'group' || chats.find(c => c.id === activeChatId)?.chatType === 'channel' ? (
                     <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border shadow-sm backdrop-blur-md bg-indigo-500/10 text-indigo-400 border-indigo-500/30">
                        <Users size={14} />
                        <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">
                          {chats.find(c => c.id === activeChatId)?.chatType}
                        </span>
                     </div>
                  ) : activeOrder && (
                    <div
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-full border shadow-sm backdrop-blur-md ${
                        activeOrder.delivery_status === "delivered"
                          ? "bg-green-500/10 text-green-400 border-green-500/30"
                          : activeOrder.delivery_status === "pending_login"
                            ? "bg-orange-500/10 text-orange-400 border-orange-500/30 animate-pulse"
                            : "bg-white/5 text-brand-text-secondary border-white/10"
                      }`}
                    >
                      {activeOrder.delivery_status === "delivered" ? (
                        <>
                          <CheckCircle2 size={14} />{" "}
                          <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">
                            ✅ Active
                          </span>
                        </>
                      ) : activeOrder.delivery_status === "pending_login" ? (
                        <>
                          <Clock size={14} className="animate-spin-slow" />{" "}
                          <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">
                            ⏳ Awaiting Delivery
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          Support
                        </span>
                      )}
                    </div>
                  )}
                  {chats.find((c) => c.id === activeChatId)?.status ===
                    "open" && (
                    <LiquidGlass
                      button
                      chromaticAberration={2}
                      component="button"
                      onClick={() =>
                        adminOp("update", {
                          collection: "chats",
                          id: activeChatId,
                          data: { status: "closed", updated_at: Date.now() },
                        })
                      }
                      className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.1em] border border-white/10 shadow-lg text-white hover:border-white/30 transition-all hidden md:flex items-center justify-center bg-white/5"
                    >
                      Close
                    </LiquidGlass>
                  )}
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 md:space-y-8 scrollbar-hide">
                <AnimatePresence initial={false}>
                  {messages
                    .filter((msg, index, self) => msg && index === self.findIndex((m) => m && m.id === msg.id))
                    .map((msg, index) => {
                      const isSelf =
                        msg.senderRole === "admin" ||
                        msg.senderRole === "system" ||
                        msg.senderRole === "bot";
                      const isSystem = msg.senderRole === "system";

                      if (isSystem)
                        return (
                          <div key={msg.id} className="flex justify-center">
                            <span className="px-3 py-1 bg-brand-text/5 border border-brand-border rounded-full text-[9px] font-black text-brand-text-secondary uppercase tracking-widest">
                              {msg.message}
                            </span>
                          </div>
                        );

                    const prevMsg = index > 0 ? messages[index - 1] : null;
                    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

                    const getSenderGroup = (m: any) => {
                      if (!m) return null;
                      if (m.senderRole === "system") return "system";
                      const isMself = m.senderRole === "admin" || m.senderRole === "bot" || m.senderRole === "assistant";
                      return isMself ? "admin" : "user";
                    };

                    const senderGroup = getSenderGroup(msg);
                    const prevSenderGroup = getSenderGroup(prevMsg);
                    const nextSenderGroup = getSenderGroup(nextMsg);

                    const isPrevSameSender = prevSenderGroup === senderGroup;
                    const isNextSameSender = nextSenderGroup === senderGroup;

                    const light = typeof document !== 'undefined' && document?.documentElement?.classList?.contains("light");
                    const bubbleGlassStyle = isSelf
                      ? {
                          background: light
                            ? "linear-gradient(135deg, rgba(0, 102, 255, 0.16), rgba(0, 102, 255, 0.05))"
                            : "linear-gradient(135deg, rgba(0, 102, 255, 0.22), rgba(0, 102, 255, 0.08))",
                          boxShadow: light
                            ? "inset 0 1px 1.5px 0px rgba(255, 255, 255, 0.4)"
                            : "inset 0 1px 1px 0px rgba(255, 255, 255, 0.15)",
                          color: light ? "#0f172a" : "#ffffff",
                          borderColor: "rgba(255, 255, 255, 0.1)",
                        }
                      : {
                          background: light
                            ? "linear-gradient(135deg, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.45))"
                            : "linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))",
                          boxShadow: light
                            ? "inset 0 1px 1.5px 0px rgba(255, 255, 255, 0.7)"
                            : "inset 0 1px 1px 0px rgba(255, 255, 255, 0.15)",
                          color: light ? "#1e293b" : "#e2e8f0",
                          borderColor: "rgba(255, 255, 255, 0.1)",
                        };

                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className={`flex ${isSelf ? "justify-end" : "justify-start"} ${isPrevSameSender ? "mt-1 md:mt-1.5 !mt-1.5" : "mt-6 md:mt-8 !mt-8"}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[70%] flex gap-2 md:gap-3 ${isSelf ? "flex-row-reverse" : ""}`}
                        >
                          {!isNextSameSender ? (
                            <div
                              className={`w-7 h-7 md:w-8 md:h-8 rounded-full shrink-0 flex items-center justify-center font-black text-[9px] md:text-[10px] shadow-md border border-white/10 ${isSelf ? "bg-brand-accent text-white" : "bg-white/10 border border-white/20 text-white backdrop-blur-md"}`}
                            >
                              {isSelf ? "A" : "C"}
                            </div>
                          ) : (
                            <div className="w-7 h-7 md:w-8 md:h-8 shrink-0" />
                          )}
                          <div
                            className={`space-y-1 ${isSelf ? "items-end" : "items-start"} flex flex-col`}
                          >
                            {(msg as any).messageType === 'audio' || (msg as any).audioUrl ? (
                              <div className="mt-1 flex">
                                <VoiceNotePlayer url={(msg as any).audioUrl || msg.attachmentUrl || ''} />
                              </div>
                            ) : msg.attachmentUrl ? (
                              <div className="liquid-glass p-1.5 border border-brand-border rounded-xl">
                                <img
                                  src={optimizeCloudinaryUrl(msg.attachmentUrl)}
                                  loading="lazy"
                                  className="max-w-[180px] sm:max-w-[240px] rounded-lg hover:scale-[1.02] transition-transform cursor-pointer"
                                  alt="Attachment"
                                />
                              </div>
                            ) : null}
                            {(msg.message || (!msg.attachmentUrl && !(msg as any).audioUrl)) && (
                              <div
                                style={bubbleGlassStyle}
                                className={`p-3 md:p-4 px-4 md:px-5 text-xs md:text-sm font-medium tracking-tight leading-relaxed border-[0.5px] backdrop-blur-xl transition-all duration-300 ease-in-out ${isSelf ? "rounded-[20px] rounded-br-[4px]" : "rounded-[20px] rounded-bl-[4px]"} ${(msg as any).status === "pending" ? "opacity-70 scale-95" : ""} ${(msg as any).status === "failed" ? "border-red-500 bg-red-500/20" : ""}`}
                              >
                                {msg.message || "..."}
                              </div>
                            )}
                            {!isNextSameSender && (
                              <div className="flex items-center gap-2 px-1 text-[8px] font-black text-brand-text-secondary/40 uppercase tracking-widest mt-0.5">
                                <span>
                                  {new Date(msg.createdAt).toLocaleTimeString(
                                    [],
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                </span>
                                {isSelf && (msg as any).status === "pending" && (
                                  <span className="flex items-center gap-1">
                                    <Clock size={10} className="animate-pulse" />{" "}
                                    Pending
                                  </span>
                                )}
                                {isSelf && (msg as any).status !== "pending" && (
                                  <span className="flex items-center gap-1 text-green-500 font-bold">
                                    ✅ Sent
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {uploading && (
                  <div className="flex items-end justify-end mt-4 mb-2 animate-pulse group">
                    <div className="bg-blue-600/10 border border-blue-500/20 rounded-[20px] rounded-br-[4px] p-3 md:p-4 px-4 w-64 max-w-full h-[60px] flex items-center justify-center relative overflow-hidden backdrop-blur-xl">
                       <div className="w-full flex items-center gap-3 opacity-50">
                         <div className="w-10 h-10 rounded-full bg-blue-500/20 shrink-0"></div>
                         <div className="flex-1 space-y-2">
                           <div className="h-2 bg-blue-500/20 rounded-full w-full"></div>
                           <div className="h-2 bg-blue-500/20 rounded-full w-2/3"></div>
                         </div>
                       </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 md:p-6 bg-brand-bg/50 backdrop-blur-xl border-t border-white/5 z-10 shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                <form
                  onSubmit={handleSendMessage}
                  className="flex gap-3 max-w-4xl mx-auto items-center"
                >
                  <LiquidGlass
                    button
                    chromaticAberration={2}
                    component="label"
                    className="w-12 h-12 md:w-14 md:h-14 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-full flex items-center justify-center cursor-pointer transition-colors shadow-sm shrink-0 border border-white/10"
                  >
                    <Paperclip className="w-5 h-5 text-white" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !activeChatId) return;

                        const activeChat = chats.find(
                          (c) => c.id === activeChatId,
                        );
                        if (!activeChat) return;

                        const tempId = `temp-img-${Date.now()}`;
                        const previewUrl = URL.createObjectURL(file);
                        const msgText = inputText.trim() || "";

                        const optimisticMsg: any = {
                          id: tempId,
                          chatId: activeChatId,
                          orderId: activeOrder?.id || "",
                          senderRole: "admin",
                          message: msgText,
                          senderId: userId || "",
                          senderName: user?.fullName || "Admin Support",
                          createdAt: Date.now(),
                          status: "sending",
                          attachmentUrl: previewUrl,
                          attachmentType: file.type || "image",
                        };

                        setMessages((prev) => [...prev, optimisticMsg]);
                        setInputText("");

                        toast.loading("Uploading...", { id: "admin-upload" });

                        try {
                          const cloudinaryUrl = await compressAndUpload(
                            file,
                            (status) => {
                              toast.loading(status, { id: "admin-upload" });
                            },
                          );

                          if (cloudinaryUrl) {
                            try {
                              await setSupabaseAuth(getToken, true);
                              const insertedId = await chatService.sendMessage(
                                activeChatId,
                                {
                                  senderRole: "admin",
                                  message: msgText,
                                  senderId: userId || "",
                                  senderName: user?.fullName || "Admin Support",
                                  orderId: activeOrder?.id || undefined,
                                  userId: activeChat.userId,
                                  attachmentUrl: cloudinaryUrl,
                                  attachmentType: file.type || "image",
                                },
                                getToken,
                              );

                              setMessages((prev) =>
                                prev.map((m) =>
                                  m.id === tempId
                                    ? {
                                        ...m,
                                        id: insertedId,
                                        status: "sent",
                                        attachmentUrl: cloudinaryUrl,
                                      }
                                    : m,
                                ),
                              );

                              toast.success("Image sent!", {
                                id: "admin-upload",
                              });
                            } catch {
                              console.error("Admin image message save failed", {
                                chatId: activeChatId,
                              });
                              toast.error("Failed to save message", {
                                id: "admin-upload",
                              });
                              setMessages((prev) =>
                                prev.map((m) =>
                                  m.id === tempId
                                    ? { ...m, status: "failed" }
                                    : m,
                                ),
                              );
                            }
                          }
                        } catch {
                          console.error("Admin image upload failed", {
                            chatId: activeChatId,
                          });
                          toast.error("Upload failed", { id: "admin-upload" });
                          setMessages((prev) =>
                            prev.filter((m) => m.id !== tempId),
                          );
                        } finally {
                          URL.revokeObjectURL(previewUrl);
                        }
                      }}
                    />
                  </LiquidGlass>
                  {isRecording ? (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex-1 w-full flex items-center justify-between text-xs md:text-sm text-slate-900 dark:text-white"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                        <span className="font-mono">{formatTimer(duration)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                         <button
                           type="button"
                           onClick={cancelRecording}
                           className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                         >
                           <Trash2 size={18} />
                         </button>
                         <button
                           type="button"
                           onClick={async () => {
                             const blob = await stopRecording();
                             handleAdminAudioUpload(blob);
                           }}
                           className="w-10 h-10 md:px-6 md:w-auto flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 border uppercase tracking-wider font-extrabold text-[12px] gap-2 bg-[#3b82f6] text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20 active:scale-95 cursor-pointer border-blue-500/50"
                         >
                           <Send size={16} />
                           <span className="hidden md:inline">Send</span>
                         </button>
                      </div>
                    </motion.div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={inputText}
                        onChange={handleTyping}
                        placeholder="Type your response..."
                        className="flex-1 w-full bg-white/5 border border-white/10 rounded-xl md:rounded-full px-5 py-3 md:py-4 text-xs md:text-sm shadow-[inset_0_0_20px_rgba(255,255,255,0.02)] font-medium focus:outline-none focus:ring-1 focus:ring-brand-accent/50 text-white placeholder-brand-text-secondary"
                      />

                      {inputText.trim() ? (
                        <button
                          type="submit"
                          className="w-12 h-12 md:px-6 md:w-auto flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 border uppercase tracking-wider font-extrabold text-[12px] gap-2 bg-[#3b82f6] text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20 active:scale-95 cursor-pointer border-blue-500/50"
                        >
                          <Send size={16} />
                          <span className="hidden md:inline">Send</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={startRecording}
                          className="w-12 h-12 md:px-4 md:w-auto flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 border uppercase tracking-wider font-extrabold text-[12px] gap-2 bg-white/5 text-white/50 border-white/10 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 cursor-pointer"
                        >
                          <Mic size={16} />
                        </button>
                      )}
                    </>
                  )}
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50 p-8">
              <div className="p-8 text-center bg-white/5 border border-white/10 rounded-[2rem] shadow-[inset_0_0_20px_rgba(255,255,255,0.02)] relative overflow-hidden backdrop-blur-md">
                <div className="absolute -top-24 -left-24 w-64 h-64 bg-brand-accent/10 rounded-full blur-3xl pointer-events-none" />
                <h4 className="text-xl font-black uppercase tracking-[0.05em] mb-2 text-white drop-shadow-md">
                  Transmission Link
                </h4>
                <p className="text-sm font-medium text-brand-text-secondary leading-relaxed max-w-md mx-auto">
                  Select an active signal from the network queue to initialize
                  the command interface.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Side Panel (Desktop only) */}
        <div className="w-80 border-l border-white/5 flex-col overflow-hidden hidden xl:flex z-10 shrink-0">
          {activeOrder ? (
            <div className="flex-1 overflow-y-auto p-8 space-y-10">
              <div className="space-y-2">
                <span className="text-[10px] font-black text-brand-text-secondary uppercase tracking-[0.3em]">
                  Operational Unit
                </span>
                <h3 className="text-2xl font-black uppercase tracking-tight">
                  {activeOrder.product_name}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-brand-accent/10 border border-brand-accent/20 text-brand-accent rounded text-[8px] font-black uppercase tracking-widest">
                    {activeOrder.plan_duration}
                  </span>
                  <span className="text-[10px] font-black text-brand-text-secondary/60 ml-auto">
                    ₦{Number(activeOrder.amount || 0).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-brand-text-secondary uppercase tracking-widest">
                      Order Status
                    </span>
                    <p className="text-[10px] font-black uppercase text-brand-accent">
                      {String(activeOrder.status || "").replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="space-y-1 text-right">
                    <span className="text-[9px] font-black text-brand-text-secondary uppercase tracking-widest">
                      Signed At
                    </span>
                    <p className="text-[10px] font-black text-brand-text-secondary/40">
                      {new Date(activeOrder.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {activeOrder.delivery_status === "delivered" ? (
                  <div className="p-6 bg-green-500/5 border border-green-500/10 rounded-2xl flex flex-col items-center text-center gap-3">
                    <CheckCircle2 className="text-green-500" size={32} />
                    <h4 className="text-xs font-black uppercase tracking-widest text-green-500">
                      Operation Active
                    </h4>
                    <p className="text-[9px] font-medium text-brand-text-secondary uppercase tracking-widest">
                      Assets provisioned at{" "}
                      {new Date(
                        activeOrder.logins_sent_at || 0,
                      ).toLocaleString()}
                    </p>
                  </div>
                ) : (
                  <div className="p-6 bg-orange-500/5 border border-orange-500/10 rounded-2xl flex flex-col items-center text-center gap-3">
                    <Clock className="text-orange-500" size={32} />
                    <h4 className="text-xs font-black uppercase tracking-widest text-orange-500">
                      Pending Delivery
                    </h4>
                    <p className="text-[9px] text-center font-medium text-brand-text-secondary uppercase tracking-widest opacity-60">
                      Verified via Paystack
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-40">
              <Clock
                size={40}
                className="mx-auto mb-6 text-white drop-shadow-md"
              />
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-white">
                Select entry for audit
              </p>
            </div>
          )}
        </div>
      </LiquidGlass>
    </div>
  );
}
