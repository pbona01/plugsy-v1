import { useState, useEffect } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { supabase } from "../lib/supabase";

export function useUnreadMessages() {
  const { userId } = useAuth();
  const { user } = useUser();
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

    const userEmail = user?.primaryEmailAddress?.emailAddress;

    const fetchUnreadCount = async () => {
      let query = supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("read_by_user", false)
        .neq("sender_role", "user");

      if (userEmail) {
        query = query.or(`user_id.eq.${userId},user_email.eq.${userEmail}`);
      } else {
        query = query.eq("user_id", userId);
      }

      const { count, error } = await query;
      if (!error && count !== null) {
        setUnreadCount(count);
        localStorage.setItem("chat_unread_count", String(count));
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
  }, [userId, user]);

  return { unreadCount, setUnreadCount };
}
