Warning: truncated output (original token count: 19114)
Total output lines: 1751

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
  const messageViewportRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const lastRenderedMessageIdRef = useRef<string | null>(null);
  const isFetchingMessagesRef = useRef(false);

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
      // Realtime normally delivers messages immediately. This guard prevents a
      // realtime event and the fallback poll from rendering the same large chat
      // history at the same time, which was the main cause of scroll jank.
      if (isFetchingMessagesRef.current) return;
      isFetchingMessagesRef.current = true;
      try {
      const canonicalResult = await supabase
        .from("messages")
        .select("id,chat_id,order_id,user_id,sender_role,content,attachment_url,attachment_type,audio_url,message_type,read_by_admin,created_at")
        .in("chat_id", activeHistoryChatIds)
        .order("created_at", { ascending: false })
        .limit(250);

      let legacyRows: any[] = [];
      if (activeHistoryIsSupport && activeHistoryOwnerUserId) {
        const legacyResult = await supabase
          .from("messages")
          .select("id,chat_id,order_id,user_id,sender_role,content,attachment_url,attachment_type,audio_url,message_type,read_by_admin,created_at")
          .is("chat_id", null)
          .eq("user_id", activeHistoryOwnerUserId)
          .in("sender_role", [...LEGACY_SUPPORT_MESSAGE_ROLES])
          .order("created_at", { ascending: false })
          .limit(250);
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

        // Do not write to Supabase every time the fallback poll runs. Mark only
        // actual unread customer messages, once they are on screen.
        const unreadCustomerMessages = rawRows.filter((row: any) =>
          !["admin", "system", "bot", "assistant"].includes(String(row.sender_role || "").toLowerCase()) &&
          row.read_by_admin !== true,
        );
        if (unreadCustomerMessages.length) {
          const readResults = await Promise.all([
            supabase.from("messages").update({ read_by_admin: true }).in("id", unreadCustomerMessages.map((row: any) => row.id)),
            supabase.from("chats").update({ unread_count: 0 }).in("id", activeHistoryChatIds),
          ]);
          if (readResults.some((result) => result.error)) console.error("Failed to mark displayed support messages as read");
        }
      }
      } finally {
        isFetchingMessagesRef.current = false;
      }
    };

    fetchMessages();
    pollingInterval = setInterval(fetchMessages, 15000); // Realtime is primary; polling is only a safety net.

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
      …9114 tokens truncated…iv
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

