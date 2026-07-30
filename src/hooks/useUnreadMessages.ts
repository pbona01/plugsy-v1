import { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { getUnreadSupportMessageCount } from "../services/chatService";

export function useUnreadMessages() {
  const { userId } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(() => {
    const cached = localStorage.getItem("chat_unread_count");
    return cached ? parseInt(cached, 10) : 0;
  });

  useEffect(() => {
    // Update the App Badge
    if ('setAppBadge' in navigator) {
      if (unreadCount > 0) {
        (navigator as any).setAppBadge(unreadCount).catch((err: any) => console.error("Error setting badge:", err));
      } else {
        (navigator as any).clearAppBadge().catch((err: any) => console.error("Error clearing badge:", err));
      }
    }
  }, [unreadCount]);

  useEffect(() => {
    if (!userId) return;

    const fetchUnreadCount = async () => {
      try {
        const count = await getUnreadSupportMessageCount(userId);
        setUnreadCount(count);
        localStorage.setItem("chat_unread_count", String(count));
      } catch {
        console.error("Failed to refresh support unread count");
      }
    };

    fetchUnreadCount();

    // Listen to custom event from RealtimeNotifications to update count immediately
    const handleUnreadChanged = (e: Event) => {
      const customEvent = e as CustomEvent<number>;
      if (typeof customEvent.detail === 'number') {
        setUnreadCount(customEvent.detail);
      } else {
        fetchUnreadCount();
      }
    };

    window.addEventListener('unread-count-changed', handleUnreadChanged);

    return () => {
      window.removeEventListener('unread-count-changed', handleUnreadChanged);
    };
  }, [userId]);

  return { unreadCount, setUnreadCount };
}
