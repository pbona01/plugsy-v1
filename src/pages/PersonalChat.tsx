import { useCall } from "../contexts/CallContext";
import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { supabase } from "../lib/supabase";
import { compressAndUpload } from "../utils/uploadMedia";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { VoiceNotePlayer } from "../components/chat/VoiceNotePlayer";
import VideoCallWidget from "../components/video/VideoCallWidget";
import { motion, AnimatePresence } from "motion/react";
import { SearchChat, Highlight } from "../components/SearchChat";
import { 
  Phone, PhoneOff, Send, Smile, Image as ImageIcon, Camera, MoreVertical, 
  ChevronLeft, X, Plus, Users, Copy, Trash2, LogOut, Globe, Lock, Settings, 
  ShieldCheck, Bookmark, Maximize2, Clock, Loader2, User, HelpCircle, MessageSquare,
  Video, VideoOff, Mic, MicOff, Volume2, VolumeX, CornerUpLeft,
  CircleDot, Megaphone, Search, Share2, ArrowDown
} from "lucide-react";
import toast from "react-hot-toast";
import { HeroGeometric } from "../components/effects/shape-landing-hero";
import { sendBroadcastSafely } from "../services/chatService";
import { useOnlinePresence } from "../contexts/OnlinePresenceContext";
import plugsyLogo from "../assets/images/plugsy_icon.svg";
import { useProfile } from "../hooks/useProfile";
import { notifyPersistedMessage } from "../utils/messageNotification";
import {
  CHAT_MESSAGE_PAGE_SIZE,
  getMessageCursor,
  mergeIncomingMessage,
  mergeMessagesById,
  deriveActiveTypingUsers,
  getNextTypingExpiry,
  ownsChatRequest,
  ChatRequestOwner,
  prependOlderMessages,
} from "../utils/chatScalability";

const CHAT_MESSAGE_COLUMNS = "id,chat_id,sender_id,sender_role,content,attachment_url,attachment_type,sender_name,message_type,sticker_url,created_at,duration_seconds";

// Fixed set of default emojis for stickers
const DEFAULT_STICKERS = ["🔥", "😂", "❤️", "👍", "🙌", "🎉", "✨", "💯", "🚀", "💡", "🎨", "🤩", "👑", "🍕", "👾"];

interface Profile {
  clerk_id: string;
  username: string | null;
  full_name: string | null;
  profile_pic_url: string | null;
  image_url: string | null;
  bio: string | null;
}

interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_role: string;
  content: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  sender_name: string | null;
  message_type: "text" | "image" | "sticker" | "call_event" | "audio" | "voice_note";
  sticker_url: string | null;
  created_at: string;
  duration_seconds?: number;
}

interface Chat {
  id: string;
  chat_type: "dm" | "group" | "channel";
  name: string | null;
  description: string | null;
  cover_image_url: string | null;
  is_public: boolean;
  member_count: number;
  invite_code: string | null;
  created_by: string | null;
  active_call_room: string | null;
  active_call_status: string | null;
  typing_users?: Record<string, { name?: string | null; timestamp?: number | string | null }> | null;
}

const CallEventBubble = ({ message }: { message: any }) => (
  <div className="self-center bg-slate-200 dark:bg-white/5 rounded-full px-3.5 py-1.5 my-2 text-xs text-slate-500 dark:text-white/40 flex items-center gap-1.5 font-medium">
    📞 {message.content}
  </div>
);

export default function PersonalChat() {
  const { chatId } = useParams<{ chatId: string }>();
  const { userId, getToken } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const { isUserOnline } = useOnlinePresence();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [chat, setChat] = useState<Chat | null>(null);
  const [otherMember, setOtherMember] = useState<Profile | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // States and computed variables for notifications and messaging
  const [otherMemberId, setOtherMemberId] = useState<string | null>(null);
  const [otherMemberName, setOtherMemberName] = useState<string>("User");
  const otherMemberIdRef = useRef<string | null>(null);
  const isEndingCallRef = useRef<boolean>(false);

  useEffect(() => {
    otherMemberIdRef.current = otherMemberId;
  }, [otherMemberId]);

  const { profile: myProfile } = useProfile(userId || undefined);
  const chatType = chat?.chat_type;
  const currentUserId = userId;
  const currentUserName = myProfile?.username || user?.username || "Someone";
  const currentFullName = myProfile?.full_name || myProfile?.username || user?.fullName || user?.username || "User";
  const currentUserEmail = user?.primaryEmailAddress?.emailAddress || "";

  // UI overlays
  const [infoOpen, setInfoOpen] = useState(false);
  const [userProfileModal, setUserProfileModal] = useState<Profile | null>(null);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [stickerTab, setStickerTab] = useState<"stickers" | "saved">("stickers");
  const [savedStickers, setSavedStickers] = useState<string[]>([]);
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null);
  const [confirmStickerUrl, setConfirmStickerUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showNewMessagePill, setShowNewMessagePill] = useState(false);
  const [contextMenuMsg, setContextMenuMsg] = useState<Message | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isScrolledUp = target.scrollHeight - target.scrollTop - target.clientHeight > 350;
    setShowScrollBtn(isScrolledUp);

    const isNearBot = target.scrollHeight - target.scrollTop - target.clientHeight < 150;
    if (isNearBot) {
      setShowNewMessagePill(false);
    }
  };

  // 3-Column layout states
  const [conversations, setConversations] = useState<any[]>([]);
  const conversationsRef = useRef<any[]>([]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const openConversation = (targetChatId: string) => {
    setConversations(prev =>
      prev.map(c => c.id === targetChatId ? { ...c, unread_count: 0 } : c)
    );
    navigate("/chats/" + targetChatId);
  };

  const conversationRefreshRef = useRef(false);

  const loadConversations = async () => {
    if (!currentUserId) return;
    console.log("[conversations] fetching for user:", currentUserId);

    // Get all DM chat_ids the user belongs to
    const { data: memberships } = await supabase
      .from("chat_members")
      .select("chat_id")
      .eq("user_id", currentUserId);

    const chatIds = [...new Set((memberships || []).map(m => m.chat_id).filter(Boolean))];
    if (chatIds.length === 0) {
      setConversations([]);
      return;
    }

    // Fetch the chats themselves (DM type only), ordered
    // by most recent activity
    const { data: chats, error } = await supabase
      .from("chats")
      .select("id,chat_type,name,description,cover_image_url,is_public,member_count,invite_code,created_by,active_call_room,active_call_status,last_message,last_message_at,created_at,unread_count,typing_users")
      .in("id", chatIds)
      .eq("chat_type", "dm")
      .order("last_message_at", { ascending: false });

    console.log("[conversations] fetched:", chats?.length, error?.message);

    if (!chats) return;

    const { data: members } = await supabase
      .from("chat_members")
      .select("chat_id, user_id, user_name")
      .in("chat_id", chatIds)
      .neq("user_id", currentUserId);
    const typedMembers = (members || []) as Array<{ chat_id: string; user_id: string; user_name: string | null }>;
    const membersByChat = new Map(typedMembers.map((member) => [member.chat_id, member]));
    const otherUserIds = [...new Set(typedMembers.map((member) => member.user_id).filter(Boolean))];
    const { data: profiles } = otherUserIds.length
      ? await supabase.from("profile_directory_v1").select("clerk_id, full_name, profile_pic_url, username").in("clerk_id", otherUserIds)
      : { data: [] };
    const typedProfiles = (profiles || []) as Array<{ clerk_id: string; full_name: string | null; profile_pic_url: string | null }>;
    const profilesById = new Map(typedProfiles.map((profile) => [profile.clerk_id, profile]));
    const enriched = chats.map((chat) => {
      const otherMember = membersByChat.get(chat.id);
      const otherProfile = otherMember?.user_id ? profilesById.get(otherMember.user_id) : null;
      return {
        ...chat,
        otherUserId: otherMember?.user_id,
        otherUserName: otherProfile?.full_name || otherMember?.user_name || "User",
        otherUserAvatar: otherProfile?.profile_pic_url || null,
      };
    });

    setConversations(enriched);
  };

  const fetchConversations = async () => {
    if (conversationRefreshRef.current) return;
    conversationRefreshRef.current = true;
    try {
      await loadConversations();
    } finally {
      conversationRefreshRef.current = false;
    }
  };

  const updateConversationPreview = (message: any) => {
    const messageChatId = String(message?.chat_id || "");
    if (!messageChatId) return;
    const preview = message.message_type === "image"
      ? "📷 Sent an image"
      : message.message_type === "audio" || message.message_type === "voice_note"
        ? "🎤 Voice note"
        : message.message_type === "sticker"
          ? "🎨 Sent a sticker"
          : String(message.content || "New message");
    setConversations((previous) => {
      let found = false;
      const next = previous.map((conversation) => {
        if (conversation.id !== messageChatId) return conversation;
        found = true;
        return {
          ...conversation,
          last_message: preview,
          last_message_at: message.created_at || new Date().toISOString(),
          unread_count: message.sender_id !== currentUserId && messageChatId !== chatId
            ? Number(conversation.unread_count || 0) + 1
            : conversation.unread_count,
        };
      });
      if (!found) {
        void fetchConversations();
        return previous;
      }
      return next.sort((a, b) => new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime());
    });
  };

  const updateConversationTyping = (payload: { chat_id?: string; user_id?: string; name?: string; is_typing?: boolean }) => {
    const targetChatId = String(payload?.chat_id || "");
    if (!targetChatId || !payload.user_id || payload.user_id === currentUserId) return;
    setConversations((previous) => previous.map((conversation) => {
      if (conversation.id !== targetChatId) return conversation;
      const typingUsers = { ...(conversation.typing_users || {}) };
      if (payload.is_typing) typingUsers[payload.user_id] = { name: payload.name || "Someone", timestamp: Date.now() };
      else delete typingUsers[payload.user_id];
      return { ...conversation, typing_users: typingUsers };
    }));
    if (payload.is_typing) {
      window.setTimeout(() => {
        setConversations((previous) => previous.map((conversation) => {
          if (conversation.id !== targetChatId) return conversation;
          const typingUsers = { ...(conversation.typing_users || {}) };
          delete typingUsers[payload.user_id!];
          return { ...conversation, typing_users: typingUsers };
        }));
      }, 4_500);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`user-events-${currentUserId}-sidebar`)
      .on("broadcast", { event: "new_message" }, ({ payload }: any) => updateConversationPreview(payload))
      .on("broadcast", { event: "typing" }, ({ payload }: any) => updateConversationTyping(payload))
      .subscribe();
    return () => { supabase.removeChannel(channel).catch(() => {}); };
  }, [currentUserId, chatId]);

  useEffect(() => {
    if (!currentUserId) return;

    const poll = setInterval(async () => {
      if (document.visibilityState === "hidden" || conversationRefreshRef.current) return;
      conversationRefreshRef.current = true;
      try {
      const chatIds = [...new Set(conversationsRef.current.map(c => c.id).filter(Boolean))];
      if (chatIds.length === 0) {
        // Also check for brand new DMs that started
        // since last fetch
        await loadConversations();
        return;
      }

      const { data: latestChats } = await supabase
        .from("chats")
        .select("id, last_message, last_message_at, unread_count, typing_users")
        .in("id", chatIds);

      if (!latestChats) return;

      setConversations(prev => {
        const updated = prev.map(conv => {
          const latest = latestChats.find(c => c.id === conv.id);
          if (!latest) return conv;
          return {
            ...conv,
            last_message: latest.last_message,
            last_message_at: latest.last_message_at,
            unread_count: latest.unread_count,
            typing_users: latest.typing_users
          };
        });

        // Re-sort by last_message_at descending —
        // this is what moves the most recently active
        // conversation to the TOP automatically
        return updated.sort((a, b) => {
          const aTime = new Date(a.last_message_at || a.created_at).getTime();
          const bTime = new Date(b.last_message_at || b.created_at).getTime();
          return bTime - aTime;
        });
      });

      // Also check for brand new conversations that
      // started since the last full fetch
      const { data: memberships } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", currentUserId);

      const currentChatIds = [...new Set((memberships || []).map(m => m.chat_id).filter(Boolean))];
      const knownChatIds = new Set(chatIds);
      const hasNewChat = currentChatIds.some(id => !knownChatIds.has(id));

      if (hasNewChat) {
        console.log("[conversations] new conversation detected, full refetch");
        await loadConversations();
      }
      } finally {
        conversationRefreshRef.current = false;
      }
    }, 30000);

    return () => clearInterval(poll);
  }, [currentUserId]);

  const isOtherUserTyping = (conv: any) => {
    if (!conv.typing_users || !conv.otherUserId) return false;
    const typingInfo = conv.typing_users[conv.otherUserId];
    if (!typingInfo) return false;
    // Consider stale after 4 seconds without an update
    return (Date.now() - typingInfo.timestamp) < 4000;
  };

  const getRelativeTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "now";
    if (mins < 60) return mins + "m";
    if (hours < 24) return hours + "h";
    if (days < 7) return days + "d";
    return new Date(timestamp).toLocaleDateString();
  };

  const [sidebarGroups, setSidebarGroups] = useState<any[]>([]);
  const [sidebarChannels, setSidebarChannels] = useState<any[]>([]);
  const [sidebarActiveTab, setSidebarActiveTab] = useState<"dm" | "communities" | "status" | "channels">("dm");
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (chat?.chat_type) {
      if (chat.chat_type === "dm") setSidebarActiveTab("dm");
      else if (chat.chat_type === "group") setSidebarActiveTab("communities");
      else if (chat.chat_type === "channel") setSidebarActiveTab("channels");
    }
  }, [chat?.chat_type]);

  const fetchSidebarChats = async () => {
    if (!userId) return;
    try {
      const { data: memberships, error: memErr } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", userId);
      if (memErr) throw memErr;
      const chatIds = memberships?.map((m) => m.chat_id) || [];
      if (chatIds.length === 0) return;

      // 1. Fetch Groups (Communities)
      const { data: groupsData } = await supabase
        .from("chats")
        .select("id,chat_type,name,description,cover_image_url,is_public,member_count,invite_code,created_by,active_call_room,active_call_status,last_message,last_message_at,created_at,unread_count,typing_users")
        .eq("chat_type", "group")
        .in("id", chatIds)
        .order("last_message_at", { ascending: false });
      if (groupsData) setSidebarGroups(groupsData);

      // 2. Fetch Channels
      const { data: channelsData } = await supabase
        .from("chats")
        .select("id,chat_type,name,description,cover_image_url,is_public,member_count,invite_code,created_by,active_call_room,active_call_status,last_message,last_message_at,created_at,unread_count,typing_users")
        .eq("chat_type", "channel")
        .in("id", chatIds)
        .order("last_message_at", { ascending: false });
      if (channelsData) setSidebarChannels(channelsData);

    } catch (e) {
      console.error("Error fetching sidebar chats:", e);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchSidebarChats();
    }
  }, [userId, chatId]);

  // Reply and Reactions systems
  const [replyingTo, setReplyingTo] = useState<{ id: string, sender_name: string, content: string, message_type: string } | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [swipeMessageId, setSwipeMessageId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [activeReactionModalMessage, setActiveReactionModalMessage] = useState<Message | null>(null);
  const longPressTimerRef = useRef<any>(null);
  const presenceChannelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<any>(null);
  const debouncedStopTypingRef = useRef<any>(null);
  const isTypingRef = useRef(false);
  const typingExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyTypingUsers = (typingUsers: Chat["typing_users"]) => {
    const now = Date.now();
    setTypingUsers(deriveActiveTypingUsers(typingUsers, userId, now));
    if (typingExpiryTimerRef.current) clearTimeout(typingExpiryTimerRef.current);
    const nextExpiry = getNextTypingExpiry(typingUsers, userId, now);
    if (nextExpiry !== null) {
      typingExpiryTimerRef.current = setTimeout(() => applyTypingUsers(typingUsers), Math.max(0, nextExpiry - Date.now()));
    }
  };

  const applyTypingBroadcast = (payload: { user_id?: string; name?: string; is_typing?: boolean }) => {
    const typingUserId = String(payload?.user_id || "");
    if (!typingUserId || typingUserId === userId) return;
    setTypingUsers((previous) => {
      const next = new Map(previous);
      if (payload.is_typing) next.set(typingUserId, payload.name || "Someone");
      else next.delete(typingUserId);
      return next;
    });
    if (payload.is_typing) {
      window.setTimeout(() => {
        setTypingUsers((previous) => {
          const next = new Map(previous);
          next.delete(typingUserId);
          return next;
        });
      }, 4_500);
    }
  };

  const updateTypingStatus = async (isTyping: boolean) => {
    try {
      if (!chatId || !userId) return;
      // Broadcast is the primary delivery path; it does not depend on the
      // chats table being included in Supabase's Postgres Changes publication.
      void sendBroadcastSafely(`chat-presence:${chatId}`, "typing", {
        user_id: userId,
        name: currentUserName,
        is_typing: isTyping,
      });
      const typingRecipientId = otherMemberIdRef.current;
      if (chatType === "dm" && typingRecipientId) {
        void sendBroadcastSafely(`user-events-${typingRecipientId}`, "typing", {
          chat_id: chatId,
          user_id: userId,
          name: currentUserName,
          is_typing: isTyping,
        });
      }

      // Keep the stored state as a compatibility fallback for older clients.
      const { data: chat } = await supabase
        .from("chats")
        .select("typing_users")
        .eq("id", chatId)
        .single();

      const current = chat?.typing_users || {};

      if (isTyping) {
        current[userId] = {
          name: currentUserName,
          timestamp: Date.now()
        };
      } else {
        delete current[userId];
      }

      const { error } = await supabase
        .from("chats")
        .update({ typing_users: current })
        .eq("id", chatId);
      if (error) console.warn("[typing] fallback state update failed:", error.message);
    } catch (e) {
      console.error("[typing] update error:", e);
    }
  };

  const handleInputChange = (text: string) => {
    setNewMessage(text);
    
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


  const notifyMessage = async (messageId: string) => {
    await notifyPersistedMessage(messageId, { getToken, fetchImpl: fetch });
  };

  const handleMessageHoldStart = (msg: Message, e?: React.MouseEvent | React.TouchEvent) => {
    // If we're holding an image, let the image hold handler take priority
    if (isImageHoldRef.current) return;
    
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    
    let clientX = window.innerWidth / 2;
    let clientY = window.innerHeight / 2;
    if (e) {
      if ('touches' in e && e.touches && e.touches[0]) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
      }
    }

    longPressTimerRef.current = setTimeout(() => {
      // Don't show reaction modal if we're currently showing the save sticker modal
      if (!confirmStickerUrl) {
        setContextMenuMsg(msg);
        setContextMenuPos({ x: clientX, y: clientY });
      }
    }, 450);
  };

  const handleContextMenu = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    setContextMenuMsg(msg);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const handleMessageHoldEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Add Member Modal System
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [profileSearchQuery, setProfileSearchQuery] = useState("");
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  const isCurrentUserAdmin = chat?.created_by === userId || members.some(m => m.user_id === userId && m.role === "admin");

  const { 
    isRecording, 
    duration: recordingDuration, 
    startRecording, 
    stopRecording, 
    cancelRecording 
  } = useVoiceRecorder();

  // Calls
  const [activeCallRoom, setActiveCallRoom] = useState<string | null>(null);
  const [callHostName, setCallHostName] = useState<string>("Someone");
  const [incomingCall, setIncomingCall] = useState<boolean>(false);
  const [incomingCallRoomUrl, setIncomingCallRoomUrl] = useState<string | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const timerIntervalRef = useRef<any>(null);

  // Manage calling duration and media tracks
  useEffect(() => {
    if (activeCallRoom) {
      // Determine call type from latest message content
      const latestCallMsg = messages.slice().reverse().find(m => m.message_type === "call_event");
      const isVideo = latestCallMsg?.content?.includes("video") || false;
      setIsCameraOff(!isVideo);

      // Start duration timer
      setCallDuration(0);
      timerIntervalRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

      // Request user media if available (only for simulated mock calls)
      if (activeCallRoom.includes("mock.daily.co") && typeof navigator !== "undefined" && navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia({
          video: isVideo,
          audio: true
        })
        .then(stream => {
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        })
        .catch(err => {
          console.warn("[calling] Camera/mic permissions rejected or unavailable:", err);
        });
      }
    } else {
      // Cleanup when call ends
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {
            console.error(e);
          }
        });
        localStreamRef.current = null;
      }
      setCallDuration(0);
      setIsMicMuted(false);
      setIsCameraOff(false);
      setIsSpeakerMuted(false);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {
            console.error(e);
          }
        });
      }
    };
  }, [activeCallRoom]);

  const toggleMic = () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = isMicMuted;
      });
    }
    setIsMicMuted(!isMicMuted);
    toast.success(isMicMuted ? "Microphone active" : "Microphone muted");
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getVideoTracks().forEach(track => {
        track.enabled = isCameraOff;
      });
    }
    setIsCameraOff(!isCameraOff);
    toast.success(isCameraOff ? "Camera active" : "Camera turned off");
  };

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<any>(null);
  const isImageHoldRef = useRef(false);
  const messageRequestRef = useRef<{
    generation: number;
    chatId: string | null;
    initial: ChatRequestOwner | null;
    older: ChatRequestOwner | null;
    reconcile: ChatRequestOwner | null;
  }>({ generation: 0, chatId: null, initial: null, older: null, reconcile: null });
  const hasOlderMessagesRef = useRef(true);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const oldestCursorRef = useRef<{ created_at: string; id: string } | null>(null);

  useEffect(() => {
    if (chatId && userId) {
      loadChatDetails();
      loadSavedStickers();
      const unsubscribe = subscribeToChat();
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [chatId, userId]);

  // Need a ref that always has latest messages for the
  // closure inside setInterval to read correctly:
  const messagesRef = useRef<any[]>([]);
  const chatIdRef = useRef<string | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    chatIdRef.current = chatId || null;
  }, [chatId]);

  const isNearBottom = (): boolean => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 150;
  };

  const fetchNewMessages = async () => {
    const currentChatId = chatIdRef.current;
    if (!currentChatId || messageRequestRef.current.reconcile || document.visibilityState === "hidden") return;
    const owner: ChatRequestOwner = { generation: messageRequestRef.current.generation, chatId: currentChatId };
    messageRequestRef.current.reconcile = owner;

    const wasNearBottom = isNearBottom();
    const lastMsg = messagesRef.current[messagesRef.current.length - 1];

    let query = supabase
      .from("messages")
      .select(CHAT_MESSAGE_COLUMNS)
      .eq("chat_id", currentChatId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(CHAT_MESSAGE_PAGE_SIZE);

    if (lastMsg?.created_at && lastMsg?.id) {
      query = query.or(`created_at.gt.${lastMsg.created_at},and(created_at.eq.${lastMsg.created_at},id.gt.${lastMsg.id})`);
    }

    try {
      const { data, error } = await query;

      if (error) {
        console.error("[chat-poll] fetch error:", error.message);
        return;
      }

      if (!ownsChatRequest(owner, messageRequestRef.current) || chatIdRef.current !== currentChatId) return;

      if (data && data.length > 0) {
        console.log("[chat-poll] found", data.length, "new messages");
        setMessages(prev => data.reduce((next, message) => mergeIncomingMessage(next, message), prev));

        if (wasNearBottom) {
          setTimeout(() => scrollToBottom(), 100);
        } else {
          setShowNewMessagePill(true);
        }
      }
    } catch (error: any) {
      console.error("[chat-reconcile] fetch error:", error?.message || error);
    } finally {
      if (messageRequestRef.current.reconcile === owner) messageRequestRef.current.reconcile = null;
    }
  };

  useEffect(() => () => {
    if (debouncedStopTypingRef.current) clearTimeout(debouncedStopTypingRef.current);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (typingExpiryTimerRef.current) clearTimeout(typingExpiryTimerRef.current);
    typingExpiryTimerRef.current = null;
    setTypingUsers(new Map());
    if (isTypingRef.current) {
      isTypingRef.current = false;
      void updateTypingStatus(false);
    }
  }, [chatId]);

  const loadOlderMessages = async () => {
    const currentChatId = chatIdRef.current;
    const cursor = oldestCursorRef.current;
    if (!currentChatId || !cursor || !hasOlderMessagesRef.current || messageRequestRef.current.older) return;
    const owner: ChatRequestOwner = { generation: messageRequestRef.current.generation, chatId: currentChatId };
    messageRequestRef.current.older = owner;
    const container = messagesContainerRef.current;
    const previousHeight = container?.scrollHeight || 0;
    const previousTop = container?.scrollTop || 0;
    try {
      const { data, error } = await supabase
        .from("messages")
        .select(CHAT_MESSAGE_COLUMNS)
        .eq("chat_id", currentChatId)
        .or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(CHAT_MESSAGE_PAGE_SIZE);
      if (error) throw error;
      if (!ownsChatRequest(owner, messageRequestRef.current) || chatIdRef.current !== currentChatId) return;
      const older = [...(data || [])].reverse();
      hasOlderMessagesRef.current = older.length === CHAT_MESSAGE_PAGE_SIZE;
      setHasOlderMessages(hasOlderMessagesRef.current);
      if (older.length) {
        oldestCursorRef.current = getMessageCursor(older[0]);
        setMessages(prev => prependOlderMessages(older, prev));
        requestAnimationFrame(() => {
          if (container) container.scrollTop = previousTop + container.scrollHeight - previousHeight;
        });
      }
    } catch (error) {
      console.error("Failed to load earlier messages:", error);
    } finally {
      if (messageRequestRef.current.older === owner) messageRequestRef.current.older = null;
    }
  };

  // Bounded initial load when chatId changes
  useEffect(() => {
    if (!chatId) return;

    const owner: ChatRequestOwner = {
      generation: messageRequestRef.current.generation + 1,
      chatId,
    };
    messageRequestRef.current.generation = owner.generation;
    messageRequestRef.current.chatId = chatId;
    messageRequestRef.current.initial = owner;
    messageRequestRef.current.older = null;
    messageRequestRef.current.reconcile = null;

    const loadInitial = async () => {
      hasOlderMessagesRef.current = true;
      setHasOlderMessages(true);
      setLoading(true);
      oldestCursorRef.current = null;
      console.log("[chat] loading initial messages for:", chatId);
      const { data, error } = await supabase
        .from("messages")
        .select(CHAT_MESSAGE_COLUMNS)
        .eq("chat_id", chatId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(CHAT_MESSAGE_PAGE_SIZE);

      if (error) throw error;

      if (!ownsChatRequest(owner, messageRequestRef.current)) return;

      const initial = mergeMessagesById([...(data || [])].reverse());
      setMessages(initial);
      hasOlderMessagesRef.current = initial.length === CHAT_MESSAGE_PAGE_SIZE;
      setHasOlderMessages(hasOlderMessagesRef.current);
      oldestCursorRef.current = initial.length ? getMessageCursor(initial[0]) : null;
      setLoading(false);
      if (messageRequestRef.current.initial === owner) messageRequestRef.current.initial = null;
      requestAnimationFrame(() => {
        if (ownsChatRequest(owner, messageRequestRef.current)) scrollToBottom(true);
      });
    };

    loadInitial().catch((error) => {
      console.error("Failed to fetch messages:", error);
      if (ownsChatRequest(owner, messageRequestRef.current)) {
        messageRequestRef.current.initial = null;
        setLoading(false);
      }
    });
  }, [chatId]);

  // Polling loop — separate effect, runs continuously
  // while a chat is open, independent of message state
  // changes
  useEffect(() => {
    if (!chatId) return;

    console.log("[chat-poll] starting poll interval for:", chatId);

    // Realtime is the primary delivery path; retain a low-frequency visible
    // fallback for missed events and reconnects.
    // Only an active, visible conversation polls. This remains a bounded
    // fallback when broadcasts or database replication reconnect.
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void fetchNewMessages();
    }, 15_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void fetchNewMessages(); };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      console.log("[chat-poll] stopping poll interval");
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [chatId]); // ONLY chatId as dependency, nothing else

  const scrollToBottom = (instant = false) => {
    if (instant && messagesContainerRef.current) {
      requestAnimationFrame(() => {
        if (!messagesContainerRef.current) return;
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        if (messagesEndRef.current) {
           messagesEndRef.current.scrollIntoView({ behavior: "instant" as any });
        }
      });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    const handleFocus = () => {
      const container = messagesContainerRef.current;
      if (!container) return;
      const isNearBottom = 
        container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom) {
        scrollToBottom(true);
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    if (!chatId) return;

    const markAsRead = async () => {
      console.log("[chat] marking as read:", chatId);
      const { error } = await supabase
        .from("chats")
        .update({ unread_count: 0 })
        .eq("id", chatId);
      
      if (error) {
        console.error("[chat] mark as read failed:", error.message);
      }
    };

    markAsRead();
  }, [chatId]); // fires every time chatId changes, not just on mount

  // Reply and Reactions systems
  interface ParsedMessageData {
    text: string;
    replyTo: {
      id: string;
      sender_name: string;
      content: string;
      message_type: string;
    } | null;
    reactions: {
      emoji: string;
      users: { user_id: string; user_name: string }[];
    }[];
  }

  const parseMessageContent = (content: string | null): ParsedMessageData => {
    if (!content) {
      return { text: "", replyTo: null, reactions: [] };
    }
    if (content.startsWith('{"_msg":true,')) {
      try {
        const parsed = JSON.parse(content);
        return {
          text: parsed.text || "",
          replyTo: parsed.replyTo || null,
          reactions: parsed.reactions || [],
        };
      } catch (e) {
        console.error("Failed to parse JSON content:", e);
      }
    }
    return { text: content, replyTo: null, reactions: [] };
  };

  const serializeMessageContent = (text: string, replyTo: any, reactions: any[]) => {
    return JSON.stringify({
      _msg: true,
      text,
      replyTo,
      reactions,
    });
  };

  const isImageUrl = (url: string) => {
    return /\.(jpeg|jpg|gif|png|webp|svg)/i.test(url) || 
           url.startsWith('data:image/') || 
           url.includes('images.unsplash.com') || 
           url.includes('lh3.googleusercontent.com');
  };

  const parseImagesFromText = (text: string) => {
    if (!text) return { plainText: "", imageUrls: [] };
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = text.match(urlRegex) || [];
    const imageUrls: string[] = [];
    
    matches.forEach(url => {
      if (isImageUrl(url)) {
        imageUrls.push(url);
      }
    });

    let plainText = text;
    imageUrls.forEach(url => {
      plainText = plainText.replace(url, "");
    });
    plainText = plainText.trim().replace(/\s+/g, " ");

    return { plainText, imageUrls };
  };

  const renderImageMasonry = (urls: string[]) => {
    const count = urls.length;
    if (count === 0) return null;

    let gridClasses = "grid gap-2 mt-2 w-full max-w-[320px] sm:max-w-[400px]";
    if (count === 1) {
      gridClasses += " grid-cols-1";
    } else if (count === 2) {
      gridClasses += " grid-cols-2";
    } else if (count === 3) {
      gridClasses += " grid-cols-3";
    } else {
      gridClasses += " grid-cols-2 sm:grid-cols-3";
    }

    return (
      <div className={gridClasses} onClick={(e) => e.stopPropagation()}>
        {urls.map((url, idx) => {
          let itemClasses = "relative overflow-hidden rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-lg group/masonry cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-300";
          if (count === 3 && idx === 0) {
            itemClasses += " col-span-2 row-span-2 aspect-video sm:aspect-square";
          } else {
            itemClasses += " aspect-square";
          }

          return (
            <div
              key={idx}
              className={itemClasses}
              onClick={() => setFullscreenImg(url)}
            >
              <img
                src={url}
                alt={`Attached element ${idx + 1}`}
                className="w-full h-full object-cover rounded-xl transition-transform duration-500 group-hover/masonry:scale-105"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/10 opacity-0 group-hover/masonry:opacity-100 transition-opacity duration-300 pointer-events-none" />
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmStickerUrl(url);
                }}
                className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors opacity-0 group-hover/masonry:opacity-100 flex items-center justify-center shadow-lg"
                title="Save as Sticker"
              >
                <Bookmark size={11} />
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMessageTextWithLinks = (text: string, isMe: boolean) => {
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
              isMe
                ? "text-white underline font-semibold hover:text-blue-100 decoration-white/50"
                : "text-blue-600 dark:text-blue-400 underline font-semibold hover:text-blue-700 dark:hover:text-blue-300"
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

  const handleDeleteMessage = async (messageId: string) => {
    if (!window.confirm("Are you sure you want to delete this message?")) return;
    try {
      // 1. Optimistic delete
      setMessages(prev => prev.filter(m => m.id !== messageId));

      // 2. DB delete
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("id", messageId);

      if (error) throw error;
      toast.success("Message deleted");
    } catch (err: any) {
      toast.error("Failed to delete message: " + err.message);
      fetchMessages();
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!userId || !user) return;

    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    const parsed = parseMessageContent(msg.content);
    let reactions = [...parsed.reactions];

    const existingIdx = reactions.findIndex(r => r.emoji === emoji);

    if (existingIdx >= 0) {
      const reaction = reactions[existingIdx];
      const userIdx = reaction.users.findIndex(u => u.user_id === userId);

      if (userIdx >= 0) {
        const updatedUsers = reaction.users.filter(u => u.user_id !== userId);
        if (updatedUsers.length === 0) {
          reactions = reactions.filter(r => r.emoji !== emoji);
        } else {
          reactions[existingIdx] = { ...reaction, users: updatedUsers };
        }
      } else {
        reactions[existingIdx] = {
          ...reaction,
          users: [...reaction.users, { user_id: userId, user_name: currentFullName }]
        };
      }
    } else {
      reactions.push({
        emoji,
        users: [{ user_id: userId, user_name: currentFullName }]
      });
    }

    const serializedContent = serializeMessageContent(parsed.text, parsed.replyTo, reactions);

    // Optimistic state update
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: serializedContent } : m));

    try {
      const { error } = await supabase
        .from("messages")
        .update({ content: serializedContent })
        .eq("id", messageId);

      if (error) throw error;
    } catch (err: any) {
      console.error("Failed to toggle reaction:", err);
      fetchMessages();
    }
  };

  // Group roles & membership management
  const handleToggleMemberRole = async (memberUserId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "member" : "admin";
    try {
      setMembers(prev => prev.map(m => m.user_id === memberUserId ? { ...m, role: newRole } : m));

      const { error } = await supabase
        .from("chat_members")
        .update({ role: newRole })
        .eq("chat_id", chatId)
        .eq("user_id", memberUserId);

      if (error) throw error;
      toast.success(`Role updated to ${newRole}`);
    } catch (err: any) {
      toast.error("Failed to update role: " + err.message);
      fetchGroupMembers();
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    if (!window.confirm("Are you sure you want to remove this member from the group?")) return;
    try {
      setMembers(prev => prev.filter(m => m.user_id !== memberUserId));

      const { error } = await supabase
        .from("chat_members")
        .delete()
        .eq("chat_id", chatId)
        .eq("user_id", memberUserId);

      if (error) throw error;

      const { error: rpcErr } = await supabase.rpc("decrement_member_count", { chat_id_param: chatId });
      if (rpcErr && chat) {
        await supabase
          .from("chats")
          .update({ member_count: Math.max((chat.member_count || 1) - 1, 1) })
          .eq("id", chatId);
      }

      toast.success("Member removed");
    } catch (err: any) {
      toast.error("Failed to remove member: " + err.message);
      fetchGroupMembers();
    }
  };

  const fetchAllProfilesForInvite = async () => {
    setLoadingProfiles(true);
    try {
      const { data, error } = await supabase
        .from("profile_directory_v1")
        .select("clerk_id,username,full_name,profile_pic_url,image_url,bio")
        .limit(100);

      if (error) throw error;

      const memberUserIds = new Set(members.map(m => m.user_id));
      const filtered = (data || []).filter(p => p.clerk_id !== userId && !memberUserIds.has(p.clerk_id));
      setAllProfiles(filtered);
    } catch (err: any) {
      console.error("Failed to fetch profiles:", err);
      toast.error("Failed to load users list");
    } finally {
      setLoadingProfiles(false);
    }
  };

  const handleAddMemberToGroup = async (profile: any) => {
    try {
      const currentFullName = profile.full_name || profile.username || "User";
      
      const { error: joinErr } = await supabase
        .from("chat_members")
        .insert({
          chat_id: chatId,
          user_id: profile.clerk_id,
          user_email: profile.email || "",
          user_name: currentFullName,
          role: "member",
        });

      if (joinErr) throw joinErr;

      const { error: rpcErr } = await supabase.rpc("increment_member_count", { chat_id_param: chatId });
      if (rpcErr && chat) {
        await supabase
          .from("chats")
          .update({ member_count: (chat.member_count || 1) + 1 })
          .eq("id", chatId);
      }

      toast.success(`${currentFullName} added to community!`);
      fetchGroupMembers();
    } catch (err: any) {
      toast.error("Failed to add member: " + err.message);
    }
  };

  useEffect(() => {
    if (addMemberModalOpen) {
      fetchAllProfilesForInvite();
    }
  }, [addMemberModalOpen, members]);

  // Real-time listener for messages AND chat details (for active calls)
  const subscribeToChat = () => {
    if (!chatId) return;

    const uniqueId = Math.random().toString(36).substring(7);

    // Presence channel for typing indicator
    const presenceChannel = supabase.channel(`chat-presence:${chatId}`);
    presenceChannelRef.current = presenceChannel;

    presenceChannel
      .on("broadcast", { event: "new_message" }, ({ payload }: any) => {
        if (payload?.chat_id !== chatId || !payload?.id) return;
        const wasNearBottom = isNearBottom();
        setMessages(prev => mergeIncomingMessage(prev, payload));
        if (wasNearBottom) setTimeout(() => scrollToBottom(), 100);
        else setShowNewMessagePill(true);
      })
      .on("broadcast", { event: "typing" }, ({ payload }: any) => {
        applyTypingBroadcast(payload);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: userId,
            username: user?.username || "Anonymous",
            full_name: user?.fullName || "Anonymous",
            is_typing: false,
          });
        }
      });

    // Subscribe to chats table updates (for active call status and typing state).
    const chatChannel = supabase
      .channel(`chat-details-realtime:${chatId}-${uniqueId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => {
        const message = payload.new as Message;
        const wasNearBottom = isNearBottom();
        setMessages(prev => mergeIncomingMessage(prev, message));
        if (wasNearBottom) setTimeout(() => scrollToBottom(), 100);
        else setShowNewMessagePill(true);
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chats",
          filter: `id=eq.${chatId}`,
        },
        async (payload) => {
          const updatedChat = payload.new as Chat;
          setChat((prev) => (prev ? { ...prev, ...updatedChat } : updatedChat));
          applyTypingUsers(updatedChat.typing_users);

          // Call state changes
          if (updatedChat.active_call_status === "active" && updatedChat.active_call_room) {
            // Find who started the call
            const { data: latestCall } = await supabase
              .from("calls")
              .select("id,chat_id,host_id,host_name,host_avatar,chat_name,room_url,room_name,call_type,status")
              .eq("chat_id", chatId)
              .eq("status", "active")
              .order("started_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!latestCall?.room_url || !latestCall.room_name) {
              clearRecoveredActiveCall(chatId);
              setActiveCallRoom(null);
              setIncomingCall(false);
              setIncomingCallRoomUrl(null);
              return;
            }
            recoverActiveCall(latestCall);
            if (latestCall.host_id !== userId) {
              // Fetch host name
              const { data: hostProfile } = await supabase
                .from("profile_directory_v1")
                .select("full_name, username")
                .eq("clerk_id", latestCall.host_id)
                .maybeSingle();
              
              setCallHostName(hostProfile?.full_name || hostProfile?.username || "Someone");
              setIncomingCall(true);
              setIncomingCallRoomUrl(updatedChat.active_call_room);
            } else {
              // Current user is the host, join immediately
              setActiveCallRoom(updatedChat.active_call_room);
            }
          } else {
            setActiveCallRoom(null);
            setIncomingCall(false);
            setIncomingCallRoomUrl(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
      }
    };
  };



  const loadChatDetails = async () => {
    try {
      const { data: chatData, error: chatErr } = await supabase
        .from("chats")
        .select("id,chat_type,name,description,cover_image_url,is_public,member_count,invite_code,created_by,active_call_room,active_call_status,last_message,last_message_at,created_at,unread_count,typing_users")
        .eq("id", chatId)
        .single();

      if (chatErr) throw chatErr;
      if (chatIdRef.current !== chatId) return;
      setChat(chatData);
      applyTypingUsers(chatData.typing_users);

      if (chatData.active_call_status === "active" && chatData.active_call_room) {
        // Find who started the call
        const { data: latestCall } = await supabase
          .from("calls")
          .select("id,chat_id,host_id,host_name,host_avatar,chat_name,room_url,room_name,call_type,status")
          .eq("chat_id", chatId)
          .eq("status", "active")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!latestCall?.room_url || !latestCall.room_name) {
          clearRecoveredActiveCall(chatId);
          setActiveCallRoom(null);
          setIncomingCall(false);
          setIncomingCallRoomUrl(null);
        } else {
          recoverActiveCall(latestCall);
        }
        if (latestCall?.room_url && latestCall.room_name && latestCall.host_id !== userId) {
          // Fetch host name
          const { data: hostProfile } = await supabase
            .from("profile_directory_v1")
            .select("full_name, username")
            .eq("clerk_id", latestCall.host_id)
            .maybeSingle();

          setCallHostName(hostProfile?.full_name || hostProfile?.username || "Someone");
          setIncomingCall(true);
          setIncomingCallRoomUrl(chatData.active_call_room);
        } else if (latestCall?.room_url && latestCall.room_name) {
          setActiveCallRoom(chatData.active_call_room);
        }
      }

      if (chatData.chat_type === "dm") {
        // Fetch the other member
        const { data: membersData, error: memErr } = await supabase
          .from("chat_members")
          .select("user_id")
          .eq("chat_id", chatId)
          .neq("user_id", userId)
          .maybeSingle();

        if (membersData) {
          setOtherMemberId(membersData.user_id);
          const { data: otherProfile } = await supabase
          .from("profile_directory_v1")
            .select("*")
            .eq("clerk_id", membersData.user_id)
            .maybeSingle();

          if (otherProfile) {
            setOtherMember(otherProfile);
            setOtherMemberName(otherProfile.full_name || otherProfile.username || "User");
          }
        }
      } else {
        // Group community details
        fetchGroupMembers();
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load chat details");
    } finally {
      // Message loading owns the page loading state.
    }
  };

  const fetchGroupMembers = async () => {
    try {
      const { data: membersList, error: listErr } = await supabase
        .from("chat_members")
        .select("id, user_id, user_name, role, joined_at")
        .eq("chat_id", chatId);

      if (listErr) throw listErr;

      // Enrich with profile pics
      const userIds = membersList.map((m) => m.user_id);
      const { data: profilesList } = await supabase
        .from("profile_directory_v1")
        .select("clerk_id, username, profile_pic_url, image_url")
        .in("clerk_id", userIds);

      const profileMap = (profilesList || []).reduce((acc: any, p) => {
        acc[p.clerk_id] = p;
        return acc;
      }, {});

      const enriched = membersList.map((m) => ({
        ...m,
        profile_pic_url: profileMap[m.user_id]?.profile_pic_url || profileMap[m.user_id]?.image_url,
        username: profileMap[m.user_id]?.username,
      }));

      setMembers(enriched);
    } catch (err) {
      console.error("Error loading members:", err);
    }
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select(CHAT_MESSAGE_COLUMNS)
        .eq("chat_id", chatId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(CHAT_MESSAGE_PAGE_SIZE);

      if (error) throw error;
      setMessages(mergeMessagesById([...(data || [])].reverse()));
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    }
  };

  const loadSavedStickers = async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("saved_stickers")
        .eq("clerk_id", userId)
        .maybeSingle();

      if (data?.saved_stickers) {
        setSavedStickers(data.saved_stickers);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Part 2: resolving other member on load
  useEffect(() => {
    if (!chatId || chatType !== "dm" || !userId) {
      console.log("[chat-init] not a DM or no chatId, skipping member lookup");
      return;
    }

    const resolveOtherMember = async () => {
      console.log("[chat-init] resolving other member for chat:", chatId);
      
      const { data, error } = await supabase
        .from("chat_members")
        .select("user_id, user_name, user_email")
        .eq("chat_id", chatId)
        .neq("user_id", userId)
        .maybeSingle();

      console.log("[chat-init] chat_members query result:", data, error);

      if (data) {
        setOtherMemberId(data.user_id);
        setOtherMemberName(data.user_name || "User");
        console.log("[chat-init] ✅ other member resolved:", data.user_id);
      } else {
        console.error("[chat-init] ❌ could not resolve other member");
      }
    };

    resolveOtherMember();
  }, [chatId, chatType, userId]);

  // Part 1: extremely verbose logging on sendMessage
  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    console.log("[send] ============ SENDING MESSAGE ============");
    console.log("[send] chatId:", chatId);
    console.log("[send] chatType:", chatType);
    console.log("[send] currentUserId:", userId);
    console.log("[send] otherMemberId:", otherMemberId);

    const targetUserId = otherMemberIdRef.current;
    console.log("[send] using otherMemberId from ref:", targetUserId);

    const content = newMessage.trim();
    const finalContent = replyingTo 
      ? serializeMessageContent(
          content,
          replyingTo,
          []
        )
      : content;

    const newMsg = {
      chat_id: chatId,
      sender_id: userId,
      sender_role: "user",
      sender_name: currentUserName,
      content: finalContent,
      message_type: "text",
      user_id: userId,
      user_email: currentUserEmail,
      is_from_user: true,
      is_bot: false,
      read_by_admin: true,
      read_by_user: true
    };

    if (replyingTo) {
      setReplyingTo(null);
    }

    // Optimistic Update
    const tempId = "temp_" + Date.now();
    const tempMsg = {
      id: tempId,
      chat_id: chatId,
      sender_id: userId,
      sender_role: "user",
      sender_name: currentUserName,
      message_type: "text",
      content: finalContent,
      created_at: new Date().toISOString()
    } as Message;
    setMessages((prev) => [...prev, tempMsg]);

    const { data: inserted, error } = await supabase
      .from("messages")
      .insert(newMsg)
      .select()
      .single();

    console.log("[send] message inserted:", !!inserted, error?.message);

    if (error) {
      console.error("[send] INSERT FAILED, stopping here");
      // Remove optimistic message if insert failed
      setMessages((prev) => prev.filter(m => m.id !== tempId));
      return;
    }

    setNewMessage("");

    // Replace optimistic message with actual DB record
    if (inserted) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? inserted : m)));
      updateConversationPreview(inserted);

      try {
        const previewText = content.slice(0, 100);
        
        // Fetch current chat to get existing unread_count
        const { data: currentChat } = await supabase
          .from("chats")
          .select("unread_count")
          .eq("id", chatId)
          .single();

        await supabase
          .from("chats")
          .update({
            last_message: previewText,
            last_message_at: new Date().toISOString(),
            unread_count: (currentChat?.unread_count || 0) + 1
          })
          .eq("id", chatId);

        console.log("[send] chat updated, unread incremented");

        // Immediately fetch our own message via polling
        // logic so sender sees it right away too
        fetchNewMessages();
      } catch (chatUpdateErr: any) {
        console.error("[send] chats update failed:", chatUpdateErr.message);
      }
    }

    // Clear typing state immediately after sending
    if (debouncedStopTypingRef.current) {
      clearTimeout(debouncedStopTypingRef.current);
    }
    updateTypingStatus(false);
    isTypingRef.current = false;

    // Broadcast the message so old clients can receive it
    if (inserted) {
      sendBroadcastSafely(`chat-presence:${chatId}`, "new_message", inserted);
      sendBroadcastSafely(`support-chat-${chatId}`, "new_message", inserted);
      sendBroadcastSafely('admin-broadcast', "new_message", inserted);
      
      if (chatType === "dm" && targetUserId) {
        sendBroadcastSafely(`user-events-${targetUserId}`, "new_message", inserted);
      }
      await notifyMessage(inserted.id);
    }

  };

  const handleSendMessage = async (
    type: "text" | "image" | "sticker" | "audio" = "text",
    contentUrl?: string,
    textForImage?: string
  ) => {
    if (!userId || !user || !chatId) return;

    const content = type === "text" 
      ? newMessage.trim() 
      : (type === "image" && textForImage !== undefined ? textForImage.trim() : "");

    if (type === "text" && !content) return;

    if (type === "text" || type === "image") {
      setNewMessage("");
    }

    // Clear typing state immediately after sending
    if (debouncedStopTypingRef.current) {
      clearTimeout(debouncedStopTypingRef.current);
    }
    updateTypingStatus(false);
    isTypingRef.current = false;

    try {
      const finalContent = replyingTo 
        ? serializeMessageContent(
            content,
            replyingTo,
            []
          )
        : (type === "image" && content ? serializeMessageContent(content, null, []) : (type === "text" ? content : null));

      const messagePayload = {
        chat_id: chatId,
        sender_id: userId,
        sender_role: "user",
        sender_name: currentFullName,
        message_type: type,
        content: finalContent,
        attachment_url: (type === "image" || type === "audio") ? contentUrl : null,
        attachment_type: type === "image" ? "image/webp" : type === "audio" ? "audio/webm" : null,
        sticker_url: type === "sticker" ? contentUrl : null,
        created_at: new Date().toISOString(),
      };

      if (replyingTo) {
        setReplyingTo(null);
      }

      // Optimistic update
      const tempId = "temp_" + Date.now();
      const tempMsg = { id: tempId, ...messagePayload } as Message;
      setMessages((prev) => [...prev, tempMsg]);

      console.log("[send-msg] inserting:", messagePayload);

      const { data, error } = await supabase
        .from("messages")
        .insert(messagePayload)
        .select()
        .single();

      console.log("[send-msg] insert result:", data, error);

      if (error) throw error;

      // Replace optimistic message with actual DB record
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)));
      updateConversationPreview(data);

      // Broadcast the message so old clients can receive it
      if (data) {
        sendBroadcastSafely(`chat-presence:${chatId}`, "new_message", data);
        sendBroadcastSafely(`support-chat-${chatId}`, "new_message", data);
        sendBroadcastSafely('admin-broadcast', "new_message", data);
        
        const targetUserId = otherMember?.clerk_id || otherMemberIdRef.current;
        if (chat?.chat_type === "dm" && targetUserId) {
          sendBroadcastSafely(`user-events-${targetUserId}`, "new_message", data);
        }
      }

      // Notifications
      const targetUserId = otherMember?.clerk_id || otherMemberIdRef.current;
      if (chat?.chat_type === "dm" && targetUserId) {
        sendBroadcastSafely(`user-events-${targetUserId}`, "new_unread");
      } else if (chat?.chat_type === "group" || chat?.chat_type === "channel") {
        try {
          const { data: membersList } = await supabase.from("chat_members").select("user_id").eq("chat_id", chatId).neq("user_id", userId);
          if (membersList) {
            membersList.forEach(m => {
              if (m.user_id) {
                sendBroadcastSafely(`user-events-${m.user_id}`, "new_unread");
              }
            });
          }
        } catch (e) {
          console.error("Group broadcast error:", e);
        }
      }

      if (data) await notifyMessage(data.id);

      // Fetch current chat to get existing unread_count
      const { data: currentChat } = await supabase
        .from("chats")
        .select("unread_count")
        .eq("id", chatId)
        .single();

      // Update chat last message preview
      await supabase
        .from("chats")
        .update({
          last_message: type === "text" ? content : type === "image" ? (content ? `📷 ${content}` : "📷 Sent an image") : type === "audio" ? "🎵 Voice transmission" : "🎨 Sent a sticker",
          last_message_at: new Date().toISOString(),
          unread_count: (currentChat?.unread_count || 0) + 1
        })
        .eq("id", chatId);

      // Immediately fetch our own message via polling
      // logic so sender sees it right away too
      fetchNewMessages();
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
    }
  };

  const handleClearSelectedImage = () => {
    setSelectedImageFile(null);
    setSelectedImagePreview(null);
  };

  const handleSendQueuedImage = async () => {
    if (!selectedImageFile || !userId || !user || !chatId) return;
    setUploadingImage(true);
    try {
      const textToSend = newMessage.trim();
      const fileToUpload = selectedImageFile;

      setSelectedImageFile(null);
      setSelectedImagePreview(null);

      const url = await compressAndUpload(fileToUpload);
      await handleSendMessage("image", url, textToSend);
      toast.success("Image sent! ✓");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  };

  const uploadAudioToCloudinary = async (file: File): Promise<string> => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName) {
      throw new Error("Missing VITE_CLOUDINARY_CLOUD_NAME env var");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", preset);
    formData.append("resource_type", "video");

    const url = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
    const res = await fetch(url, {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    return data.secure_url;
  };

  const handleVoiceNoteSend = async (url: string, duration: number) => {
    console.log("[voice-note] sending message with duration:", duration);
    if (!userId || !chatId) return;

    const payload = {
      chat_id: chatId,
      sender_id: userId,
      sender_role: "user",
      sender_name: currentUserName,
      content: "",
      message_type: "voice_note" as const,
      attachment_url: url,
      attachment_type: null,
      sticker_url: null,
      duration_seconds: duration,
      user_id: userId,
      user_email: currentUserEmail,
      is_from_user: true,
      is_bot: false,
      read_by_admin: true,
      read_by_user: true,
      created_at: new Date().toISOString()
    };

    // Optimistic Update
    const tempId = "temp_" + Date.now();
    const tempMsg = { id: tempId, ...payload } as Message;
    setMessages((prev) => [...prev, tempMsg]);

    const { data, error } = await supabase
      .from("messages")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    // Replace optimistic message with actual DB record
    setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)));
    updateConversationPreview(data);

    // Broadcast the message
    if (data) {
      sendBroadcastSafely(`chat-presence:${chatId}`, "new_message", data);
      sendBroadcastSafely(`support-chat-${chatId}`, "new_message", data);
      sendBroadcastSafely('admin-broadcast', "new_message", data);
      
      const targetUserId = otherMemberIdRef.current;
      if (chat?.chat_type === "dm" && targetUserId) {
        sendBroadcastSafely(`user-events-${targetUserId}`, "new_message", data);
        sendBroadcastSafely(`user-events-${targetUserId}`, "new_unread");
      } else if (chat?.chat_type === "group" || chat?.chat_type === "channel") {
        const { data: membersList } = await supabase.from("chat_members").select("user_id").eq("chat_id", chatId).neq("user_id", userId);
        (membersList || []).forEach((member) => {
          if (member.user_id) sendBroadcastSafely(`user-events-${member.user_id}`, "new_unread");
        });
      }
    }

    if (data) await notifyMessage(data.id);

    // Fetch current chat to get existing unread_count
    const { data: currentChat } = await supabase
      .from("chats")
      .select("unread_count")
      .eq("id", chatId)
      .single();

    // Update chat last message preview
    await supabase
      .from("chats")
      .update({
        last_message: "🎤 Voice note",
        last_message_at: new Date().toISOString(),
        unread_count: (currentChat?.unread_count || 0) + 1
      })
      .eq("id", chatId);
  };

  const handleSendVoice = async () => {
    setIsUploadingVoice(true);
    const durationToSend = recordingDuration;
    try {
      const blob = await stopRecording();
      const file = new File([blob], `voice_${Date.now()}.webm`, { type: "audio/webm" });
      const url = await uploadAudioToCloudinary(file);
      await handleVoiceNoteSend(url, durationToSend);
      toast.success("Voice note sent! ✓");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to send voice note");
    } finally {
      setIsUploadingVoice(false);
    }
  };

  // Sticker sending
  const sendSticker = (sticker: string) => {
    handleSendMessage("sticker", sticker);
    setStickerOpen(false);
  };

  // Long-press detection to save stickers
  const handlePressStart = (e?: any, imgUrl?: string) => {
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    if (!imgUrl) return;
    isImageHoldRef.current = false;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      isImageHoldRef.current = true;
      setConfirmStickerUrl(imgUrl);
    }, 600); // 600ms hold
  };

  const handlePressEnd = (e?: any) => {
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const saveSticker = async (imgUrl: string) => {
    if (!userId) return;
    try {
      if (savedStickers.includes(imgUrl)) {
        toast.error("Sticker already saved!");
        return;
      }

      const updated = [...savedStickers, imgUrl];

      const { error } = await supabase
        .from("profiles")
        .update({ saved_stickers: updated })
        .eq("clerk_id", userId);

      if (error) throw error;

      setSavedStickers(updated);
      toast.success("Added to saved stickers! ✓");
    } catch (err: any) {
      toast.error("Failed to save sticker");
    }
  };

  const { startCall: globalStartCall, endActiveCall, recoverActiveCall, clearRecoveredActiveCall } = useCall();

  // Call features via server API
  const startCall = async (callType: "voice" | "video" = "voice") => {
    if (!chatId || !userId) return;
    const targetUserId = otherMemberIdRef.current;
    await globalStartCall(chatId, targetUserId, getChatDisplayName() || "Chat", callType);
  };

  const endCall = async () => {
    if (!chatId || isEndingCallRef.current) return;
    isEndingCallRef.current = true;
    const loadToast = toast.loading("Ending call...");
    try {
      const result = await endActiveCall();
      toast.dismiss(loadToast);
      if (!result.ok) throw new Error(result.code);
      setActiveCallRoom(null);
      setIncomingCall(false);
      toast.success("Call ended successfully");
    } catch (err: any) {
      toast.dismiss(loadToast);
      toast.error(err.message || "Failed to end call");
    } finally {
      isEndingCallRef.current = false;
    }
  };

  // Leave Group Community
  const leaveGroup = async () => {
    if (!chatId || !userId || !chat) return;
    const confirm = window.confirm(`Are you sure you want to leave "${chat.name}"?`);
    if (!confirm) return;

    try {
      // 1. Remove member
      const { error } = await supabase
        .from("chat_members")
        .delete()
        .eq("chat_id", chatId)
        .eq("user_id", userId);

      if (error) throw error;

      // 2. Decrement member count
      const { error: rpcErr } = await supabase.rpc("decrement_member_count", { chat_id_param: chatId });
      if (rpcErr && chat) {
        await supabase
          .from("chats")
          .update({ member_count: Math.max(1, (chat.member_count || 1) - 1) })
          .eq("id", chatId);
      }

      toast.success(`You left "${chat.name}"`);
      navigate("/chats");
    } catch (err: any) {
      toast.error(err.message || "Failed to leave community");
    }
  };

  // Delete Group Community
  const deleteGroup = async () => {
    if (!chatId || !chat) return;
    const confirm = window.confirm(`CRITICAL: Are you sure you want to permanently delete "${chat.name}"? This action is irreversible.`);
    if (!confirm) return;

    try {
      const { error } = await supabase.from("chats").delete().eq("id", chatId);
      if (error) throw error;

      toast.success(`Deleted "${chat.name}"`);
      navigate("/chats");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete community");
    }
  };

  // Delete DM Chat
  const handleDeleteDM = async () => {
    if (!chatId) return;
    const confirm = window.confirm("Are you sure you want to delete this chat and all messages with this contact? This action is irreversible.");
    if (!confirm) return;

    try {
      // 1. Delete messages first
      const { error: msgErr } = await supabase
        .from("messages")
        .delete()
        .eq("chat_id", chatId);
      if (msgErr) console.warn("Messages delete warn/err:", msgErr);

      // 2. Delete members
      const { error: memErr } = await supabase
        .from("chat_members")
        .delete()
        .eq("chat_id", chatId);
      if (memErr) console.warn("Members delete warn/err:", memErr);

      // 3. Delete the chat itself
      const { error: chatErr } = await supabase
        .from("chats")
        .delete()
        .eq("id", chatId);
      if (chatErr) throw chatErr;

      toast.success("Conversation deleted successfully");
      navigate("/chats?tab=dm");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete conversation");
    }
  };

  const handleShowUserProfile = async (userIdToFind: string) => {
    if (userIdToFind === userId) return; // Don't show modal for self
    
    // First check current members list (fastest)
    const member = members.find(m => m.user_id === userIdToFind);
    if (member) {
      setUserProfileModal({
        clerk_id: member.user_id,
        full_name: member.user_name,
        username: member.username,
        profile_pic_url: member.profile_pic_url,
        bio: member.bio || ""
      });
      return;
    } 
    
    if (chat?.chat_type === "dm" && otherMember && otherMember.clerk_id === userIdToFind) {
      setUserProfileModal(otherMember);
      return;
    }

    // Fallback: Fetch from database (e.g. if user left the group)
    try {
      const { data, error } = await supabase
        .from("profile_directory_v1")
        .select("clerk_id,username,full_name,profile_pic_url,image_url,bio")
        .eq("clerk_id", userIdToFind)
        .maybeSingle();
      
      if (data) {
        setUserProfileModal(data);
      }
    } catch (err) {
      console.error("Failed to fetch user profile:", err);
    }
  };

  const copyInviteLink = () => {
    if (!chat?.invite_code) return;
    const fullLink = `${window.location.origin}/join/${chat.invite_code}`;
    navigator.clipboard.writeText(fullLink);
    toast.success("Invite link copied to clipboard!");
  };

  const getChatDisplayName = () => {
    if (chat?.chat_type === "dm") {
      return otherMember?.full_name || otherMember?.username || "Plugsy Contact";
    }
    return chat?.name || "Community";
  };

  const getChatDisplayPic = () => {
    if (chat?.chat_type === "dm") {
      return otherMember?.profile_pic_url || otherMember?.image_url;
    }
    return chat?.cover_image_url;
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 dark:bg-[#08080a] text-slate-800 dark:text-slate-100 font-sans relative">
      {/* Column 1: Left Navigation Sidebar */}
      <div className="hidden md:flex w-[80px] lg:w-[240px] flex-col shrink-0 bg-white/90 dark:bg-[#0c0c0e]/85 backdrop-blur-3xl border-r border-slate-200 dark:border-white/5 p-4 justify-between h-full relative z-30 transition-all duration-300">
        <div className="flex flex-col gap-6">
          {/* Top Logo */}
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 shadow-lg shadow-blue-500/20 border border-slate-200 dark:border-white/10">
              <img src={plugsyLogo} alt="Plugsy Logo" className="w-full h-full object-cover" />
            </div>
            <span className="hidden lg:block text-xl font-extrabold tracking-tight text-slate-900 dark:text-white font-display">
              Plugsy<span className="text-[#3B82F6]">.</span>
            </span>
          </div>

          {/* New Chat Button */}
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full h-12 flex items-center justify-center lg:justify-start gap-3 px-4 bg-[#3B82F6] hover:bg-blue-600 active:scale-95 text-white font-bold rounded-2xl cursor-pointer shadow-lg shadow-blue-500/10 transition-all text-sm shrink-0"
          >
            <Plus size={18} />
            <span className="hidden lg:block font-black tracking-wide">New Chat</span>
          </button>

          {/* Navigation items */}
          <div className="space-y-1">
            {[
              { id: "dm", label: "DMs", icon: MessageSquare, path: "/chats?tab=dm" },
              { id: "status", label: "Status", icon: CircleDot, path: "/chats?tab=status" },
              { id: "communities", label: "Communities", icon: Users, path: "/chats?tab=communities" },
              { id: "channels", label: "Channels", icon: Megaphone, path: "/chats?tab=channels" },
            ].map((item) => {
              const isActive = sidebarActiveTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setSidebarActiveTab(item.id as any);
                    navigate(item.path);
                  }}
                  className={`w-full h-11 flex items-center justify-center lg:justify-start gap-3 px-4 rounded-xl transition-all cursor-pointer text-sm ${
                    isActive
                      ? "bg-white/[0.04] border border-white/5 text-[#3B82F6] font-bold"
                      : "text-slate-400 hover:text-white hover:bg-white/[0.02]"
                  }`}
                >
                  <Icon size={18} className={isActive ? "text-[#3B82F6]" : "text-slate-400"} />
                  <span className="hidden lg:block font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom profile info */}
        <div className="flex items-center justify-between p-2 rounded-2xl bg-slate-50 dark:bg-[#141416]/50 border border-slate-250 dark:border-white/5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-200 dark:border-white/10 bg-black/10 dark:bg-black/40 shrink-0">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#3B82F6]/10 text-[#3B82F6] text-xs font-black uppercase">
                  {user?.fullName?.slice(0, 2) || "U"}
                </div>
              )}
            </div>
            <div className="hidden lg:block min-w-0 text-left">
              <h5 className="font-bold text-xs text-slate-900 dark:text-white truncate">{user?.fullName || "Member"}</h5>
              <p className="text-[10px] text-slate-500 font-semibold truncate mt-0.5">View profile</p>
            </div>
          </div>
          <button
            onClick={() => {
              navigate("/chats?tab=dm");
              setTimeout(() => {
                const el = document.getElementById("edit-profile-btn");
                if (el) el.click();
              }, 500);
            }}
            className="hidden lg:flex w-8 h-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.02] hover:bg-slate-200 dark:hover:bg-white/[0.05] border border-slate-200 dark:border-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Column 2: Middle Conversation List (DMs / Communities / Channels) */}
      <div className="hidden md:flex w-[320px] flex-col shrink-0 bg-slate-100/40 dark:bg-[#0c0c0e]/45 backdrop-blur-3xl border-r border-slate-200 dark:border-white/5 h-full relative z-20">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-white/5 flex flex-col gap-3">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white font-display text-left">
            Conversations
          </h2>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400 dark:text-white/30" size={14} />
          <SearchChat
            value={sidebarSearchQuery}
            onChange={setSidebarSearchQuery}
            placeholder="Search conversations..."
            className="w-full"
          />
          </div>
        </div>

        {/* List content */}
        <div className="flex-grow overflow-y-auto p-2 space-y-1">
          {sidebarActiveTab === "dm" && (
            conversations.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">No conversations yet</div>
            ) : (
              <>
                <style>{`
                  @keyframes typingBounce {
                    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                    30% { transform: translateY(-3px); opacity: 1; }
                  }
                `}</style>
                {conversations
                  .filter(conv => {
                    const name = conv.otherUserName || "User";
                    return name.toLowerCase().includes(sidebarSearchQuery.toLowerCase());
                  })
                  .map((conv) => {
                    return (
                      <Link
                        key={conv.id}
                        to={`/chats/${conv.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          openConversation(conv.id);
                        }}
                        className="block"
                      >
                        <div style={{
                          display: "flex", justifyContent: "space-between",
                          alignItems: "center", padding: "12px 16px",
                          borderRadius: "16px", cursor: "pointer",
                          border: conv.id === chatId ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid transparent",
                          background: conv.id === chatId 
                            ? "rgba(59, 130, 246, 0.15)" 
                            : (conv.unread_count > 0 ? "rgba(255,255,255,0.03)" : "transparent")
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{
                              width: "40px", height: "40px", borderRadius: "50%",
                              overflow: "hidden", background: "#333",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0
                            }}>
                              {conv.otherUserAvatar ? (
                                <img src={conv.otherUserAvatar} style={{
                                  width: "100%", height: "100%", objectFit: "cover"
                                }} />
                              ) : (
                                <span style={{ color: "white", fontWeight: 600 }}>
                                  {(conv.otherUserName || "?")[0].toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 text-left">
                              <p style={{
                                color: "white", fontSize: "14px", fontWeight: 600, margin: 0
                              }}>
                                {conv.otherUserName}
                              </p>
                              {isOtherUserTyping(conv) ? (
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <div style={{ display: "flex", gap: "2px" }}>
                                    {[0, 1, 2].map(i => (
                                      <div key={i} style={{
                                        width: "4px", height: "4px", borderRadius: "50%",
                                        background: "#60a5fa",
                                        animation: "typingBounce 1.2s infinite",
                                        animationDelay: (i * 0.15) + "s"
                                      }} />
                                    ))}
                                  </div>
                                  <span style={{ color: "#60a5fa", fontSize: "12px", fontStyle: "italic" }}>
                                    typing...
                                  </span>
                                </div>
                              ) : (
                                <p style={{
                                  color: "rgba(255,255,255,0.4)", fontSize: "12px",
                                  margin: 0, overflow: "hidden", textOverflow: "ellipsis",
                                  whiteSpace: "nowrap", maxWidth: "180px"
                                }}>
                                  {conv.last_message || "No messages yet"}
                                </p>
                              )}
                            </div>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", 
                            alignItems: "flex-end", gap: "4px" }}>
                            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>
                              {getRelativeTime(conv.last_message_at || conv.created_at)}
                            </span>
                            {conv.unread_count > 0 && (
                              <span style={{
                                background: "#2563eb", color: "white",
                                fontSize: "10px", fontWeight: 700,
                                borderRadius: "999px", minWidth: "18px", height: "18px",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                padding: "0 5px"
                              }}>
                                {conv.unread_count}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
              </>
            )
          )}

          {sidebarActiveTab === "communities" && (
            sidebarGroups.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">No joined communities</div>
            ) : (
              sidebarGroups
                .filter(g => g.name?.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
                .map((group) => {
                  const isSelected = group.id === chatId;
                  return (
                    <Link
                      key={group.id}
                      to={`/chats/${group.id}`}
                      className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                        isSelected
                          ? "bg-[#3B82F6]/10 border-[#3B82F6]/30 text-white shadow-[inset_0_1px_1px_0px_rgba(255,255,255,0.05)]"
                          : "bg-transparent border-transparent text-slate-300 hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 bg-black/40 shrink-0">
                        {group.cover_image_url ? (
                          <img src={group.cover_image_url} alt={group.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#3B82F6]/10 text-[#3B82F6] font-extrabold text-sm uppercase">
                            {group.name?.slice(0, 2)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-grow text-left">
                        <h4 className="font-bold text-xs text-slate-800 dark:text-white truncate">{group.name}</h4>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{group.description || "Community Chat"}</p>
                      </div>
                      <span className="text-[9px] text-[#3B82F6] bg-[#3B82F6]/10 px-1.5 py-0.5 rounded-md font-bold shrink-0 self-start mt-0.5">
                        {group.member_count || 1}
                      </span>
                    </Link>
                  );
                })
            )
          )}

          {sidebarActiveTab === "channels" && (
            sidebarChannels.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">No joined channels</div>
            ) : (
              sidebarChannels
                .filter(c => c.name?.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
                .map((chan) => {
                  const isSelected = chan.id === chatId;
                  return (
                    <Link
                      key={chan.id}
                      to={`/chats/${chan.id}`}
                      className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                        isSelected
                          ? "bg-[#3B82F6]/10 border-[#3B82F6]/30 text-white shadow-[inset_0_1px_1px_0px_rgba(255,255,255,0.05)]"
                          : "bg-transparent border-transparent text-slate-300 hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 bg-black/40 shrink-0">
                        {chan.cover_image_url ? (
                          <img src={chan.cover_image_url} alt={chan.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#3B82F6]/10 text-[#3B82F6] font-extrabold text-sm uppercase">
                            {chan.name?.slice(0, 2)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-grow text-left">
                        <h4 className="font-bold text-xs text-slate-800 dark:text-white truncate">{chan.name}</h4>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{chan.description || "Broadcast Channel"}</p>
                      </div>
                      <span className="text-[9px] text-[#3B82F6] bg-[#3B82F6]/10 px-1.5 py-0.5 rounded-md font-bold shrink-0 self-start mt-0.5">
                        {chan.member_count || 1}
                      </span>
                    </Link>
                  );
                })
            )
          )}
        </div>
      </div>

      {/* Column 3: Active Chat Window (visible, takes full-screen on mobile) */}
      <div className="flex flex-col flex-grow h-full overflow-hidden bg-slate-50 dark:bg-[#08080a] relative">
        {/* Floating Geometric Shapes Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <HeroGeometric
            containerClassName="!min-h-0 !h-full !w-full !absolute inset-0 !bg-transparent pointer-events-none"
            hideContent={true}
          />
        </div>

        {/* Subtle, dynamic geometric SVG background patterns & liquid-glass overlay */}
        <div className="absolute inset-0 pointer-events-none z-[1] overflow-hidden opacity-35">
          <svg className="absolute w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="dotGrid" width="30" height="30" patternUnits="userSpaceOnUse">
                <circle cx="15" cy="15" r="1.2" fill="#3B82F6" opacity="0.3" />
              </pattern>
              <pattern id="gridPattern" width="90" height="90" patternUnits="userSpaceOnUse">
                <path d="M 90 0 L 0 0 0 90" fill="none" stroke="rgba(59, 130, 246, 0.05)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dotGrid)" />
            <rect width="100%" height="100%" fill="url(#gridPattern)" />
          </svg>
          
          {/* Animated liquid-glass fluid blobs */}
          <div className="absolute top-1/4 left-1/4 w-[450px] h-[450px] bg-gradient-to-tr from-blue-500/10 to-indigo-500/5 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '9s' }} />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-gradient-to-tr from-cyan-500/10 to-purple-500/5 rounded-full blur-[110px] animate-pulse" style={{ animationDuration: '14s' }} />
        </div>
        
        {/* Soft liquid-glass container overlay blur */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-slate-50/30 dark:via-[#08080a]/30 to-slate-50/75 dark:to-[#08080a]/75 backdrop-blur-[1.5px] z-[2]" />

        {/* Chat Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-[#0c0c0e]/80 border-b border-slate-200 dark:border-white/5 shrink-0 relative z-20 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/chats"
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              <ChevronLeft size={20} />
            </Link>

            {loading ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-white/5 animate-pulse shrink-0" />
                <div className="space-y-1">
                  <div className="w-24 h-4 bg-slate-200 dark:bg-white/5 animate-pulse rounded" />
                  <div className="w-16 h-2.5 bg-slate-150 dark:bg-white/5 animate-pulse rounded" />
                </div>
              </div>
            ) : (
              <>
                {/* Avatar / Cover */}
                <div className="relative shrink-0">
                  <div
                    onClick={() => {
                      if (chat?.chat_type === "dm" && otherMember) {
                        setUserProfileModal(otherMember);
                      } else {
                        setInfoOpen(true);
                      }
                    }}
                    className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/30 cursor-pointer hover:opacity-85 transition-opacity"
                  >
                    {getChatDisplayPic() ? (
                      <img
                        src={getChatDisplayPic() || ""}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-black uppercase text-slate-500 bg-slate-200 dark:bg-black/40">
                        {getChatDisplayName().slice(0, 2)}
                      </div>
                    )}
                  </div>
                  {chat?.chat_type === "dm" && otherMember && isUserOnline(otherMember.clerk_id, otherMember.last_login_at) && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-[#0c0c0e] rounded-full shadow-[0_0_8px_rgba(16,185,129,0.7)] z-10 flex items-center justify-center">
                      <span className="absolute w-full h-full bg-emerald-400 rounded-full animate-ping opacity-75"></span>
                    </span>
                  )}
                </div>

                <div
                  onClick={() => {
                    if (chat?.chat_type === "dm" && otherMember) {
                      setUserProfileModal(otherMember);
                    } else {
                      setInfoOpen(true);
                    }
                  }}
                  className="min-w-0 text-left cursor-pointer"
                >
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white truncate hover:text-blue-500 transition-colors">
                    {getChatDisplayName()}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {chat?.chat_type === "dm" && otherMember && isUserOnline(otherMember.clerk_id, otherMember.last_login_at) ? (
                      <span className="text-[9px] font-black tracking-widest text-emerald-500 uppercase flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                        Online
                      </span>
                    ) : (
                      <p className="text-[10px] text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider">
                        {chat?.chat_type === "dm"
                          ? otherMember?.username
                            ? `@${otherMember.username}`
                            : "Direct Message"
                          : `${chat?.member_count || 1} Members`}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Action Header Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {loading ? (
              <div className="flex gap-2">
                <div className="w-9 h-9 bg-slate-200 dark:bg-white/5 animate-pulse rounded-xl" />
                <div className="w-9 h-9 bg-slate-200 dark:bg-white/5 animate-pulse rounded-xl" />
                <div className="w-9 h-9 bg-slate-200 dark:bg-white/5 animate-pulse rounded-xl" />
              </div>
            ) : activeCallRoom ? (
              <button
                onClick={endCall}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[10px] font-black uppercase tracking-wider shadow-md shadow-red-500/15 cursor-pointer hover:scale-105 active:scale-95 transition-all"
                title="End Current Call"
              >
                <PhoneOff size={14} />
                <span className="animate-pulse">Live</span>
              </button>
            ) : (
              <>
                {isCurrentUserAdmin && (chat?.chat_type === "group" || chat?.chat_type === "channel") && (
                  <button
                    onClick={() => setInfoOpen(true)}
                    className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-all cursor-pointer hidden sm:flex items-center gap-2"
                    title="Community Settings"
                  >
                    <Settings size={15} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Settings</span>
                  </button>
                )}
                {(chatType === "dm" || chatType === "group") && (
                  <>
                    <button
                      onClick={() => startCall("voice")}
                      aria-label="Start voice call"
                      className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-all cursor-pointer hover:scale-105 active:scale-95"
                      title="Start Voice Call"
                    >
                      <Phone size={15} />
                    </button>
                    <button
                      onClick={() => startCall("video")}
                      aria-label="Start video call"
                      className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-all cursor-pointer hover:scale-105 active:scale-95"
                      title="Start Video Call"
                    >
                      <Video size={15} />
                    </button>
                  </>
                )}
              </>
            )}

            {!loading && (
              <div className="relative">
                <button
                  onClick={() => setInfoOpen(!infoOpen)}
                  aria-label="Open chat details"
                  className={`p-2.5 rounded-xl transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                    infoOpen
                      ? "bg-blue-500 text-white shadow-md shadow-blue-500/10"
                      : "bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                  }`}
                  title="Chat Info & Settings"
                >
                  <MoreVertical size={15} />
                </button>
              </div>
            )}
          </div>
        </div>


        {/* Messages Feed */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-grow overflow-y-auto p-4 md:p-6 space-y-4 relative z-10 scrollbar-none"
        >
          {!loading && messages.length > 0 && hasOlderMessages && (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                onClick={() => void loadOlderMessages()}
                className="text-xs font-semibold text-blue-500 hover:text-blue-600 px-3 py-1.5 rounded-full bg-blue-500/10"
              >
                Load earlier messages
              </button>
            </div>
          )}
          {loading ? (
            <div className="space-y-5 h-full flex flex-col justify-end">
              <div className="flex items-end gap-3 justify-start text-left">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/5 animate-pulse shrink-0" />
                <div className="flex flex-col gap-1.5 max-w-[70%]">
                  <div className="w-20 h-3 bg-slate-200 dark:bg-white/5 animate-pulse rounded" />
                  <div className="w-48 h-10 bg-slate-200 dark:bg-white/5 animate-pulse rounded-2xl rounded-bl-none" />
                </div>
              </div>
              <div className="flex items-end gap-3 justify-end text-right self-end">
                <div className="flex flex-col gap-1.5 items-end max-w-[70%]">
                  <div className="w-24 h-3 bg-slate-200 dark:bg-white/5 animate-pulse rounded" />
                  <div className="w-32 h-10 bg-blue-500/10 dark:bg-blue-500/5 animate-pulse rounded-2xl rounded-br-none" />
                </div>
              </div>
              <div className="flex items-end gap-3 justify-start text-left">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/5 animate-pulse shrink-0" />
                <div className="flex flex-col gap-1.5 max-w-[70%]">
                  <div className="w-16 h-3 bg-slate-200 dark:bg-white/5 animate-pulse rounded" />
                  <div className="w-64 h-12 bg-slate-200 dark:bg-white/5 animate-pulse rounded-2xl rounded-bl-none" />
                </div>
              </div>
              <div className="flex items-end gap-3 justify-end text-right self-end">
                <div className="flex flex-col gap-1.5 items-end max-w-[70%]">
                  <div className="w-20 h-3 bg-slate-200 dark:bg-white/5 animate-pulse rounded" />
                  <div className="w-56 h-10 bg-blue-500/10 dark:bg-blue-500/5 animate-pulse rounded-2xl rounded-br-none" />
                </div>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12 max-w-xs mx-auto h-full">
              <MessageSquare size={36} className="text-slate-300 dark:text-white/10 mb-3" />
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                Start of conversation
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Say hello to start the discussion!
              </p>
            </div>
          ) : (
            messages
              .filter((msg, index, self) => msg && index === self.findIndex((m) => m.id === msg.id))
              .map((msg, idx) => {
                const isMe = msg.sender_id === userId;
                const isSticker = msg.message_type === "sticker";
                const isCallEvent = msg.message_type === "call_event";

                if (isCallEvent) {
                  return (
                    <div key={msg.id} className="flex justify-center mt-3">
                      <CallEventBubble message={msg} />
                    </div>
                  );
                }

                const displayPic = isMe 
                  ? user?.imageUrl 
                  : (members.find((m) => m.user_id === msg.sender_id)?.profile_pic_url || 
                     (chat?.chat_type === "dm" ? otherMember?.profile_pic_url : null)
                    );
                const parsed = parseMessageContent(msg.content);
                const isChannel = chat?.chat_type === "channel";

                if (isChannel) {
                  return (
                    <motion.div
                      key={msg.id}
                      id={`msg-${msg.id}`}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 240,
                        damping: 18,
                        mass: 0.8
                      }}
                      onMouseDown={(e) => handleMessageHoldStart(msg, e)}
                      onMouseUp={handleMessageHoldEnd}
                      onMouseLeave={handleMessageHoldEnd}
                      onTouchStart={(e) => handleMessageHoldStart(msg, e)}
                      onTouchEnd={handleMessageHoldEnd}
                      onTouchCancel={handleMessageHoldEnd}
                      onContextMenu={(e) => handleContextMenu(e, msg)}
                      onDoubleClick={() => setActiveReactionModalMessage(msg)}
                      className="w-full bg-white/[0.02] border border-white/5 rounded-3xl p-5 shadow-lg shadow-black/10 hover:border-white/10 transition-all text-left flex flex-col gap-3.5 relative group select-none cursor-pointer backdrop-blur-md"
                    >
                      {/* Header: Author info */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div 
                            onClick={() => handleShowUserProfile(msg.sender_id)}
                            className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/30 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            {displayPic ? (
                              <img src={displayPic} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs font-black uppercase text-slate-500 bg-slate-200 dark:bg-black/40">
                                {msg.sender_name?.slice(0, 2) || "U"}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span 
                                onClick={() => handleShowUserProfile(msg.sender_id)}
                                className="font-extrabold text-sm text-slate-900 dark:text-white cursor-pointer hover:text-blue-500 transition-colors"
                              >
                                {msg.sender_name}
                              </span>
                              {msg.sender_id === chat?.created_by && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded-md">
                                  Creator
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                              {new Date(msg.created_at).toLocaleDateString()} at {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>

                        {/* Delete Post control */}
                        {(isMe || isCurrentUserAdmin) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMessage(msg.id);
                            }}
                            className="p-2 rounded-full bg-red-500/5 dark:bg-red-500/10 border border-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete Post"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      {/* Body: Content */}
                      {(() => {
                        const { plainText, imageUrls } = parseImagesFromText(parsed.text);
                        return (
                          <div className="flex flex-col gap-2">
                            {plainText && (
                              <div className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed whitespace-pre-wrap px-1">
                                {renderMessageTextWithLinks(plainText, false)}
                              </div>
                            )}
                            {imageUrls.length > 0 && renderImageMasonry(imageUrls)}
                          </div>
                        );
                      })()}

                      {/* Image Attachment (if any) */}
                      {msg.message_type === "image" && msg.attachment_url && (
                        <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-black/30 max-h-96 flex items-center justify-center cursor-pointer">
                          <img
                            src={msg.attachment_url}
                            alt="Post Media"
                            className="w-full h-full object-contain hover:scale-[1.01] transition-transform"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFullscreenImg(msg.attachment_url);
                            }}
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}

                      {/* Footer: Reactions and Reaction Trigger */}
                      <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/5 pt-3.5 mt-1">
                        <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {/* Reaction Buttons */}
                          {parsed.reactions && parsed.reactions.length > 0 && parsed.reactions.map((reaction, rIdx) => {
                            const hasReacted = reaction.users.some(u => u.user_id === userId);
                            return (
                              <button
                                key={rIdx}
                                onClick={() => handleToggleReaction(msg.id, reaction.emoji)}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                                  hasReacted
                                    ? "bg-blue-500/10 border-blue-500/30 text-[#3b82f6]"
                                    : "bg-slate-50 dark:bg-white/5 border-slate-150 dark:border-white/5 text-slate-500 dark:text-slate-400"
                                }`}
                                title={reaction.users.map(u => u.user_name).join(", ")}
                              >
                                <span>{reaction.emoji}</span>
                                <span className="text-[10px] font-extrabold">{reaction.users.length}</span>
                              </button>
                            );
                          })}

                          {/* Add reaction trigger */}
                          <button
                            onClick={() => setActiveReactionModalMessage(msg)}
                            className="flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 border border-transparent transition-all cursor-pointer"
                            title="Add Reaction"
                          >
                            <Smile size={12} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">React</span>
                          </button>
                        </div>

                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                          Hold/Double-Click to React
                        </span>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={msg.id}
                    id={`msg-${msg.id}`}
                    initial={{ opacity: 0, y: 15, scale: 0.95 }}
                    animate={{ 
                      opacity: 1, 
                      y: 0, 
                      scale: 1,
                      x: swipeMessageId === msg.id ? swipeOffset : 0
                    }}
                    transition={{
                      opacity: { duration: 0.15 },
                      scale: { type: "spring", stiffness: 280, damping: 20 },
                      y: { type: "spring", stiffness: 280, damping: 20 },
                      x: swipeMessageId === msg.id 
                        ? { type: "tween", duration: 0 } 
                        : { type: "spring", stiffness: 350, damping: 22 }
                    }}
                    onMouseDown={(e) => handleMessageHoldStart(msg, e)}
                    onMouseUp={handleMessageHoldEnd}
                    onMouseLeave={handleMessageHoldEnd}
                    onContextMenu={(e) => handleContextMenu(e, msg)}
                    onDoubleClick={() => setActiveReactionModalMessage(msg)}
                    onTouchStart={(e) => {
                      handleMessageHoldStart(msg, e);
                      setTouchStartX(e.touches[0].clientX);
                      setSwipeMessageId(msg.id);
                      setSwipeOffset(0);
                    }}
                    onTouchMove={(e) => {
                      handleMessageHoldEnd();
                      if (touchStartX === null || swipeMessageId !== msg.id) return;
                      const diffX = e.touches[0].clientX - touchStartX;
                      if (diffX < 0) {
                        setSwipeOffset(Math.max(diffX, -80));
                      }
                    }}
                    onTouchEnd={() => {
                      handleMessageHoldEnd();
                      if (swipeMessageId === msg.id && swipeOffset < -50) {
                        setReplyingTo({
                          id: msg.id,
                          sender_name: msg.sender_name || "Someone",
                          content: parsed.text || (msg.message_type === "image" ? "📷 Image" : (msg.message_type === "audio" || msg.message_type === "voice_note") ? "🎤 Voice Note" : "🎨 Sticker"),
                          message_type: msg.message_type,
                        });
                        toast.success("Replying to message ✓");
                      }
                      setTouchStartX(null);
                      setSwipeMessageId(null);
                      setSwipeOffset(0);
                    }}
                    className={`group relative flex items-end gap-3 w-full transition-all ${isMe ? "flex-row-reverse self-end justify-start text-right" : "justify-start text-left"}`}
                  >
                  {/* Sender Avatar */}
                  <div 
                    onClick={() => handleShowUserProfile(msg.sender_id)}
                    className="w-8 h-8 rounded-full overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/30 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    {displayPic ? (
                      <img src={displayPic} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] font-black uppercase text-slate-500 bg-slate-200 dark:bg-black/40">
                        {msg.sender_name?.slice(0, 2) || "U"}
                      </div>
                    )}
                  </div>

                  {/* Bubble & Contents Container */}
                  <div className={`flex flex-col max-w-[70%] ${isMe ? "items-end" : "items-start"}`}>
                    <span className="text-[9px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-wider mb-1 px-1">
                      {isMe ? "You" : msg.sender_name} • {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>

                    {/* REPLY TO PREVIEW ABOVE BUBBLE */}
                    {parsed.replyTo && (
                      <div 
                        onClick={() => {
                          const element = document.getElementById(`msg-${parsed.replyTo?.id}`);
                          if (element) {
                            element.scrollIntoView({ behavior: "smooth", block: "center" });
                            element.classList.add("ring-2", "ring-blue-500/50", "bg-blue-500/5", "scale-102");
                            setTimeout(() => {
                              element.classList.remove("ring-2", "ring-blue-500/50", "bg-blue-500/5", "scale-102");
                            }, 2000);
                          }
                        }}
                        className={`mb-1.5 px-3 py-1.5 rounded-xl text-xs flex flex-col gap-0.5 border cursor-pointer select-none transition-all hover:opacity-85 ${
                          isMe 
                            ? "bg-blue-700/30 border-blue-500/20 text-blue-100" 
                            : "bg-slate-100/80 dark:bg-white/5 border-slate-200/50 dark:border-white/5 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        <div className="flex items-center gap-1 font-bold text-[9px] uppercase tracking-wider text-blue-500 dark:text-blue-400">
                          <CornerUpLeft size={10} />
                          Reply to {parsed.replyTo.sender_name}
                        </div>
                        <div className="truncate max-w-[200px] text-[11px] font-medium opacity-90">
                          {parsed.replyTo.content}
                        </div>
                      </div>
                    )}

                    {/* STICKER BLOCK */}
                    {isSticker && msg.sticker_url ? (
                      <div className="py-1">
                        {DEFAULT_STICKERS.includes(msg.sticker_url) ? (
                          <span className="text-5xl select-none leading-none">{msg.sticker_url}</span>
                        ) : (
                          <img
                            src={msg.sticker_url}
                            alt="Sticker"
                            className="max-w-[100px] h-auto object-contain rounded-xl select-none"
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </div>
                    ) : msg.message_type === "image" && msg.attachment_url ? (
                      /* IMAGE ATTACHMENT BLOCK */
                      <div className={`flex flex-col gap-1.5 ${isMe ? "items-end" : "items-start"}`}>
                        <div
                          onMouseDown={(e) => handlePressStart(e, msg.attachment_url!)}
                          onMouseUp={(e) => handlePressEnd(e)}
                          onTouchStart={(e) => handlePressStart(e, msg.attachment_url!)}
                          onTouchEnd={(e) => handlePressEnd(e)}
                          className={`group/img relative rounded-2xl overflow-hidden p-1 border cursor-pointer ${
                            isMe ? "border-blue-500/30 bg-blue-600/10" : "border-slate-200 dark:border-white/10 bg-white dark:bg-white/5"
                          }`}
                          title="Long-press to save as custom sticker"
                        >
                          <img
                            src={msg.attachment_url}
                            alt="Shared Media"
                            className="max-w-[160px] sm:max-w-[240px] h-auto object-cover rounded-xl transition-transform hover:scale-[1.02]"
                            onClick={(e) => {
                              if (isImageHoldRef.current) {
                                isImageHoldRef.current = false;
                                return;
                              }
                              setFullscreenImg(msg.attachment_url);
                            }}
                            referrerPolicy="no-referrer"
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmStickerUrl(msg.attachment_url!);
                            }}
                            className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors opacity-0 group-hover/img:opacity-100 flex items-center justify-center"
                            title="Save as Sticker"
                          >
                            <Bookmark size={12} />
                          </button>
                        </div>
                        {parsed.text && (
                          <div
                            className={`px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap text-left max-w-[200px] sm:max-w-[280px] ${
                              isMe
                                ? "rounded-[22px] rounded-tr-sm bg-[#3B82F6] text-white shadow-lg shadow-blue-500/10 self-end"
                                : "rounded-[22px] rounded-tl-sm bg-white border border-slate-200 dark:bg-white/[0.03] dark:border-white/5 text-slate-800 dark:text-slate-200 shadow-sm self-start"
                            }`}
                          >
                            {renderMessageTextWithLinks(parsed.text, isMe)}
                          </div>
                        )}
                      </div>
                    ) : (msg.message_type === "audio" || msg.message_type === "voice_note") && msg.attachment_url ? (
                      /* AUDIO ATTACHMENT BLOCK */
                      <div className="flex items-center gap-2.5 p-2 bg-slate-100 dark:bg-[#0D0D0F]/50 border border-slate-200 dark:border-white/10 rounded-2xl min-w-[200px] max-w-full">
                        <span className="text-xl">🎤</span>
                        <audio 
                          controls 
                          src={msg.attachment_url}
                          className="h-9 flex-1"
                          style={{ filter: "invert(0.9) hue-rotate(180deg)" }}
                        />
                        <span className="text-[11px] text-slate-500 dark:text-white/40 font-mono pr-2">
                          {Math.floor((msg.duration_seconds || 0) / 60)}:
                          {String((msg.duration_seconds || 0) % 60).padStart(2, "0")}
                        </span>
                      </div>
                    ) : (
                      /* STANDARD TEXT BUBBLE */
                      (() => {
                        const { plainText, imageUrls } = parseImagesFromText(parsed.text);
                        return (
                          <div className="flex flex-col gap-2">
                            {plainText && (
                              <div
                                className={`px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-left ${
                                  isMe
                                    ? "rounded-[22px] rounded-tr-sm bg-[#3B82F6] text-white shadow-lg shadow-blue-500/10"
                                    : "rounded-[22px] rounded-tl-sm bg-white border border-slate-200 dark:bg-white/[0.03] dark:border-white/5 text-slate-800 dark:text-slate-200 shadow-sm"
                                }`}
                              >
                                {renderMessageTextWithLinks(plainText, isMe)}
                              </div>
                            )}
                            {imageUrls.length > 0 && renderImageMasonry(imageUrls)}
                          </div>
                        );
                      })()
                    )}

                    {/* DYNAMIC EMOJI REACTIONS RENDERED BELOW BUBBLE */}
                    {parsed.reactions && parsed.reactions.length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1.5 ${isMe ? "justify-end" : "justify-start"}`}>
                        {parsed.reactions.map((reaction, rIdx) => {
                          const hasReacted = reaction.users.some(u => u.user_id === userId);
                          return (
                            <button
                              key={rIdx}
                              onClick={() => handleToggleReaction(msg.id, reaction.emoji)}
                              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                                hasReacted
                                  ? "bg-blue-500/10 border-blue-500/30 text-[#3b82f6]"
                                  : "bg-slate-50 dark:bg-white/5 border-slate-150 dark:border-white/5 text-slate-500 dark:text-slate-400"
                              }`}
                              title={reaction.users.map(u => u.user_name).join(", ")}
                            >
                              <span>{reaction.emoji}</span>
                              <span className="text-[10px] font-extrabold">{reaction.users.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* PREMIUM HOVER POPUP CONTROL BAR */}
                  <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                    {/* Reply Icon */}
                    <button
                      onClick={() => {
                        setReplyingTo({
                          id: msg.id,
                          sender_name: msg.sender_name || "Someone",
                          content: parsed.text || (msg.message_type === "image" ? "📷 Image" : (msg.message_type === "audio" || msg.message_type === "voice_note") ? "🎤 Voice Note" : "🎨 Sticker"),
                          message_type: msg.message_type,
                        });
                        toast.success("Replying to message ✓");
                      }}
                      className="p-1.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-white cursor-pointer transition-all"
                      title="Reply"
                    >
                      <CornerUpLeft size={11} />
                    </button>

                    {/* Emoji Reaction Drawer */}
                    <div className="relative group/react">
                      <button
                        className="p-1.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-white cursor-pointer transition-all"
                        title="React"
                      >
                        <Smile size={11} />
                      </button>
                      <div className={`absolute bottom-full mb-1 ${isMe ? "right-0" : "left-0"} hidden group-hover/react:flex items-center gap-1.5 px-2 py-1.5 bg-white dark:bg-[#141416] border border-slate-150 dark:border-white/15 rounded-full shadow-xl z-50 animate-in fade-in slide-in-from-bottom-1 duration-150`}>
                        {["👍", "❤️", "😂", "😮", "😢", "🔥"].map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleToggleReaction(msg.id, emoji)}
                            className="text-base hover:scale-125 active:scale-95 transition-transform cursor-pointer px-0.5"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Admin/Sender Deletion Control */}
                    {(isMe || isCurrentUserAdmin) && (
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="p-1.5 rounded-lg bg-red-500/5 dark:bg-red-500/10 border border-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-500 cursor-pointer transition-all"
                        title="Delete Message"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
          {/* Real-time typing bubble inside the feed list */}
          <AnimatePresence>
            {typingUsers.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 15, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="flex items-end gap-3 self-start justify-start text-left max-w-xs mt-2 ml-1"
              >
                <div className="w-8 h-8 rounded-full border border-white/10 bg-[#3B82F6]/10 flex items-center justify-center text-xs shrink-0 shadow-inner">
                  💬
                </div>
                <div className="relative p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 shadow-xl backdrop-blur-md flex items-center gap-3">
                  <div className="flex gap-1.5 items-center">
                    <span className="w-2 h-2 bg-gradient-to-tr from-[#3B82F6] to-cyan-400 rounded-full animate-bounce shadow-[0_0_8px_rgba(59,130,246,0.8)]" style={{ animationDelay: '0ms', animationDuration: '0.8s' }} />
                    <span className="w-2 h-2 bg-gradient-to-tr from-[#3B82F6] to-cyan-400 rounded-full animate-bounce shadow-[0_0_8px_rgba(59,130,246,0.8)]" style={{ animationDelay: '200ms', animationDuration: '0.8s' }} />
                    <span className="w-2 h-2 bg-gradient-to-tr from-[#3B82F6] to-cyan-400 rounded-full animate-bounce shadow-[0_0_8px_rgba(59,130,246,0.8)]" style={{ animationDelay: '400ms', animationDuration: '0.8s' }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-300">
                    {typingUsers.size === 1 
                      ? [...typingUsers.values()][0] + " is typing..."
                      : [...typingUsers.values()].slice(0, 2).join(", ") + 
                        (typingUsers.size > 2 ? " and others are typing..." : " are typing...")}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Floating Scroll to Bottom Button */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 15 }}
              onClick={scrollToBottom}
              className="absolute bottom-24 right-6 z-40 w-11 h-11 rounded-full bg-gradient-to-tr from-[#3B82F6] to-[#06B6D4] text-white flex items-center justify-center shadow-lg shadow-blue-500/30 border border-white/10 hover:scale-110 active:scale-95 transition-all cursor-pointer"
            >
              <ChevronLeft size={18} className="-rotate-90" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Floating New Messages Pill */}
        <AnimatePresence>
          {showNewMessagePill && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8, y: 15, x: "-50%" }}
              animate={{ opacity: 1, scale: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, scale: 0.8, y: 15, x: "-50%" }}
              onClick={() => {
                scrollToBottom();
                setShowNewMessagePill(false);
              }}
              className="absolute bottom-24 left-1/2 z-40 px-4 py-2 rounded-full bg-blue-600 text-white text-xs font-bold tracking-wide shadow-lg shadow-blue-600/30 border border-white/10 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>New messages</span>
              <ArrowDown size={14} className="animate-bounce" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Input & Action Bar */}
        <motion.div 
          layout
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 180,
            damping: 20,
            mass: 0.9
          }}
          className="p-4 bg-white/80 dark:bg-[#0c0c0e]/80 border-t border-slate-200 dark:border-white/5 shrink-0 relative z-20 backdrop-blur-md"
        >
          <div className="max-w-4xl mx-auto relative space-y-2">
            
            {/* REPLY BANNER */}
            <AnimatePresence>
              {replyingTo && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/10 shadow-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-1.5 h-10 bg-blue-500 rounded-full shrink-0" />
                    <div className="text-left min-w-0">
                      <p className="text-[10px] font-black uppercase text-blue-500 dark:text-blue-400 tracking-wider">
                        Replying to {replyingTo.sender_name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                        {replyingTo.content}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setReplyingTo(null)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-white cursor-pointer transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* QUEUED IMAGE PREVIEW */}
            <AnimatePresence>
              {selectedImagePreview && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/10 shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 shrink-0 bg-slate-100 dark:bg-black/20">
                      <img
                        src={selectedImagePreview}
                        alt="Queued attachment"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-[10px] font-black uppercase text-blue-500 dark:text-blue-400 tracking-wider">
                        Attachment Queued
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                        {selectedImageFile?.name || "Image attachment"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleClearSelectedImage}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-white cursor-pointer transition-colors shrink-0"
                    title="Remove attachment"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-2">
            {/* Image Attachment Button */}
            <div className="relative">
              <button
                disabled={uploadingImage || loading}
                aria-label="Attach image"
                className="p-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 rounded-xl transition-all flex items-center justify-center cursor-pointer relative shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingImage ? (
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                ) : (
                  <ImageIcon size={18} />
                )}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingImage || loading}
                  className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setSelectedImageFile(file);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setSelectedImagePreview(reader.result as string);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </button>
            </div>

            {/* Sticker Button */}
            <button
              onClick={() => !loading && setStickerOpen(!stickerOpen)}
              disabled={loading}
              aria-label="Open stickers"
              className={`p-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-xl transition-all flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                stickerOpen ? "text-blue-500" : "text-slate-600 dark:text-slate-300"
              }`}
            >
              <Smile size={18} />
            </button>

            {/* Recording / Input & Send */}
            {isRecording ? (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-grow flex items-center justify-between bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                  <span className="text-xs font-black uppercase tracking-widest text-red-500 dark:text-red-400">
                    Recording Voice...
                  </span>
                  <span className="text-xs font-mono font-black text-slate-600 dark:text-slate-300 bg-slate-200/50 dark:bg-white/10 px-2 py-0.5 rounded">
                    {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, "0")}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelRecording}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-500/10 transition-all cursor-pointer"
                    title="Cancel Recording"
                  >
                    <Trash2 size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={handleSendVoice}
                    disabled={isUploadingVoice}
                    className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all cursor-pointer shadow-md shadow-red-500/20 active:scale-95 flex items-center justify-center"
                    title="Send Recording"
                  >
                    {isUploadingVoice ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="relative flex-grow min-w-0">
                {/* Typing indicator */}
                <AnimatePresence>
                  {typingUsers.size > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute -top-6 left-2 flex items-center gap-1.5"
                    >
                      <div className="flex gap-0.5">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider whitespace-nowrap">
                        {typingUsers.size === 1 
                          ? [...typingUsers.values()][0] + " is typing..."
                          : [...typingUsers.values()].slice(0, 2).join(", ") + 
                            (typingUsers.size > 2 ? " and others are typing..." : " are typing...")}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* Text input */}
                <input
                  type="text"
                  value={newMessage}
                  disabled={loading || uploadingImage}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!loading && !uploadingImage) {
                        if (selectedImageFile) {
                          handleSendQueuedImage();
                        } else {
                          sendMessage();
                        }
                      }
                    }
                  }}
                  placeholder={loading ? "Connecting securely..." : (selectedImageFile ? "Add a caption..." : "Type message here...")}
                  className="w-full pl-4 pr-12 py-3 bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 rounded-2xl text-sm focus:outline-none focus:border-[#3B82F6]/30 dark:focus:border-[#3B82F6]/30 focus:bg-slate-50 dark:focus:bg-white/[0.04] transition-all disabled:opacity-70 shadow-inner"
                />

                {/* Send / Mic button */}
                {(newMessage.trim() || selectedImageFile) ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!loading && !uploadingImage) {
                        if (selectedImageFile) {
                          handleSendQueuedImage();
                        } else {
                          sendMessage();
                        }
                      }
                    }}
                    disabled={loading || uploadingImage}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 bg-gradient-to-tr from-[#3b82f6] to-[#2563eb] hover:from-[#2563eb] hover:to-[#1d4ed8] active:scale-95 text-white rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploadingImage ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={loading || isUploadingVoice}
                    aria-label="Record voice note"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 bg-slate-200 hover:bg-slate-300 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] text-slate-600 dark:text-slate-300 active:scale-95 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Record Voice Note"
                  >
                    <Mic size={14} />
                  </button>
                )}
              </div>
            )}
            </div>
          </div>
        </motion.div>

        {/* STICKER BOTTOM SHEET */}
        <AnimatePresence>
          {stickerOpen && (
            <div className="absolute bottom-20 left-4 z-50">
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="w-72 bg-white dark:bg-[#141416] p-4 rounded-2xl border border-slate-200 dark:border-white/15 shadow-2xl"
              >
                {/* Header / Tabs */}
                <div className="flex justify-between items-center border-b border-slate-150 dark:border-white/10 pb-2 mb-3">
                  <div className="flex gap-3 text-xs font-bold">
                    <button
                      onClick={() => setStickerTab("stickers")}
                      className={`pb-1 uppercase tracking-wider ${stickerTab === "stickers" ? "text-blue-500 border-b-2 border-blue-500" : "text-slate-400"}`}
                    >
                      Stickers
                    </button>
                    <button
                      onClick={() => setStickerTab("saved")}
                      className={`pb-1 uppercase tracking-wider ${stickerTab === "saved" ? "text-blue-500 border-b-2 border-blue-500" : "text-slate-400"}`}
                    >
                      Saved ({savedStickers.length})
                    </button>
                  </div>
                  <button
                    onClick={() => setStickerOpen(false)}
                    className="p-1 rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>

                {/* Grid */}
                <div className="max-h-48 overflow-y-auto">
                  {stickerTab === "stickers" ? (
                    <div className="grid grid-cols-5 gap-2">
                      {DEFAULT_STICKERS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => sendSticker(emoji)}
                          className="text-3xl p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 active:scale-90 transition-all cursor-pointer flex items-center justify-center"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  ) : savedStickers.length === 0 ? (
                    <div className="py-8 text-center text-[10px] uppercase font-black tracking-widest text-slate-400">
                      No saved stickers yet. Hold an image in chat to save it!
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {savedStickers.map((url, idx) => (
                        <div
                          key={idx}
                          onClick={() => sendSticker(url)}
                          className="relative group w-full aspect-square rounded-xl overflow-hidden bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5 hover:border-blue-500 active:scale-95 transition-all cursor-pointer p-1"
                        >
                          <img
                            src={url}
                            alt="sticker"
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const filtered = savedStickers.filter((s) => s !== url);
                              supabase
                                .from("profiles")
                                .update({ saved_stickers: filtered })
                                .eq("clerk_id", userId)
                                .then(() => {
                                  setSavedStickers(filtered);
                                  toast.success("Removed sticker");
                                });
                            }}
                            className="absolute top-1 right-1 p-0.5 rounded-md bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
                          >
                            <X size={8} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* RIGHT DRAWER: COMMUNITY / DM DETAILS INFO */}
      <AnimatePresence>
        {infoOpen && (
          <>
            {/* Mobile Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInfoOpen(false)}
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[10001]"
            />
            
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed md:relative top-0 right-0 z-[10002] flex flex-col h-full w-[280px] sm:w-[320px] bg-white dark:bg-[#0c0c0e] border-l border-slate-150 dark:border-white/10 overflow-hidden shadow-2xl shrink-0"
            >
            <div className="flex justify-between items-center px-4 py-4 border-b border-slate-150 dark:border-white/10">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                {chat?.chat_type === "dm" ? "Contact Info" : "Community Panel"}
              </h3>
              <button
                onClick={() => setInfoOpen(false)}
                className="p-1 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-grow overflow-y-auto p-5 text-left space-y-6">
              {/* Profile/Cover image */}
              <div className="flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/30 mb-3 shadow">
                  {getChatDisplayPic() ? (
                    <img
                      src={getChatDisplayPic() || ""}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-black uppercase text-slate-500 bg-slate-200 dark:bg-black/40">
                      {getChatDisplayName().slice(0, 2)}
                    </div>
                  )}
                </div>
                <h4 className="font-black text-slate-950 dark:text-white leading-tight">
                  {getChatDisplayName()}
                </h4>
                {chat?.chat_type === "dm" && otherMember?.username && (
                  <p className="text-xs text-blue-500 font-semibold mt-0.5">
                    @{otherMember.username}
                  </p>
                )}
              </div>

              {/* Description / Bio */}
              <div className="bg-slate-50 dark:bg-black/25 p-4 rounded-xl border border-slate-200/50 dark:border-white/5">
                <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">
                  {chat?.chat_type === "dm" ? "About Contact" : "Description"}
                </h5>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {chat?.chat_type === "dm"
                    ? otherMember?.bio || "No bio set by contact."
                    : chat?.description || "No description set."}
                </p>
              </div>

              {/* Group/Channel specific items */}
              {(chat?.chat_type === "group" || chat?.chat_type === "channel") && (
                <>
                  {/* Edit Details (Admin only) */}
                  {isCurrentUserAdmin && (
                    <div className="space-y-3 p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                      <h5 className="text-[10px] font-black uppercase text-blue-500 tracking-wider">
                        Admin Controls
                      </h5>
                      <button
                        onClick={() => {
                          const newName = window.prompt("Change Name", chat.name);
                          if (newName && newName !== chat.name) {
                            supabase.from("chats").update({ name: newName }).eq("id", chatId).then(() => {
                              setChat(prev => prev ? { ...prev, name: newName } : null);
                              toast.success("Name updated!");
                            });
                          }
                        }}
                        className="w-full py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 transition-all cursor-pointer"
                      >
                        Change Name
                      </button>
                      <button
                        onClick={() => {
                          const newDesc = window.prompt("Change Description", chat.description || "");
                          if (newDesc !== null && newDesc !== chat.description) {
                            supabase.from("chats").update({ description: newDesc }).eq("id", chatId).then(() => {
                              setChat(prev => prev ? { ...prev, description: newDesc } : null);
                              toast.success("Description updated!");
                            });
                          }
                        }}
                        className="w-full py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 transition-all cursor-pointer"
                      >
                        Edit Description
                      </button>
                    </div>
                  )}

                  {/* Share Invite Code */}
                  {chat.invite_code && (
                    <div className="space-y-2">
                      <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        Invite Link
                      </h5>
                      <div className="flex gap-2">
                        <div className="flex-grow px-3 py-2 bg-slate-50 dark:bg-black/30 border border-slate-150 dark:border-white/15 rounded-xl text-xs text-slate-500 dark:text-slate-400 font-medium truncate select-all flex items-center">
                          {window.location.origin}/join/{chat.invite_code}
                        </div>
                        <button
                          onClick={copyInviteLink}
                          className="px-3 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-xs uppercase font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Members list */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        Members List ({members.length})
                      </h5>
                      {isCurrentUserAdmin && (
                        <button
                          onClick={() => setAddMemberModalOpen(true)}
                          className="px-2 py-1 bg-[#3b82f6] hover:bg-blue-600 text-white text-[9px] uppercase font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          <Plus size={10} />
                          Add
                        </button>
                      )}
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {members.map((m) => (
                        <div key={m.id} 
                          onClick={() => handleShowUserProfile(m.user_id)}
                          className="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-all"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-100 shrink-0 border border-slate-200 dark:border-white/10">
                              {m.profile_pic_url ? (
                                <img src={m.profile_pic_url} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[8px] font-black text-slate-500 uppercase bg-slate-200">
                                  {m.user_name?.slice(0, 2) || "U"}
                                </div>
                              )}
                            </div>
                            <span className="text-xs text-slate-900 dark:text-white font-semibold truncate">
                              {m.user_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[8px] uppercase font-black tracking-wider px-1.5 py-0.5 rounded-full ${
                              m.role === "admin" ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-slate-100 dark:bg-white/5 text-slate-400"
                            }`}>
                              {m.role}
                            </span>
                            {isCurrentUserAdmin && m.user_id !== userId && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleToggleMemberRole(m.user_id, m.role)}
                                  className="px-1 py-0.5 text-[7px] font-black uppercase border border-blue-500/10 hover:border-blue-500/25 bg-blue-500/5 hover:bg-blue-500/10 text-[#3b82f6] rounded transition-all cursor-pointer"
                                  title={`Toggle role to ${m.role === 'admin' ? 'member' : 'admin'}`}
                                >
                                  Role
                                </button>
                                <button
                                  onClick={() => handleRemoveMember(m.user_id)}
                                  className="p-1 border border-red-500/10 hover:border-red-500/25 bg-red-500/5 hover:bg-red-500/10 text-red-500 rounded transition-all cursor-pointer"
                                  title="Remove Member"
                                >
                                  <X size={9} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Leaving / Deletion operations */}
                  <div className="pt-4 border-t border-slate-150 dark:border-white/10 space-y-2">
                  {/* Toggle Admin Controls (only for creators/admins) */}
                  {isCurrentUserAdmin && (
                    <button
                      onClick={async () => {
                        const newName = window.prompt("Rename Channel", chat.name || "");
                        if (newName && newName !== chat.name) {
                          const { error } = await supabase.from("chats").update({ name: newName }).eq("id", chatId);
                          if (!error) {
                            setChat(prev => prev ? { ...prev, name: newName } : null);
                            toast.success("Channel renamed ✓");
                          }
                        }
                      }}
                      className="w-full py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-all cursor-pointer mb-2"
                    >
                      Settings
                    </button>
                  )}
                  
                  <button
                    onClick={leaveGroup}
                      className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/25 text-red-500 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-red-500/20"
                    >
                      <LogOut size={13} />
                      Leave Community
                    </button>

                    {chat.created_by === userId && (
                      <button
                        onClick={deleteGroup}
                        className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow"
                      >
                        <Trash2 size={13} />
                        Delete Community
                      </button>
                    )}
                  </div>
                </>
              )}

              {chat?.chat_type === "dm" && (
                <div className="pt-4 border-t border-slate-150 dark:border-white/10 space-y-2 mt-6">
                  <button
                    onClick={handleDeleteDM}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow"
                  >
                    <Trash2 size={13} />
                    Delete Chat
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>


      {/* READ-ONLY USER PROFILE MODAL */}
      <AnimatePresence>
        {userProfileModal && (
          <div className="fixed inset-0 z-[10010] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setUserProfileModal(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white dark:bg-[#141416] rounded-3xl border border-slate-150 dark:border-white/10 p-6 shadow-2xl z-10 text-center"
            >
              <button
                onClick={() => setUserProfileModal(null)}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 cursor-pointer"
              >
                <X size={14} />
              </button>

              <div className="relative mx-auto w-20 h-20 mb-4 shrink-0">
                <div className="w-full h-full rounded-full overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/30">
                  {userProfileModal.profile_pic_url || userProfileModal.image_url ? (
                    <img
                      src={userProfileModal.profile_pic_url || userProfileModal.image_url || ""}
                      alt="Contact"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl font-black uppercase text-slate-500 bg-slate-200">
                      {userProfileModal.full_name?.slice(0, 2) || "U"}
                    </div>
                  )}
                </div>
                {/* Check if user is online, assuming last_login_at exists or using alternative approach, let's use isUserOnline with fallback to just clerk_id since last_login_at might not exist in Profile interface but works with context */}
                {isUserOnline(userProfileModal.clerk_id) && (
                  <span className="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 border-[3px] border-white dark:border-[#0c0c0e] rounded-full shadow-[0_0_10px_rgba(16,185,129,0.8)] z-10 flex items-center justify-center">
                    <span className="absolute w-full h-full bg-emerald-400 rounded-full animate-ping opacity-75"></span>
                  </span>
                )}
              </div>

              <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">
                {userProfileModal.full_name || userProfileModal.username}
              </h3>
              {userProfileModal.username && (
                <p className="text-xs text-blue-500 font-extrabold uppercase tracking-widest mb-4">
                  @{userProfileModal.username}
                </p>
              )}

              <div className="bg-slate-50 dark:bg-black/30 p-4 rounded-2xl border border-slate-150 dark:border-white/5 text-left">
                <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">
                  Bio
                </h5>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {userProfileModal.bio || "No bio written yet."}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADD MEMBER MODAL */}
      <AnimatePresence>
        {addMemberModalOpen && (
          <div className="fixed inset-0 z-[10007] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAddMemberModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-[#101014] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col max-h-[80vh] overflow-hidden z-10"
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-white/5">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Add Members
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-white/40 uppercase font-bold tracking-widest mt-0.5">
                    Add users to "{chat?.name}"
                  </p>
                </div>
                <button
                  onClick={() => setAddMemberModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-white cursor-pointer transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mb-4 relative">
                <input
                  type="text"
                  placeholder="Search by username or name..."
                  value={profileSearchQuery}
                  onChange={(e) => setProfileSearchQuery(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-150 dark:border-white/15 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex-grow overflow-y-auto space-y-2 pr-1">
                {loadingProfiles ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                      Searching profiles...
                    </p>
                  </div>
                ) : allProfiles.filter(p => 
                  (p.username || "").toLowerCase().includes(profileSearchQuery.toLowerCase()) ||
                  (p.full_name || "").toLowerCase().includes(profileSearchQuery.toLowerCase())
                ).length === 0 ? (
                  <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-xs">
                    No addable users found.
                  </div>
                ) : (
                  allProfiles
                    .filter(p => 
                      (p.username || "").toLowerCase().includes(profileSearchQuery.toLowerCase()) ||
                      (p.full_name || "").toLowerCase().includes(profileSearchQuery.toLowerCase())
                    )
                    .map((p) => {
                      const displayName = p.full_name || p.username || "User";
                      return (
                        <div
                          key={p.clerk_id}
                          className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-white/5"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 shrink-0">
                              {p.profile_pic_url || p.image_url ? (
                                <img src={p.profile_pic_url || p.image_url} alt="Profile" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] font-black uppercase text-slate-500 bg-slate-200">
                                  {displayName.slice(0, 2)}
                                </div>
                              )}
                            </div>
                            <div className="text-left min-w-0">
                              <p className="text-xs text-slate-900 dark:text-white font-bold truncate">
                                {displayName}
                              </p>
                              <p className="text-[9px] text-slate-400 font-medium truncate">
                                @{p.username || "username"}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleAddMemberToGroup(p)}
                            className="px-3 py-1.5 bg-[#3b82f6] hover:bg-blue-600 text-white text-[10px] uppercase font-extrabold rounded-lg transition-all cursor-pointer shadow-sm hover:shadow active:scale-95 shrink-0"
                          >
                            Add
                          </button>
                        </div>
                      );
                    })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRM ADD TO STICKERS MODAL */}
      <AnimatePresence>
        {confirmStickerUrl && (
          <div className="fixed inset-0 z-[20050] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmStickerUrl(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md cursor-pointer"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-[#1c1c1e] rounded-3xl border border-slate-100 dark:border-white/10 p-6 shadow-2xl z-10 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#0066ff]/10 text-[#0066ff] flex items-center justify-center mx-auto mb-4 border border-[#0066ff]/20">
                <Bookmark size={24} />
              </div>
              <h3 className="text-base font-black text-slate-900 dark:text-white mb-2 font-display">
                Add to Stickers?
              </h3>
              <p className="text-xs text-slate-500 dark:text-white/60 leading-relaxed mb-6">
                Do you want to save this image to your custom stickers collection for quick access in chats?
              </p>

              <div className="w-32 h-32 rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 mx-auto mb-6 bg-slate-100 dark:bg-black/30 shadow-md">
                <img
                  src={confirmStickerUrl}
                  alt="Sticker Preview"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmStickerUrl(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    saveSticker(confirmStickerUrl);
                    setConfirmStickerUrl(null);
                  }}
                  className="flex-1 py-3 bg-[#0066ff] hover:bg-blue-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-blue-500/25"
                >
                  Save Sticker
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FULLSCREEN IMAGE MODAL VIEWER */}
      <AnimatePresence>
        {fullscreenImg && (
          <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/95 p-4">
            <button
              onClick={() => setFullscreenImg(null)}
              className="absolute top-6 right-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
            <img
              src={fullscreenImg}
              alt="Expanded Asset"
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </AnimatePresence>

      {/* FLOAT REACTION MODAL (HOLD TO REACT) */}
      <AnimatePresence>
        {activeReactionModalMessage && (
          <div id="reaction-overlay-container" className="fixed inset-0 z-[20000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveReactionModalMessage(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              id="reaction-overlay-card"
              className="relative w-full max-w-sm bg-white dark:bg-[#1c1c1e] rounded-3xl border border-slate-100 dark:border-white/10 p-6 shadow-2xl z-10 text-center"
            >
              <h3 className="text-xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-4">
                React with Emotion
              </h3>
              
              <div className="flex justify-center gap-3 mb-6">
                {["👍", "❤️", "😂", "😮", "😢", "🔥"].map((emoji) => {
                  const parsed = parseMessageContent(activeReactionModalMessage.content);
                  const reaction = parsed.reactions.find(r => r.emoji === emoji);
                  const hasReacted = reaction?.users.some(u => u.user_id === userId);

                  return (
                    <button
                      key={emoji}
                      id={`btn-react-${emoji}`}
                      onClick={() => {
                        handleToggleReaction(activeReactionModalMessage.id, emoji);
                        setActiveReactionModalMessage(null);
                      }}
                      className={`w-12 h-12 flex items-center justify-center rounded-2xl text-2xl transition-all hover:scale-125 active:scale-95 cursor-pointer ${
                        hasReacted 
                          ? "bg-blue-500/10 border-2 border-blue-500" 
                          : "bg-slate-100 dark:bg-white/5 border border-transparent"
                      }`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-black/20 rounded-2xl border border-slate-100 dark:border-white/5 text-left text-xs mb-4 max-h-24 overflow-y-auto">
                <span className="font-bold text-slate-500 dark:text-[#a1a1a1] block mb-1">Message Preview:</span>
                <p className="text-slate-800 dark:text-slate-200 line-clamp-2">
                  {parseMessageContent(activeReactionModalMessage.content).text || "[Attachment]"}
                </p>
              </div>

              {(activeReactionModalMessage.sender_id === userId || isCurrentUserAdmin) && (
                <button
                  id="btn-delete-message-modal"
                  onClick={() => {
                    const msgId = activeReactionModalMessage.id;
                    setActiveReactionModalMessage(null);
                    handleDeleteMessage(msgId);
                  }}
                  className="w-full py-2.5 mb-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-rose-500/10 dark:border-rose-500/20 animate-none"
                >
                  <Trash2 size={14} />
                  Delete Message
                </button>
              )}

              <button
                id="btn-reaction-cancel"
                onClick={() => setActiveReactionModalMessage(null)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FLOATING LIQUID-GLASS CONTEXT MENU */}
      <AnimatePresence>
        {contextMenuMsg && contextMenuPos && (
          <>
            {/* Backdrop overlay to close context menu on outer click */}
            <div 
              className="fixed inset-0 z-[19000] cursor-default bg-black/10 backdrop-blur-[1px]"
              onMouseDown={() => {
                setContextMenuMsg(null);
                setContextMenuPos(null);
              }}
              onTouchStart={() => {
                setContextMenuMsg(null);
                setContextMenuPos(null);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenuMsg(null);
                setContextMenuPos(null);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              style={{
                top: `${Math.min(contextMenuPos.y, window.innerHeight - 300)}px`,
                left: `${Math.min(contextMenuPos.x, window.innerWidth - 200)}px`,
              }}
              className="fixed z-[20000] w-48 rounded-2xl bg-black/85 border border-white/10 p-1.5 shadow-2xl backdrop-blur-xl flex flex-col gap-0.5"
            >
              {/* Emojis bar inside the context menu for quick reacting */}
              <div className="flex justify-between items-center px-2 py-1.5 border-b border-white/5 gap-1">
                {["👍", "❤️", "😂", "🔥", "😢"].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      handleToggleReaction(contextMenuMsg.id, emoji);
                      setContextMenuMsg(null);
                      setContextMenuPos(null);
                    }}
                    className="text-lg hover:scale-130 active:scale-95 transition-transform p-0.5 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Reply Option */}
              <button
                onClick={() => {
                  const parsed = parseMessageContent(contextMenuMsg.content);
                  setReplyingTo({
                    id: contextMenuMsg.id,
                    sender_name: contextMenuMsg.sender_name || "Someone",
                    content: parsed.text || (contextMenuMsg.message_type === "image" ? "📷 Image" : (contextMenuMsg.message_type === "audio" || contextMenuMsg.message_type === "voice_note") ? "🎤 Voice Note" : "🎨 Sticker"),
                    message_type: contextMenuMsg.message_type,
                  });
                  toast.success("Replying to message ✓");
                  setContextMenuMsg(null);
                  setContextMenuPos(null);
                }}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
              >
                <CornerUpLeft size={13} className="text-[#3B82F6]" />
                Reply to Message
              </button>

              {/* Copy Option */}
              <button
                onClick={() => {
                  const parsed = parseMessageContent(contextMenuMsg.content);
                  const textToCopy = parsed.text || contextMenuMsg.attachment_url || "";
                  if (textToCopy) {
                    navigator.clipboard.writeText(textToCopy);
                    toast.success("Copied to clipboard!");
                  } else {
                    toast.error("Nothing to copy!");
                  }
                  setContextMenuMsg(null);
                  setContextMenuPos(null);
                }}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
              >
                <Copy size={13} className="text-[#06B6D4]" />
                Copy Content
              </button>

              {/* Delete Option if applicable */}
              {(contextMenuMsg.sender_id === userId || isCurrentUserAdmin) && (
                <button
                  onClick={() => {
                    const idToDelete = contextMenuMsg.id;
                    setContextMenuMsg(null);
                    setContextMenuPos(null);
                    handleDeleteMessage(idToDelete);
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Trash2 size={13} />
                  Delete Message
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
