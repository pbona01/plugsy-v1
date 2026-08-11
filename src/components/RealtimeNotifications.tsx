import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth, useUser } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import { Film, Zap, MessageSquare, Phone } from 'lucide-react';
import {
  getSupportChatRows,
  getUnreadSupportMessageCount,
} from '../services/chatService';
import { isSupportChat } from '../utils/supportChatMessages';

function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = "sine";
    // Double tone chime (D5 then A5)
    osc.frequency.setValueAtTime(587.33, audioContext.currentTime); // D5
    osc.frequency.setValueAtTime(880, audioContext.currentTime + 0.12); // A5
    
    gain.gain.setValueAtTime(0.12, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start();
    osc.stop(audioContext.currentTime + 0.35);
  } catch (err) {
    // blocked by browser policy
  }
}

export default function RealtimeNotifications() {
  const { userId } = useAuth();
  const { user } = useUser();
  const isSubscribed = React.useRef(false);

  useEffect(() => {
    if (!userId) return;

    const uniqueSuffix = Math.random().toString(36).slice(2, 9);
    const isUserAdmin = user?.publicMetadata?.role === 'admin';
    const handledMessageIds = new Set<string>();
    
    // Proactive re-fetch of unread message counts upon mount or window focus
    const triggerUnreadCountRefresh = async () => {
      if (!userId) return;
      try {
        const count = await getUnreadSupportMessageCount(userId);
        localStorage.setItem("chat_unread_count", String(count));
        window.dispatchEvent(new CustomEvent('unread-count-changed', { detail: count }));
      } catch {
        console.error("[RealtimeNotifications] unread refresh failed");
      }
    };

    triggerUnreadCountRefresh();
    window.addEventListener('focus', triggerUnreadCountRefresh);
    // Broadcast events and focus handle the normal path. This is only a
    // visibility-aware recovery check, not a per-user database poll.
    const unreadRefreshInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") void triggerUnreadCountRefresh();
    }, 5 * 60_000);

    // Channel 1: Portfolio Reactions
    const reactChannel = supabase
      .channel('vp_portfolio_reactions_' + uniqueSuffix)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vp_portfolio_views' }, 
        (payload) => {
           toast(
            <div className="flex items-center gap-3">
              <Zap className="text-yellow-500" size={20} />
              <div>
                <p className="font-bold text-sm">New Reaction! 🔥</p>
                <p className="text-xs text-gray-500">Someone just reacted to your portfolio.</p>
              </div>
            </div>,
            {
               className: "bg-white/70 dark:bg-[#0D0D0F]/70 backdrop-blur-xl border border-white/10 text-slate-900 dark:text-white rounded-2xl shadow-2xl p-4",
            }
          );
        }
      )
      .subscribe();

    // Channel 2: CapCut Logins (orders table)
    const orderChannel = supabase
      .channel('orders_updates_' + uniqueSuffix)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new && payload.new.status === 'completed') {
             toast(
              <div className="flex items-center gap-3">
                <Film className="text-brand-accent" size={20} />
                <div>
                  <p className="font-bold text-sm">Access Ready! 🎬</p>
                  <p className="text-xs text-gray-500">Your premium login is active.</p>
                </div>
              </div>,
              {
                 className: "bg-white/70 dark:bg-[#0D0D0F]/70 backdrop-blur-xl border border-white/10 text-slate-900 dark:text-white rounded-2xl shadow-2xl p-4",
              }
             );
          }
        }
      )
      .subscribe();

    // Channel 3: Real-time Messages & Chat Notifications
    const handleNewMessageReceived = async (newMsg: any) => {
      if (!newMsg) return;
      const messageId = String(newMsg.id || "");
      if (messageId && handledMessageIds.has(messageId)) return;
      if (messageId) {
        handledMessageIds.add(messageId);
        window.setTimeout(() => handledMessageIds.delete(messageId), 15000);
      }
      
      // Global real-time call alert notification
      if (newMsg.message_type === "call_event" && newMsg.sender_id !== userId && newMsg.content?.includes("started")) {
        try {
          const { data: membership } = await supabase
            .from("chat_members")
            .select("id")
            .eq("chat_id", newMsg.chat_id)
            .eq("user_id", userId)
            .maybeSingle();

          if (membership) {
            playNotificationSound();
            toast(
              (t) => (
                <div 
                  className="flex items-center justify-between gap-4 w-full cursor-pointer text-left"
                  onClick={() => {
                    toast.dismiss(t.id);
                    window.location.href = `/chat/${newMsg.chat_id}`;
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-green-500/10 p-2.5 rounded-full animate-bounce shrink-0 border border-green-500/20">
                      <Phone className="text-green-500" size={18} />
                    </div>
                    <div>
                      <p className="font-extrabold text-[10px] uppercase tracking-wider text-green-500">Incoming Call 📞</p>
                      <p className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">
                        {newMsg.sender_name || "Someone"}
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-[#a1a1a1]">
                        Tap to answer on secure line
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.dismiss(t.id);
                      window.location.href = `/chat/${newMsg.chat_id}`;
                    }}
                    className="shrink-0 px-3.5 py-1.5 bg-green-500 hover:bg-green-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md shadow-green-500/10 cursor-pointer"
                  >
                    Answer
                  </button>
                </div>
              ),
              {
                duration: 15000,
                className: "bg-white/95 dark:bg-[#0c1317]/95 backdrop-blur-xl border border-green-500/20 text-slate-900 dark:text-white rounded-2xl shadow-2xl p-4 w-[380px] max-w-full",
              }
            );
            return;
          }
        } catch {
          console.error("[RealtimeNotifications] call event lookup failed");
        }
      }

      const messageText = newMsg.message || newMsg.content || (newMsg.audio_url ? "🎤 Voice Note" : (newMsg.attachment_url ? "📷 Attachment" : ""));
      const currentPath = window.location.pathname;

      if (isUserAdmin) {
        if (newMsg.sender_role === 'user' && !currentPath.startsWith('/admin/chats')) {
          const messageOwnerUserId = String(newMsg.user_id || '');
          const supportHref = newMsg.chat_id
            ? `/admin/chats?chat_id=${encodeURIComponent(newMsg.chat_id)}`
            : messageOwnerUserId.startsWith('user_')
              ? `/admin/chats?user_id=${encodeURIComponent(messageOwnerUserId)}`
              : '/admin/chats';
          playNotificationSound();
          toast(
            (t) => (
              <div 
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => {
                  toast.dismiss(t.id);
                  window.location.href = supportHref;
                }}
              >
                <div className="bg-brand-accent/20 p-2 rounded-xl">
                  <MessageSquare className="text-brand-accent" size={20} />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900 dark:text-white">New Message from Client 💬</p>
                  <p className="text-xs text-gray-500 dark:text-[#a1a1a1] line-clamp-1">
                    <span className="font-semibold text-slate-700 dark:text-white/80">{newMsg.sender_name || "Customer"}:</span>{" "}
                    {messageText}
                  </p>
                </div>
              </div>
            ),
            {
              duration: 6000,
              className: "bg-white/90 dark:bg-[#0D0D0F]/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-2xl shadow-2xl p-4",
            }
          );
        }
      } else {
        if (!newMsg.chat_id) {
          triggerUnreadCountRefresh();
          return;
        }

        let isForThisUser = false;
        try {
          const { data: chatData, error: chatError } = await supabase
            .from('chats')
            .select('id, user_id, chat_type')
            .eq('id', newMsg.chat_id)
            .maybeSingle();
          if (chatError || !chatData) throw new Error("CHAT_LOOKUP_FAILED");

          if (isSupportChat(chatData)) {
            const supportChats = await getSupportChatRows(userId);
            isForThisUser =
              supportChats.some((chat) => chat.id === newMsg.chat_id) &&
              chatData.user_id === userId &&
              newMsg.user_id === userId;
          } else {
            const { data: membership, error: membershipError } = await supabase
              .from('chat_members')
              .select('id')
              .eq('chat_id', newMsg.chat_id)
              .eq('user_id', userId)
              .maybeSingle();
            if (membershipError) throw new Error("CHAT_MEMBERSHIP_LOOKUP_FAILED");
            isForThisUser = Boolean(membership);
          }
        } catch {
          console.error("[RealtimeNotifications] support chat resolution failed");
        }

        if (isForThisUser && newMsg.sender_role !== 'user' && !currentPath.startsWith('/dashboard/messages') && !currentPath.startsWith('/chat')) {
          playNotificationSound();
          toast(
            (t) => (
              <div 
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => {
                  toast.dismiss(t.id);
                  window.location.href = "/dashboard/messages";
                }}
              >
                <div className="bg-[#3b82f6]/20 p-2 rounded-xl">
                  <MessageSquare className="text-[#3b82f6]" size={20} />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900 dark:text-white">New Message from Plugsy 💬</p>
                  <p className="text-xs text-gray-500 dark:text-[#a1a1a1] line-clamp-1">
                    <span className="font-semibold text-slate-700 dark:text-white/80">{newMsg.sender_name || "Support"}:</span>{" "}
                    {messageText}
                  </p>
                </div>
              </div>
            ),
            {
              duration: 6000,
              className: "bg-white/90 dark:bg-[#0D0D0F]/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-2xl shadow-2xl p-4",
            }
          );
        }
      }
    };

    const chatMsgChannel = supabase
      // This topic must match the sender's `user-events-${userId}` target.
      .channel('user-events-' + userId);

    if (!isSubscribed.current) {
      chatMsgChannel
        .on(
          'broadcast',
          { event: 'new_message' },
          (payload) => {
            handleNewMessageReceived(payload.payload);
            triggerUnreadCountRefresh();
          }
        )
        .on(
          'broadcast',
          { event: 'new_unread' },
          () => {
            console.log("[RealtimeNotifications] Received new_unread broadcast. Refreshing unread counts...");
            triggerUnreadCountRefresh();
          }
        )
        .subscribe();
      
      isSubscribed.current = true;
    }

    let supportMessageChannel: any = null;
    let supportSubscriptionCancelled = false;
    if (!isUserAdmin) {
      getSupportChatRows(userId)
        .then((supportChats) => {
          if (supportSubscriptionCancelled || supportChats.length === 0) return;
          supportMessageChannel = supabase.channel(
            `support-message-notifications-${userId}-${uniqueSuffix}`,
          );
          supportChats.forEach((supportChat) => {
            supportMessageChannel = supportMessageChannel.on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `chat_id=eq.${supportChat.id}`,
              },
              (payload) => {
                handleNewMessageReceived(payload.new);
                triggerUnreadCountRefresh();
              },
            );
          });
          supportMessageChannel.subscribe();
        })
        .catch(() => {
          console.error("[RealtimeNotifications] support subscription failed");
        });
    }

    // Setup Admin-only broadcast channel if user is admin
    let adminChannel: any = null;
    if (isUserAdmin) {
      adminChannel = supabase
        .channel('admin-broadcast')
        .on(
          'broadcast',
          { event: 'new_message' },
          (payload) => {
            handleNewMessageReceived(payload.payload);
            triggerUnreadCountRefresh();
          }
        )
        .subscribe();
    }

    return () => {
      supportSubscriptionCancelled = true;
      window.clearInterval(unreadRefreshInterval);
      window.removeEventListener('focus', triggerUnreadCountRefresh);
      supabase.removeChannel(reactChannel);
      supabase.removeChannel(orderChannel);
      supabase.removeChannel(chatMsgChannel);
      if (adminChannel) {
        supabase.removeChannel(adminChannel);
      }
      if (supportMessageChannel) {
        supabase.removeChannel(supportMessageChannel);
      }
      isSubscribed.current = false;
    };
  }, [userId, user]);

  return null;
}
