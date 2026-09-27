import React, { useState, useEffect, useRef } from "react";
import {
  useSearchParams,
  useNavigate,
  Link,
  useLocation,
} from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { toast, Toaster } from "react-hot-toast";
import { supabase, setSupabaseAuth } from "../lib/supabase";
import {
  Send,
  Paperclip,
  FileImage,
  ShieldCheck,
  User,
  ArrowLeft,
  Loader2,
  Clock,
  Key,
  Copy,
  Calendar,
  Mic,
  Square,
  Trash2,
} from "lucide-react";
import { optimizeCloudinaryUrl } from "../lib/cloudinary";
import { compressAndUpload } from "../utils/uploadMedia";
import {
  chatService,
  Chat as ChatType,
  ChatMessage,
} from "../services/chatService";
import { Logo } from "../components/ui/Logo";
import { VoiceNotePlayer } from "../components/chat/VoiceNotePlayer";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import {
  filterSupportChatRows,
  LEGACY_SUPPORT_MESSAGE_ROLES,
  mergeSupportChatMessages,
  markMessageFailed,
  markMessageSent,
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

// Support conversations can be long-lived. Keep the initial/fallback sync
// bounded; realtime delivers new rows and the personal-chat UI owns the full
// cursor-pagination experience for high-volume conversations.
const SUPPORT_CHAT_PAGE_SIZE = 100;
const SUPPORT_CHAT_MESSAGE_COLUMNS = "id,chat_id,user_id,sender_id,sender_name,sender_role,content,attachment_url,attachment_type,message_type,audio_url,read_by_user,created_at,event";

function VerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-label="Verified Plugsy account"
      role="img"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="shrink-0"
    >
      <circle cx="10" cy="10" r="9" fill="#0877ff" />
      <path
        d="m5.8 10.2 2.55 2.55 5.85-6"
        fill="none"
        stroke="#fff"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Chat() {
  const renderMessageTextWithLinks = (text: string, isUser: boolean) => {
    if (!text) return "";
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const parts = text.split(urlRegex);
    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`${
              isUser
                ? "text-white underline font-semibold hover:text-blue-100 decoration-white/50"
                : "text-blue-500 dark:text-blue-400 underline font-semibold hover:text-blue-600 dark:hover:text-blue-300"
            } break-all cursor-pointer inline-block`}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const { isLoaded: authLoaded, getToken } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const clerkUserId = user?.id;
  const userId = clerkUserId;
  const userEmail = user?.primaryEmailAddress?.emailAddress;
  const userName = user?.fullName || "Customer";
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId") || searchParams.get("order_id");
  const navigate = useNavigate();
  const location = useLocation();

  const [chat, setChat] = useState<ChatType | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [order, setOrder] = useState<any>(null);
  const [inputText, setInputText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [supportProfileOpen, setSupportProfileOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const debouncedStopTypingRef = useRef<any>(null);

  useEffect(() => {
    if (!chat?.id) return;
    
    // Polling for typing indicator
    const pollTyping = setInterval(async () => {
      try {
        const { data: chatData } = await supabase
          .from("chats")
          .select("typing_users")
          .eq("id", chat.id)
          .single();

        const typing = chatData?.typing_users || {};
        const now = Date.now();
        const activeTypers = new Map();

        Object.entries(typing).forEach(([tUserId, info]: [string, any]) => {
          if (tUserId !== userId && (now - info.timestamp) < 4000) {
            activeTypers.set(tUserId, info.name);
          }
        });
        setTypingUsers(activeTypers);
      } catch (e) {
        // ignore
      }
    }, 2000);

    return () => clearInterval(pollTyping);
  }, [chat?.id, userId]);



  const updateTypingStatus = async (isTyping: boolean) => {
    try {
      if (!chat?.id || !userId) return;
      const { data: chatData } = await supabase
        .from("chats")
        .select("typing_users")
        .eq("id", chat.id)
        .single();

      const current = chatData?.typing_users || {};

      if (isTyping) {
        current[userId] = {
          name: user?.fullName || user?.username || "Someone",
          timestamp: Date.now()
        };
      } else {
        delete current[userId];
      }

      await supabase
        .from("chats")
        .update({ typing_users: current })
        .eq("id", chat.id);
    } catch {
      console.error("[typing] update failed", { chatId: chat?.id });
    }
  };

  const isTypingRef = useRef(false);

  const handleInputChange = (text: string) => {
    setInputText(text);

    if (!isTypingRef.current) {
        updateTypingStatus(true);
        isTypingRef.current = true;
    }

    if (debouncedStopTypingRef.current) {
      clearTimeout(debouncedStopTypingRef.current);
    }
    debouncedStopTypingRef.current = setTimeout(() => {
      updateTypingStatus(false);
      isTypingRef.current = false;
    }, 2000);
  };

  const persistOptimisticMessage = async (optimisticMsg: ChatMessage) => {
    if (!chat?.id || !optimisticMsg.id) return;

    setMessages((prev) =>
      prev.map((message) =>
        message.id === optimisticMsg.id
          ? { ...message, status: "pending" }
          : message,
      ),
    );

    try {
      await setSupabaseAuth(getToken, true);
      const insertedId = await chatService.sendMessage(
        chat.id,
        {
          senderRole: "user",
          message: optimisticMsg.message,
          senderId: optimisticMsg.senderId || userId || "",
          senderName: optimisticMsg.senderName || user?.fullName || "Customer",
          orderId: orderId || undefined,
          userId: userId || undefined,
          attachmentUrl: optimisticMsg.attachmentUrl,
          attachmentType: optimisticMsg.attachmentType,
          messageType: optimisticMsg.messageType,
          audioUrl: optimisticMsg.audioUrl,
        },
        getToken,
      );

      setMessages((prev) =>
        markMessageSent(prev, optimisticMsg.id!, insertedId),
      );
    } catch {
      console.error("Failed to send support message", {
        chatId: chat.id,
        senderRole: optimisticMsg.senderRole,
      });
      setMessages((prev) => markMessageFailed(prev, optimisticMsg.id!));

      if (optimisticMsg.message) {
        setInputText((current) => current || optimisticMsg.message);
      }

      toast.error("Message could not be sent. Tap to retry.", {
        id: `support-message-send-${optimisticMsg.id}`,
      });
    }
  };

  // Audio Recording
  const { isRecording, duration, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();
  const formatTimer = (time: number) => {
    const min = Math.floor(time / 60);
    const sec = time % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const handleAudioUpload = async (audioBlob: Blob) => {
    if (!chat?.id) return;
    setUploading(true);
    setUploadProgress(10);
    try {
      const file = new File([audioBlob], `voicenote_${Date.now()}.webm`, { type: 'audio/webm' });
      const audioUrl = await compressAndUpload(file);
      
      setUploadProgress(80);
      
      const optimisticFileMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        chatId: chat.id,
        orderId: orderId || "",
        senderRole: "user",
        message: "",
        senderId: userId || "",
        senderName: user?.fullName || "Customer",
        createdAt: Date.now(),
        messageType: "audio",
        audioUrl: audioUrl,
        status: "pending",
      };
      setMessages((prev) => [...prev, optimisticFileMsg]);
      await persistOptimisticMessage(optimisticFileMsg);

    } catch {
      console.error("Voice note upload failed", { chatId: chat?.id });
      toast.error("Failed to upload voice note");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };
  const [realtimeStatus, setRealtimeStatus] = useState<
    "SUBSCRIBED" | "CLOSED" | "CHANNEL_ERROR"
  >("CLOSED");
  const [hasWelcomed, setHasWelcomed] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const pollingRef = useRef<any>(null);

  const chatInitialized = useRef(false);

  useEffect(() => {
    if (!authLoaded || !userLoaded) return;

    if (!userId) {
      setLoading(false);
      navigate("/login");
      return;
    }

    const initChat = async () => {
      if (!userId || chatInitialized.current) return;
      chatInitialized.current = true;

      try {
        await setSupabaseAuth(getToken);
        const uId = String(userId);
        const activeChat = await chatService.getOrCreateChat(
          uId,
          user?.primaryEmailAddress?.emailAddress || "unknown@user.com",
        );
        setChat(activeChat);

        // Fetch order if orderId exists
        if (orderId) {
          const { data: orderData } = await supabase
            .from("orders")
            .select("*")
            .eq("id", orderId)
            .maybeSingle();

          if (orderData) {
            setOrder(orderData);
          }
        }
      } catch {
        console.error("Support chat initialization failed");
      } finally {
        setLoading(false);
      }
    };

    if (authLoaded && userLoaded && userId) {
      initChat();
    }

    const fetchOrder = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      if (data) setOrder(data);
    };

    const pollingInterval = setInterval(() => {
      fetchOrder();
    }, 10000);

    const orderSub = supabase
      .channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        fetchOrder,
      )
      .subscribe((status) => {
        setRealtimeStatus(status as any);
        if (status === "CHANNEL_ERROR") {
          console.log("Realtime unavailable for order, using polling instead.");
        }
      });

    return () => {
      clearInterval(pollingInterval);
      if (orderSub) {
        supabase.removeChannel(orderSub).catch(() => {});
      }
    };
  }, [orderId, authLoaded, userLoaded, userId]);

  useEffect(() => {
    if (!chat?.id) return;

    const fetchMessages = async () => {
      try {
        const canonicalUserId = String(userId || "").trim();
        if (!canonicalUserId) return;
        const supportChatIds =
          chat.supportChatIds?.filter(Boolean) || [chat.id];

        const [canonicalResult, legacyResult] = await Promise.all([
          supabase
            .from("messages")
            .select(SUPPORT_CHAT_MESSAGE_COLUMNS)
            .in("chat_id", supportChatIds)
            .order("created_at", { ascending: false })
            .limit(SUPPORT_CHAT_PAGE_SIZE),
          supabase
            .from("messages")
            .select(SUPPORT_CHAT_MESSAGE_COLUMNS)
            .is("chat_id", null)
            .eq("user_id", canonicalUserId)
            .in("sender_role", [...LEGACY_SUPPORT_MESSAGE_ROLES])
            .order("created_at", { ascending: false })
            .limit(SUPPORT_CHAT_PAGE_SIZE),
        ]);

        if (canonicalResult.error || legacyResult.error) {
          console.error("[support-chat] failed to fetch message history");
          toast.error("Messages could not be loaded. Please try again.", {
            id: "support-chat-history-error",
          });
          return;
        }

        const chatRows = filterSupportChatRows(
          [...(canonicalResult.data || [])].reverse().concat([...(legacyResult.data || [])].reverse()),
          supportChatIds,
          canonicalUserId,
        );

        // Map Supabase columns to ChatMessage interface
        const msgs = chatRows.map((d: any) => ({
          ...d,
          chatId: d.chat_id || chat.id,
          senderId: d.sender_id,
          senderName: d.sender_name,
          senderRole: d.sender_role,
          message: getCleanMessageText(d.content),
          attachmentUrl: d.attachment_url,
          attachmentType: d.attachment_type,
          audioUrl: d.audio_url,
          messageType: d.message_type,
          createdAt: new Date(d.created_at).getTime(),
          event:
            d.event ||
            (d.attachment_type?.startsWith("event_")
              ? d.attachment_type.replace("event_", "")
              : d.event),
        }));

        setMessages((prev) => {
          const optimisticMsgs = prev.filter(
            (message) =>
              message.chatId === chat.id &&
              (message.status === "pending" || message.status === "failed"),
          );
          const optimisticMatches = (dbMsg: ChatMessage) =>
            optimisticMsgs.some(
              (optimisticMsg) =>
                dbMsg.senderRole === optimisticMsg.senderRole &&
                dbMsg.message === optimisticMsg.message &&
                Math.abs(dbMsg.createdAt - optimisticMsg.createdAt) < 5000,
            );
          const mergedMessages = mergeSupportChatMessages(
            msgs.filter((dbMsg) => !optimisticMatches(dbMsg)),
            optimisticMsgs,
          );

          // Prevent excessive renders
          if (
            mergedMessages.length !== prev.length ||
            mergedMessages.some(
              (message, index) =>
                message.id !== prev[index]?.id ||
                message.status !== prev[index]?.status,
            )
          ) {
            return mergedMessages;
          }
          return prev;
        });

        // Update only unread rows that were actually delivered to this client.
        // This avoids repeatedly writing an entire support-chat history while a
        // fallback poll is active.
        const unreadMessageIds = chatRows
          .filter((message: any) => !message.read_by_user && message.sender_role !== "user")
          .map((message: any) => message.id)
          .filter(Boolean);
        if (unreadMessageIds.length) {
          const { error: readError } = await supabase
            .from("messages")
            .update({ read_by_user: true })
            .in("id", unreadMessageIds);
          if (readError) {
            console.error("Failed to mark support messages as read");
          }
        }
      } catch {
        console.error("[support-chat] failed to fetch message history");
        toast.error("Messages could not be loaded. Please try again.", {
          id: "support-chat-history-error",
        });
      }
    };

    fetchMessages();
    pollingRef.current = setInterval(fetchMessages, 5000);

    // Visibility change handler
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[realtime] tab became visible, refreshing...");
        fetchMessages();
      }
    };
    
    const handleOnline = () => {
      console.log("[realtime] network back online");
      fetchMessages();
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    const setupRealtime = (chatId: string, userId: string) => {
      console.log("[realtime] setting up channel for:", chatId || userId);
    
      const channelName = "support-chat-" + chatId;
    
      let channel = supabase.channel(channelName, {
        config: {
          broadcast: { self: true },
        }
      });
    
      const supportChatIds =
        chat.supportChatIds?.filter(Boolean) || [chatId];
      supportChatIds.forEach((supportChatId) => {
        channel = channel.on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: "chat_id=eq." + supportChatId
          },
          (payload) => {
            const d = payload.new;
            if (!supportChatIds.includes(d.chat_id)) {
              fetchMessages();
              return;
            }

            const newMsg = {
              ...d,
              chatId: d.chat_id || chatId,
              senderId: d.sender_id,
              senderName: d.sender_name,
              senderRole: d.sender_role,
              message: getCleanMessageText(d.content),
              attachmentUrl: d.attachment_url,
              attachmentType: d.attachment_type,
              audioUrl: d.audio_url,
              messageType: d.message_type,
              createdAt: new Date(d.created_at).getTime(),
              event:
                d.event ||
                (d.attachment_type?.startsWith("event_")
                  ? d.attachment_type.replace("event_", "")
                  : d.event),
            } as any;
    
            setMessages(prev => {
              const isOptimisticAlready = prev.some(
                (opt) =>
                  opt.status === "pending" &&
                  opt.senderRole === newMsg.senderRole &&
                  opt.message === newMsg.message &&
                  Math.abs(opt.createdAt - newMsg.createdAt) < 5000,
              );
              if (isOptimisticAlready) {
                return mergeSupportChatMessages(prev);
              }
              return mergeSupportChatMessages(prev, [newMsg]);
            });
    
            requestAnimationFrame(() => {
              messagesEndRef.current?.scrollIntoView({ 
                behavior: "smooth" 
              });
            });
          },
        );
      });

      channel.subscribe((status) => {
          console.log("[realtime] STATUS:", status);
          setRealtimeStatus(status as any);
          
          if (status === "SUBSCRIBED") {
            setRealtimeConnected(true);
            // Clear polling fallback
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          }
          
          if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
            setRealtimeConnected(false);
            // Start polling as fallback
            if (!pollingRef.current) {
              pollingRef.current = setInterval(() => {
                console.log("[realtime] polling fallback - fetching messages");
                fetchMessages();
              }, 5000);
            }
          }
        });
    
      return channel;
    };
    
    let channel: any = setupRealtime(chat.id!, userId);
  
    return () => {
      console.log("[realtime] cleanup");
      if (channel) supabase.removeChannel(channel);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, [chat?.id, userId]);

  useEffect(() => {
    // Detect payment success redirect
    const isPaymentSuccess =
      searchParams.get("payment_success") === "true" ||
      searchParams.get("payment") === "success";

    const checkWelcome = async () => {
      if (!chat?.id || loading || hasWelcomed) return;

      try {
        let targetOrderId = orderId;

        // Find most recent order if not in URL
        if (!targetOrderId && userId) {
          const { data: latestOrder } = await supabase
            .from("orders")
            .select("id")
            .eq("user_id", userId)
            .in("status", ["paid", "confirmed", "completed", "success"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestOrder) targetOrderId = latestOrder.id;
        }

        if (targetOrderId) {
          const { data: orderData } = await supabase
            .from("orders")
            .select("welcome_sent, status")
            .eq("id", targetOrderId)
            .maybeSingle();

          if (orderData?.welcome_sent) return;
        }

        setHasWelcomed(true);

        const initialMessageText = isPaymentSuccess
          ? "Hello, here are your logins..."
          : "Hello! Welcome to Plugsy Support. Once your Paystack payment is successful, our team is notified and we prepare your premium logins shortly. How can we help you today?";

        await chatService.sendMessage(
          chat.id!,
          {
            senderRole: "assistant",
            message: initialMessageText,
            senderId: "ai-bot",
            senderName: "Support Bot",
            orderId: targetOrderId || undefined,
            userId,
          },
          getToken,
        );

        if (targetOrderId) {
          await supabase
            .from("orders")
            .update({ welcome_sent: true })
            .eq("id", targetOrderId);
        }
      } catch {
        console.warn("Support welcome flow failed", { chatId: chat?.id });
      }
    };

    if (
      userId &&
      chat?.id &&
      !loading &&
      !hasWelcomed &&
      (messages.length === 0 || isPaymentSuccess)
    ) {
      const timer = setTimeout(checkWelcome, 1000);
      return () => clearTimeout(timer);
    }
  }, [
    chat?.id,
    loading,
    hasWelcomed,
    searchParams,
    userId,
    getToken,
    messages.length,
  ]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, uploading]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !chat?.id) return;

    const msg = inputText.trim();

    // 1. Optimistic Update
    const optimisticMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      chatId: chat.id,
      orderId: orderId || "",
      senderRole: "user",
      message: msg,
      senderId: userId || "",
      senderName: user?.fullName || "Customer",
      createdAt: Date.now(),
      status: "pending",
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setInputText("");

    // Clear typing state immediately after sending
    if (debouncedStopTypingRef.current) {
      clearTimeout(debouncedStopTypingRef.current);
    }
    updateTypingStatus(false);
    isTypingRef.current = false;

    await persistOptimisticMessage(optimisticMsg);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 w-screen h-[100dvh] overflow-hidden bg-slate-50 dark:bg-[#0A0A0C] flex flex-col justify-center items-center p-0 sm:p-4 md:p-6 z-[100]">
        <div className="max-w-4xl mx-auto w-full h-full sm:h-[calc(100dvh-140px)] flex flex-col px-0 sm:px-4 sm:mt-6 transition-all duration-300">
          <div className="w-full h-full flex flex-col border-[0.5px] border-black/10 dark:border-white/10 rounded-none sm:rounded-2xl overflow-hidden relative backdrop-blur-2xl bg-white/60 dark:bg-[#101014] shadow-2xl">
            {/* Header skeleton */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/5 bg-slate-100/50 dark:bg-black/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse shrink-0" />
                <div className="space-y-1.5">
                  <div className="w-32 h-4 bg-slate-200 dark:bg-white/10 animate-pulse rounded" />
                  <div className="w-20 h-2.5 bg-slate-150 dark:bg-white/5 animate-pulse rounded" />
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-white/10 animate-pulse" />
            </div>

            {/* Messages skeleton */}
            <div className="flex-grow p-6 space-y-6 overflow-hidden flex flex-col justify-end">
              <div className="flex items-end gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse shrink-0" />
                <div className="space-y-1.5 max-w-[70%]">
                  <div className="w-20 h-3 bg-slate-200 dark:bg-white/10 animate-pulse rounded" />
                  <div className="w-48 h-12 bg-slate-200 dark:bg-white/10 animate-pulse rounded-2xl rounded-bl-none" />
                </div>
              </div>
              <div className="flex items-end gap-3 justify-end self-end">
                <div className="space-y-1.5 max-w-[70%] flex flex-col items-end">
                  <div className="w-24 h-3 bg-slate-200 dark:bg-white/10 animate-pulse rounded" />
                  <div className="w-32 h-10 bg-blue-500/20 dark:bg-blue-500/10 animate-pulse rounded-2xl rounded-br-none" />
                </div>
              </div>
              <div className="flex items-end gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse shrink-0" />
                <div className="space-y-1.5 max-w-[70%]">
                  <div className="w-16 h-3 bg-slate-200 dark:bg-white/10 animate-pulse rounded" />
                  <div className="w-64 h-16 bg-slate-200 dark:bg-white/10 animate-pulse rounded-2xl rounded-bl-none" />
                </div>
              </div>
              <div className="flex items-end gap-3 justify-end self-end">
                <div className="space-y-1.5 max-w-[70%] flex flex-col items-end">
                  <div className="w-20 h-3 bg-slate-200 dark:bg-white/10 animate-pulse rounded" />
                  <div className="w-56 h-12 bg-blue-500/20 dark:bg-blue-500/10 animate-pulse rounded-2xl rounded-br-none" />
                </div>
              </div>
            </div>

            {/* Input skeleton */}
            <div className="p-4 bg-white/70 dark:bg-transparent border-t border-black/10 dark:border-white/5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-white/10 animate-pulse" />
              <div className="flex-grow h-12 bg-slate-200 dark:bg-white/10 animate-pulse rounded-xl" />
              <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-white/10 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-brand-bg sm:p-4">
      {/* Focused support workspace */}
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col sm:h-[calc(100dvh-2rem)]">
        <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden border-brand-border bg-brand-bg sm:rounded-[28px] sm:border sm:shadow-[var(--brand-shadow)]">
          {/* Compact, stationary identity bar */}
          <header className="relative z-30 flex min-h-[68px] items-center border-b border-brand-border bg-brand-card/90 px-3 py-2.5 backdrop-blur-xl sm:px-4">
            <div className="flex w-full items-center justify-between gap-2">
              <Link
                to="/dashboard"
                aria-label="Back to Dashboard"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-brand-border bg-brand-surface text-brand-text-secondary shadow-sm hover:border-brand-accent/30 hover:text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
              >
                <ArrowLeft size={18} />
              </Link>
              <button onClick={() => setSupportProfileOpen((open) => !open)} aria-expanded={supportProfileOpen} className="relative flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1 text-left hover:bg-brand-text/[.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-brand-border bg-black shadow-sm"><Logo className="h-7 w-7" /></span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 truncate text-[15px] font-bold tracking-tight text-brand-text">Plugsy Support <VerifiedBadge size={16} /></span>
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-brand-text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>Online · Official support</span>
                </span>
              </button>
              {supportProfileOpen && <div className="absolute right-3 top-[4.6rem] z-30 w-[min(21rem,calc(100vw-1.5rem))] rounded-2xl border border-brand-border bg-brand-card p-4 shadow-[var(--brand-shadow-hover)]"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-black shadow-sm"><Logo className="h-7 w-7"/></span><div><p className="flex items-center gap-1.5 text-sm font-bold text-brand-text">Plugsy Support <VerifiedBadge size={15} /></p><p className="mt-0.5 text-xs text-brand-text-secondary">Verified official Plugsy account</p></div></div><div className="mt-4 rounded-xl bg-brand-accent/[.07] p-3"><p className="text-xs leading-5 text-brand-text-secondary">Your orders and messages stay in this secure conversation. Plugsy will never ask for your wallet PIN.</p></div></div>}
            </div>
          </header>

          {/* Fluid Scroll Area for the message stream */}
          <div
            ref={containerRef}
            className="flex-1 space-y-4 overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(0,102,255,0.04),transparent_38%)] px-4 py-5 scrollbar-hide sm:px-6"
          >
            {/* Clear conversation context without interrupting the message stream */}
            <div className="mx-auto mb-6 flex w-full max-w-xl items-start gap-3 rounded-2xl border border-brand-accent/15 bg-brand-accent/[.055] p-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-accent text-white shadow-[0_8px_20px_rgba(0,102,255,.22)]">
                <ShieldCheck size={19} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-bold text-brand-text">Official Plugsy support <VerifiedBadge size={14} /></div>
                <p className="mt-1 text-xs leading-5 text-brand-text-secondary">Get help with purchases, deliveries and your account. Our team typically replies in under five minutes.</p>
              </div>
            </div>

            {/* Render Chat Messages */}
            <AnimatePresence initial={false}>
              {messages
                .filter((msg, index, self) => msg && index === self.findIndex((m) => m && m.id === msg.id))
                .map((msg, index) => {
                  if (!msg) return null;
                  const isUser = msg.senderRole === "user";
                  const isBot = msg.senderRole === "bot" || msg.senderRole === "assistant";
                  const isSystem = msg.senderRole === "system";

                  if (isSystem) {
                    return (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        key={msg.id}
                        className="flex justify-center mt-4"
                      >
                        <div className="rounded-full border border-brand-border bg-brand-card px-4 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-brand-text-secondary shadow-sm">
                          {msg.message || "System Notification"}
                        </div>
                      </motion.div>
                    );
                  }

                const prevMsg = index > 0 ? messages[index - 1] : null;
                const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

                const getSenderGroup = (m: any) => {
                  if (!m) return null;
                  if (m.senderRole === "system") return "system";
                  if (m.senderRole === "user") return "user";
                  return "agent";
                };

                const senderGroup = getSenderGroup(msg);
                const prevSenderGroup = getSenderGroup(prevMsg);
                const nextSenderGroup = getSenderGroup(nextMsg);

                const isPrevSameSender = prevSenderGroup === senderGroup;
                const isNextSameSender = nextSenderGroup === senderGroup;

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    key={msg.id}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"} ${isPrevSameSender ? "mt-1 !mt-1" : "mt-5 !mt-5"}`}
                  >
                    <div
                      className={`flex items-end gap-3 max-w-[85%] sm:max-w-[70%] ${isUser ? "flex-row-reverse" : ""}`}
                    >
                      {!isNextSameSender ? (
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-sm ${isBot ? "border-brand-accent/20 bg-brand-accent/10 text-brand-accent" : isUser ? "border-brand-accent/20 bg-brand-accent/10 text-brand-accent" : "border-brand-border bg-black text-white"}`}
                        >
                          {isBot ? (
                            <ShieldCheck size={18} />
                          ) : isUser ? (
                            <User size={18} />
                          ) : (
                            <Logo />
                          )}
                        </div>
                      ) : (
                        <div className="w-9 h-9 shrink-0" />
                      )}

                      <div
                        className={`flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}
                      >
                        {!isPrevSameSender && (
                          <div className="flex items-center gap-2 px-1">
                            <span className="text-[9px] font-bold uppercase leading-none tracking-wider text-brand-text-secondary">
                              {isUser
                                ? "You"
                                : isBot
                                  ? "Plugsy Support Bot"
                                  : msg.senderName || "Support Team"}
                            </span>
                            <span className="flex items-center gap-1.5 text-[8px] font-medium uppercase leading-none tracking-wider text-brand-text-secondary/70">
                              {msg.createdAt
                                ? new Date(msg.createdAt).toLocaleTimeString(
                                    [],
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )
                                : ""}
                              {isUser &&
                                msg.status !== "pending" &&
                                msg.status !== "failed" && (
                                <span className="text-[10px] text-blue-400 font-bold">
                                  ✓
                                </span>
                              )}
                              {isUser && msg.status === "pending" && (
                                <Clock size={10} className="animate-pulse text-white/40" />
                              )}
                              {isUser && msg.status === "failed" && (
                                <span className="text-[9px] font-bold text-red-400">
                                  Failed
                                </span>
                              )}
                            </span>
                          </div>
                        )}

                        {/* Media Receipt/Attachment/Audio Block */}
                        {msg.messageType === 'audio' || msg.audioUrl ? (
                          <div className="group relative mt-1.5">
                            <VoiceNotePlayer url={msg.audioUrl || msg.attachmentUrl || ''} />
                          </div>
                        ) : msg.attachmentUrl ? (
                          <div className="group relative">
                            <div
                              className={`rounded-xl overflow-hidden p-1 sm:p-2 border ${isUser ? "border-blue-500/30 bg-blue-600/10" : "border-white/10 bg-white/5"}`}
                            >
                              {msg.attachmentType?.startsWith("image/") ? (
                                <div className="relative overflow-hidden rounded-xl">
                                  <img
                                    src={optimizeCloudinaryUrl(
                                      msg.attachmentUrl,
                                    )}
                                    loading="lazy"
                                    alt="Receipt"
                                    className="max-w-[180px] sm:max-w-[320px] cursor-pointer hover:scale-105 transition-transform duration-500"
                                  />
                                  <a
                                    href={msg.attachmentUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                  >
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">
                                      Expand Asset
                                    </span>
                                  </a>
                                </div>
                              ) : (
                                <a
                                  href={msg.attachmentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-4 p-4 bg-black/20 rounded-xl hover:bg-white/5 transition-colors"
                                >
                                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white shadow-inner">
                                    <FileImage size={20} />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase text-white tracking-tight">
                                      {msg.message || "File Attachment"}
                                    </span>
                                    <span className="text-[8px] text-white/40 font-medium tracking-widest mt-0.5 uppercase">
                                      Click to View
                                    </span>
                                  </div>
                                </a>
                              )}
                            </div>
                            {(msg.message || !msg.attachmentUrl) && (
                              <div
                                className={`p-4 px-5 text-[15px] font-medium tracking-tight leading-relaxed transition-all duration-300 ease-in-out border border-white/5 mt-1.5 ${isUser ? "rounded-2xl rounded-br-sm bg-blue-600/20 text-white" : "rounded-2xl rounded-bl-sm bg-white/5 text-white/90"} ${msg.status === "pending" ? "opacity-70 scale-95" : ""}`}
                              >
                                <div className="whitespace-pre-wrap">
                                  {msg.message ? renderMessageTextWithLinks(msg.message, isUser) : "..."}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : msg.event === "login_details" ? (
                          <div
                            className={`p-5 px-6 text-sm sm:text-base font-medium tracking-tight leading-relaxed border ${isUser ? "rounded-2xl rounded-br-sm bg-blue-600/10 text-slate-900 dark:text-white border-blue-500/20" : "rounded-2xl rounded-bl-sm bg-white/60 dark:bg-white/5 text-slate-900 dark:text-white/90 border-black/10 dark:border-white/10"}`}
                          >
                            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-black/10 dark:border-white/5">
                              <div className="w-8 h-8 rounded-full bg-blue-500/10 dark:bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                <Key size={16} />
                              </div>
                              <span className="font-bold text-blue-600 dark:text-blue-400 text-xs sm:text-sm uppercase tracking-wider">
                                Your CapCut Login Details
                              </span>
                            </div>
                            <div className="whitespace-pre-wrap font-mono text-xs sm:text-sm bg-black/5 dark:bg-black/40 p-4 rounded-xl border border-black/10 dark:border-white/5 mb-3 select-all text-slate-900 dark:text-white/90">
                              {msg.message || "..."}
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  msg.message || "",
                                );
                                toast.success("Copied to clipboard");
                              }}
                              className="flex items-center justify-center w-full gap-2 py-2.5 bg-black/5 hover:bg-black/10 border border-black/10 text-slate-900 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white dark:border-white/10 text-[11px] font-black uppercase tracking-widest rounded-xl transition-colors cursor-pointer"
                            >
                              <Copy size={14} /> Copy Details
                            </button>
                          </div>
                        ) : msg.event === "payment_confirmed" ? (
                          <div
                            className={`p-5 px-6 text-sm font-medium tracking-tight leading-relaxed shadow-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 backdrop-blur-md ${isUser ? "rounded-2xl rounded-br-sm text-white" : "rounded-2xl rounded-bl-sm text-white/90"}`}
                          >
                            <div className="whitespace-pre-wrap">
                              {msg.message || "..."}
                            </div>
                          </div>
                        ) : msg.event === "reward" ? (
                          <div
                            className={`p-5 px-6 text-sm font-medium tracking-tight leading-relaxed shadow-sm bg-amber-500/10 text-amber-400 border border-amber-500/20 backdrop-blur-md ${isUser ? "rounded-2xl rounded-br-sm text-white" : "rounded-2xl rounded-bl-sm text-white/90"}`}
                          >
                            <div className="flex items-center gap-2 font-bold mb-2 text-amber-300">
                              🏆 Referral Reward
                            </div>
                            <div className="whitespace-pre-wrap">
                              {msg.message || "..."}
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`border px-4 py-3.5 text-[15px] font-medium leading-relaxed tracking-tight shadow-sm ${isUser ? "rounded-2xl rounded-br-[6px] border-brand-accent bg-brand-accent text-white" : "rounded-2xl rounded-bl-[6px] border-brand-border bg-brand-card text-brand-text"} ${msg.status === "pending" ? "opacity-70 scale-[.98]" : ""}`}
                          >
                            <div className="whitespace-pre-wrap text-left">
                              {msg.message || "..."}
                            </div>
                            {msg.status === "pending" && (
                              <Clock
                                size={12}
                                className={`inline-block ml-2 animate-pulse ${isUser ? "text-white/50" : "text-slate-400 dark:text-white/30"}`}
                              />
                            )}
                          </div>
                        )}
                        {isUser && msg.status === "failed" && (
                          <button
                            type="button"
                            onClick={() => persistOptimisticMessage(msg)}
                            className="rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400 transition-colors hover:bg-red-500/20"
                          >
                            Retry
                          </button>
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

          {/* Sleek Stationary Input Bar */}
          <div className="z-20 flex-shrink-0 border-t border-brand-border bg-brand-card/90 p-3 backdrop-blur-xl sm:p-4" style={{ paddingBottom: 'max(calc(env(safe-area-inset-bottom) + .75rem), .75rem)' }}>
            {/* Real-time typing indicator */}
            <AnimatePresence>
              {typingUsers.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex items-center gap-1.5 pb-2 pl-1"
                >
                  <div className="flex gap-0.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-accent" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-accent" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-accent" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="whitespace-nowrap text-[10px] font-semibold text-brand-text-secondary">
                    {typingUsers.size === 1 
                      ? [...typingUsers.values()][0] + " is typing..."
                      : [...typingUsers.values()].slice(0, 2).join(", ") + 
                        (typingUsers.size > 2 ? " and others are typing..." : " are typing...")}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSendMessage} className="w-full">
              <div className="relative flex min-h-14 items-center justify-between gap-2 rounded-2xl border border-brand-border bg-brand-surface px-2.5 py-2 shadow-sm focus-within:border-brand-accent/45 focus-within:ring-2 focus-within:ring-brand-accent/10 sm:gap-3 sm:px-3">
                <label aria-label="Attach image" className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl text-brand-text-secondary hover:bg-brand-text/5 hover:text-brand-text">
                  <Paperclip size={18} />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !chat?.id) return;

                      setUploading(true);
                      setUploadProgress(10);
                      const previewUrl = URL.createObjectURL(file);
                      setUploadPreview(previewUrl);

                      try {
                        setUploadProgress(40);
                        const cloudinaryUrl = await compressAndUpload(file);

                        setUploadProgress(80);

                        if (cloudinaryUrl) {
                          const fileExt = file.name.split(".").pop();
                          // Optimistic message
                          const optimisticFileMsg: ChatMessage = {
                            id: `temp-${Date.now()}`,
                            chatId: chat.id,
                            orderId: orderId || "",
                            senderRole: "user",
                            message: inputText.trim() || "",
                            senderId: userId || "",
                            senderName: user?.fullName || "Customer",
                            createdAt: Date.now(),
                            attachmentUrl: cloudinaryUrl,
                            attachmentType:
                              file.type || `image/${fileExt || "jpeg"}`,
                            status: "pending",
                          };
                          setMessages((prev) => [...prev, optimisticFileMsg]);
                          setInputText("");

                          await persistOptimisticMessage(optimisticFileMsg);
                        }
                      } catch {
                        console.error("Support attachment upload failed", {
                          chatId: chat.id,
                        });
                        toast.error("Upload failed");
                      } finally {
                        setUploading(false);
                        setUploadProgress(0);
                        URL.revokeObjectURL(previewUrl);
                        setUploadPreview(null);
                      }
                    }}
                  />
                </label>

                {isRecording ? (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex-1 flex items-center justify-between text-sm sm:text-base text-slate-900 dark:text-white w-full min-w-0"
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
                           handleAudioUpload(blob);
                         }}
                         className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-brand-accent text-white shadow-[0_6px_16px_rgba(0,102,255,.22)] hover:bg-blue-600 active:scale-95"
                       >
                         <Send size={16} />
                       </button>
                    </div>
                  </motion.div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => handleInputChange(e.target.value)}
                      aria-label="Message Plugsy Support"
                      placeholder="Message Plugsy Support…"
                      className="min-w-0 w-full flex-1 border-none bg-transparent text-sm text-brand-text placeholder:text-brand-text-secondary/65 focus:outline-none focus:ring-0 sm:text-[15px]"
                    />

                    {inputText.trim() ? (
                      <button
                        type="submit"
                        aria-label="Send message"
                        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-brand-accent bg-brand-accent text-white shadow-[0_6px_16px_rgba(0,102,255,.22)] hover:bg-blue-600 active:scale-95"
                      >
                        <Send size={16} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startRecording}
                        aria-label="Record a voice message"
                        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-brand-border bg-brand-card text-brand-text-secondary hover:border-brand-accent/30 hover:bg-brand-accent/10 hover:text-brand-accent"
                      >
                        <Mic size={16} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
