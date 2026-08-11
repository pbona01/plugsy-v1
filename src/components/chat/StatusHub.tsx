import React, { useState, useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { supabase } from "../../lib/supabase";
import { compressAndUpload } from "../../utils/uploadMedia";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, Camera, Pencil, X, Trash2, Eye, Loader2, 
  ChevronLeft, ChevronRight, Sparkles, Smile, Clock, User, Send
} from "lucide-react";
import toast from "react-hot-toast";
import { Status, StatusView } from "../../types";

const BG_PRESETS = [
  "#1e293b", // slate
  "#7f1d1d", // deep red
  "#0a0f2e", // navy
  "#0f1a0f", // forest
  "#3b0a45", // plum
];
const STATUS_CONTACT_LIMIT = 500;
const STATUS_PAGE_LIMIT = 200;
const STATUS_VIEW_LIMIT = 200;

interface StatusHubProps {
  onBackToChats?: () => void;
  onProfileClick?: (userId: string) => void;
}

export default function StatusHub({ onBackToChats, onProfileClick }: StatusHubProps) {
  const { userId } = useAuth();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [myStatuses, setMyStatuses] = useState<Status[]>([]);
  const [groupedStatuses, setGroupedStatuses] = useState<Record<string, Status[]>>({});
  const [viewedStatusIds, setViewedStatusIds] = useState<Set<string>>(new Set());

  // Navigation / Modal States
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [textComposerOpen, setTextComposerOpen] = useState(false);
  const [photoComposerOpen, setPhotoComposerOpen] = useState(false);

  // Text Composer Fields
  const [statusText, setStatusText] = useState("");
  const [selectedBgIndex, setSelectedBgIndex] = useState(0);

  // Photo Composer Fields
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Story Viewer States
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [viewerStatuses, setViewerStatuses] = useState<Status[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerProgress, setViewerProgress] = useState(0);
  const [viewerPaused, setViewerPaused] = useState(false);
  const [storyViewsList, setStoryViewsList] = useState<(StatusView & { viewerName?: string; viewerPic?: string })[]>([]);
  const [viewsListExpanded, setViewsListExpanded] = useState(false);
  const [loadingViews, setLoadingViews] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const sendQuickReply = async (emojiOrText: string) => {
    if (!userId || !user || !viewerStatuses[viewerIndex] || sendingReply) return;
    if (viewerStatuses[viewerIndex].user_id === userId) {
      toast.error("You cannot react to your own status update");
      return;
    }
    setSendingReply(true);
    try {
      const activeStatus = viewerStatuses[viewerIndex];
      const otherUserId = activeStatus.user_id;
      
      // 1. Check if direct chat already exists (logic from ChatHub)
      const { data: myMemberships } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", userId);

      const existingChatIds = myMemberships?.map((m) => m.chat_id) || [];
      let chatId = null;

      if (existingChatIds.length > 0) {
        const { data: dmChats } = await supabase
          .from("chats")
          .select("id")
          .in("id", existingChatIds)
          .eq("chat_type", "dm");

        const dmChatIds = dmChats?.map((c) => c.id) || [];

        if (dmChatIds.length > 0) {
          const { data: mutualChat } = await supabase
            .from("chat_members")
            .select("chat_id")
            .in("chat_id", dmChatIds)
            .eq("user_id", otherUserId)
            .limit(1);

          if (mutualChat && mutualChat.length > 0) {
            chatId = mutualChat[0].chat_id;
          }
        }
      }

      if (!chatId) {
        // Create new DM chat
        const { data: newChat, error: chatErr } = await supabase
          .from("chats")
          .insert({ chat_type: "dm" })
          .select()
          .single();

        if (chatErr) throw chatErr;
        chatId = newChat.id;

        // Insert both members
        const currentFullName = user.fullName || user.username || "User";
        const otherFullName = activeStatus.user_name || "User";
        const currentEmail = user.primaryEmailAddress?.emailAddress || "";

        const { error: memErr } = await supabase.from("chat_members").insert([
          {
            chat_id: chatId,
            user_id: userId,
            user_email: currentEmail,
            user_name: currentFullName,
            role: "member",
          },
          {
            chat_id: chatId,
            user_id: otherUserId,
            user_email: "",
            user_name: otherFullName,
            role: "member",
          },
        ]);
        if (memErr) throw memErr;
      }

      // 2. Send message
      // NOTE: metadata column is often missing or different, sending as plain text with context
      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          chat_id: chatId,
          sender_id: userId,
          content: emojiOrText.startsWith('{"_msg":true') 
            ? emojiOrText 
            : `Status Reply: ${emojiOrText}`,
          message_type: "text",
          sender_name: user.fullName || user.username || "User"
        });
      
      if (msgError) throw msgError;
      setReplyText("");
      toast.success("Reply sent!");
    } catch (err) {
      console.error("Reply failed:", err);
      toast.error("Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const storyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const storyIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (userId) {
      loadStatusesData();
    }
  }, [userId]);

  const loadStatusesData = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const nowIso = new Date().toISOString();

      // 1. Fetch own active statuses
      const { data: myData, error: myErr } = await supabase
        .from("statuses")
        .select("*")
        .eq("user_id", userId)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(STATUS_PAGE_LIMIT);

      if (myErr) throw myErr;
      setMyStatuses(myData || []);

      // 2. Fetch current user's views
      const { data: myViews, error: viewsErr } = await supabase
        .from("status_views")
        .select("status_id")
        .eq("viewer_id", userId)
        .order("viewed_at", { ascending: false })
        .limit(STATUS_VIEW_LIMIT);

      if (viewsErr) throw viewsErr;
      const viewedIds = new Set<string>((myViews || []).map((v) => v.status_id));
      setViewedStatusIds(viewedIds);

      // 3. Fetch related users statuses
      // Get all chat_ids current user is in
      const { data: myChats } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", userId);

      const allChatIds = myChats?.map((c) => c.chat_id) || [];

      if (allChatIds.length > 0) {
        // Filter out public channels to restrict status sharing to actual chat participants (DMs & groups)
        const { data: activeChats } = await supabase
          .from("chats")
          .select("id")
          .in("id", allChatIds)
          .in("chat_type", ["dm", "group"]);

        const chatIds = activeChats?.map((c) => c.id) || [];

        if (chatIds.length > 0) {
          // Get all OTHER user_ids from those same chats
          const { data: relatedMembers } = await supabase
            .from("chat_members")
            .select("user_id")
            .in("chat_id", chatIds)
            .neq("user_id", userId)
            .limit(STATUS_CONTACT_LIMIT);

          const knownUserIds = Array.from(
            new Set((relatedMembers || []).map((m) => m.user_id))
          );

          if (knownUserIds.length > 0) {
            const { data: statuses, error: statErr } = await supabase
              .from("statuses")
              .select("*")
              .in("user_id", knownUserIds)
              .gt("expires_at", nowIso)
              .order("created_at", { ascending: true }) // Ascending so stack is oldest to newest
              .limit(STATUS_PAGE_LIMIT);

            if (statErr) throw statErr;

            // Group by user_id
            const grouped: Record<string, Status[]> = {};
            (statuses || []).forEach((s: Status) => {
              if (!grouped[s.user_id]) {
                grouped[s.user_id] = [];
              }
              grouped[s.user_id].push(s);
            });
            setGroupedStatuses(grouped);
          } else {
            setGroupedStatuses({});
          }
        } else {
          setGroupedStatuses({});
        }
      } else {
        setGroupedStatuses({});
      }
    } catch (e: any) {
      console.error("[status-hub] error loading data:", e);
      toast.error("Failed to load statuses");
    } finally {
      setLoading(false);
    }
  };

  // POST TEXT STATUS
  const handlePostTextStatus = async () => {
    if (!statusText.trim()) return;
    setLoading(true);
    try {
      const currentFullName = user?.fullName || user?.username || "User";
      const currentEmail = user?.primaryEmailAddress?.emailAddress || "";
      const currentProfilePic = user?.imageUrl || null;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase.from("statuses").insert({
        user_id: userId,
        user_email: currentEmail,
        user_name: currentFullName,
        user_profile_pic: currentProfilePic,
        status_type: "text",
        content: statusText.trim(),
        bg_color: BG_PRESETS[selectedBgIndex],
        expires_at: expiresAt
      });

      if (error) throw error;

      toast.success("Status posted!");
      setStatusText("");
      setTextComposerOpen(false);
      loadStatusesData();
    } catch (e: any) {
      console.error("[status-hub] post text error:", e);
      toast.error(e.message || "Failed to post status");
    } finally {
      setLoading(false);
    }
  };

  // POST PHOTO STATUS
  const handlePostPhotoStatus = async () => {
    if (!photoFile) return;
    setUploadingPhoto(true);
    try {
      const url = await compressAndUpload(photoFile, (status) => {
        console.log("[status] upload progress:", status);
      });

      const currentFullName = user?.fullName || user?.username || "User";
      const currentEmail = user?.primaryEmailAddress?.emailAddress || "";
      const currentProfilePic = user?.imageUrl || null;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase.from("statuses").insert({
        user_id: userId,
        user_email: currentEmail,
        user_name: currentFullName,
        user_profile_pic: currentProfilePic,
        status_type: "image",
        image_url: url,
        content: photoCaption.trim() || null,
        expires_at: expiresAt
      });

      if (error) throw error;

      toast.success("Photo status posted!");
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoCaption("");
      setPhotoComposerOpen(false);
      loadStatusesData();
    } catch (e: any) {
      console.error("[status-hub] post photo error:", e);
      toast.error(e.message || "Failed to upload photo status");
    } finally {
      setUploadingPhoto(false);
    }
  };

  // STORY VIEWER CONTROLS
  const openStoryViewer = (statusesStack: Status[], initialIndex = 0) => {
    if (statusesStack.length === 0) return;
    setViewerStatuses(statusesStack);
    setViewerIndex(initialIndex);
    setViewerProgress(0);
    setViewerPaused(false);
    setViewsListExpanded(false);
    setStoryViewerOpen(true);
  };

  useEffect(() => {
    if (!storyViewerOpen || viewerStatuses.length === 0) {
      if (storyTimerRef.current) clearTimeout(storyTimerRef.current);
      if (storyIntervalRef.current) clearInterval(storyIntervalRef.current);
      return;
    }

    const currentStatus = viewerStatuses[viewerIndex];
    if (currentStatus) {
      // Record view asynchronously
      recordView(currentStatus.id);

      // If own status, load viewer details
      if (currentStatus.user_id === userId) {
        loadStatusViewers(currentStatus.id);
      }
    }

    setViewerProgress(0);

    // Setup 5s timer for auto-advance
    const step = 100; // updates every 100ms
    const duration = 5000; // 5 seconds
    const intervalMs = duration / step; // 50ms

    if (storyTimerRef.current) clearTimeout(storyTimerRef.current);
    if (storyIntervalRef.current) clearInterval(storyIntervalRef.current);

    storyIntervalRef.current = setInterval(() => {
      if (!viewerPaused) {
        setViewerProgress((prev) => {
          if (prev >= 100) {
            handleNextStory();
            return 100;
          }
          return prev + 1;
        });
      }
    }, intervalMs);

    return () => {
      if (storyTimerRef.current) clearTimeout(storyTimerRef.current);
      if (storyIntervalRef.current) clearInterval(storyIntervalRef.current);
    };
  }, [storyViewerOpen, viewerStatuses, viewerIndex, viewerPaused]);

  const handleNextStory = () => {
    if (viewerIndex < viewerStatuses.length - 1) {
      setViewerIndex((prev) => prev + 1);
    } else {
      // End of stack, close
      setStoryViewerOpen(false);
    }
  };

  const handlePrevStory = () => {
    if (viewerIndex > 0) {
      setViewerIndex((prev) => prev - 1);
    } else {
      // Restart current first story
      setViewerProgress(0);
    }
  };

  const recordView = async (statusId: string) => {
    const status = viewerStatuses.find((s) => s.id === statusId);
    if (!status || status.user_id === userId) return;

    try {
      await supabase
        .from("status_views")
        .upsert({ 
          status_id: statusId, 
          viewer_id: userId 
        }, { onConflict: "status_id,viewer_id" });
      
      // Update local viewed status cache
      setViewedStatusIds((prev) => {
        const next = new Set(prev);
        next.add(statusId);
        return next;
      });
    } catch (e) {
      console.error("[status-hub] recordView error:", e);
    }
  };

  const loadStatusViewers = async (statusId: string) => {
    setLoadingViews(true);
    try {
      const { data: views, error: viewsErr } = await supabase
        .from("status_views")
        .select("id, status_id, viewer_id, viewed_at")
        .eq("status_id", statusId)
        .order("viewed_at", { ascending: false })
        .limit(STATUS_VIEW_LIMIT);

      if (viewsErr) throw viewsErr;

      if (views && views.length > 0) {
        const viewerIds = views.map((v) => v.viewer_id);
        const { data: profiles, error: profsErr } = await supabase
          .from("profile_directory_v1")
          .select("clerk_id, username, full_name, profile_pic_url, image_url")
          .in("clerk_id", viewerIds);

        if (profsErr) throw profsErr;

        const profilesMap: Record<string, any> = {};
        (profiles || []).forEach((p) => {
          profilesMap[p.clerk_id] = p;
        });

        const enrichedViews = views.map((v) => {
          const prof = profilesMap[v.viewer_id];
          return {
            ...v,
            viewerName: prof?.full_name || prof?.username || "Plugsy User",
            viewerPic: prof?.profile_pic_url || prof?.image_url || null,
          };
        });

        setStoryViewsList(enrichedViews);
      } else {
        setStoryViewsList([]);
      }
    } catch (e) {
      console.error("[status-hub] loadStatusViewers error:", e);
    } finally {
      setLoadingViews(false);
    }
  };

  const handleDeleteStatus = async (statusId: string) => {
    if (!confirm("Are you sure you want to delete this status update?")) return;
    try {
      await supabase.from("status_views").delete().eq("status_id", statusId);
      const { error } = await supabase.from("statuses").delete().eq("id", statusId);

      if (error) throw error;

      toast.success("Status deleted");
      setStoryViewerOpen(false);
      loadStatusesData();
    } catch (e: any) {
      console.error("[status-hub] deleteStatus error:", e);
      toast.error("Failed to delete status");
    }
  };

  // Helper: Format relative time
  const getRelativeTime = (isoString: string) => {
    try {
      const diff = Date.now() - new Date(isoString).getTime();
      const mins = Math.floor(diff / 60000);
      const hours = Math.floor(mins / 600);
      if (mins < 1) return "Just now";
      if (mins < 60) return `${mins}m ago`;
      if (hours < 24) return `${hours}h ago`;
      return new Date(isoString).toLocaleDateString();
    } catch (e) {
      return "";
    }
  };

  // Helper: check if a list of statuses has any unviewed entries
  const hasUnviewedStatuses = (statusesStack: Status[]) => {
    return statusesStack.some((s) => !viewedStatusIds.has(s.id));
  };

  return (
    <div className="flex-grow flex flex-col max-w-xl mx-auto w-full px-2 py-4">
      {/* Hidden file selector for Photo Status - kept outside AnimatePresence so it doesn't unmount */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
            setPhotoComposerOpen(true);
          }
          // Reset the input so the same file can be selected again
          e.target.value = '';
        }}
      />

      {/* Title & Stats */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-6">
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white font-display">
          Status Updates
        </h2>
        <span className="text-xs font-bold text-blue-500/80 dark:text-blue-400/80 flex items-center gap-1">
          <Clock size={12} />
          Disappears in 24 hours
        </span>
      </div>

      {/* MY STATUS BOX */}
      <div className="bg-white dark:bg-[#141416] border border-slate-100 dark:border-white/5 rounded-2xl p-4 mb-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Own avatar container */}
            <div className="relative cursor-pointer shrink-0">
              {myStatuses.length > 0 ? (
                // View own status
                <div 
                  onClick={() => openStoryViewer(myStatuses)}
                  className="p-0.5 rounded-full border-2 border-green-500 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-white dark:border-[#141416] bg-slate-100 dark:bg-black/30">
                    {user?.imageUrl ? (
                      <img src={user.imageUrl} alt={user.fullName || "Me"} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-sm text-slate-500 bg-slate-200 dark:bg-black/40">
                        {user?.firstName?.slice(0, 1)}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // Create Status Trigger
                <div 
                  onClick={() => setCreateSheetOpen(true)}
                  className="relative flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
                >
                  <div className="w-13 h-13 rounded-full overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/30">
                    {user?.imageUrl ? (
                      <img src={user.imageUrl} alt={user.fullName || "Me"} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-sm text-slate-500 bg-slate-200 dark:bg-black/40">
                        {user?.firstName?.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-blue-500 border-2 border-white dark:border-[#141416] flex items-center justify-center text-white text-[10px] font-black">
                    +
                  </span>
                </div>
              )}
            </div>

            <div className="text-left">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                My Status
              </h3>
              <p className="text-xs text-slate-400 dark:text-[#a1a1a1] font-semibold mt-0.5">
                {myStatuses.length > 0 
                  ? `${myStatuses.length} updates posted` 
                  : "Tap to share a 24h update"}
              </p>
            </div>
          </div>

          <button
            onClick={() => setCreateSheetOpen(true)}
            className="p-2 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-all text-slate-600 dark:text-slate-300 rounded-xl cursor-pointer"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* RECENT UPDATES SECTION */}
      <div className="flex-grow text-left">
        <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3">
          Recent Updates
        </h3>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin mb-2" />
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Loading Updates...
            </p>
          </div>
        ) : Object.keys(groupedStatuses).length === 0 ? (
          <div className="py-12 px-6 text-center bg-slate-50 dark:bg-[#141416] rounded-2xl border border-slate-100 dark:border-white/5">
            <Clock className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-400 dark:text-[#a1a1a1] font-bold uppercase tracking-wider leading-relaxed">
              No updates yet
            </p>
            <p className="text-[11px] text-slate-400 dark:text-[#a1a1a1] font-medium max-w-xs mx-auto mt-1">
              Statuses from people you chat with will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupedStatuses).map(([relatedUserId, rawStatusesStack]) => {
              const statusesStack = rawStatusesStack as Status[];
              const mostRecent = statusesStack[statusesStack.length - 1];
              const isUnviewed = hasUnviewedStatuses(statusesStack);
              const totalCount = statusesStack.length;

              return (
                <button
                  key={relatedUserId}
                  onClick={() => openStoryViewer(statusesStack)}
                  className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-left cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-white/5"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Ring profile pic */}
                    <div className="relative shrink-0">
                      <div className={`p-0.5 rounded-full border-2 ${
                        isUnviewed ? "border-blue-500 animate-pulse" : "border-slate-300 dark:border-slate-700"
                      } flex items-center justify-center`}>
                        <div className="w-12 h-12 rounded-full overflow-hidden border border-white dark:border-[#0A0A0C] bg-slate-100 dark:bg-black/30">
                          {mostRecent.user_profile_pic ? (
                            <img src={mostRecent.user_profile_pic} alt={mostRecent.user_name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-bold text-sm text-slate-500 bg-slate-200 dark:bg-black/40">
                              {(mostRecent.user_name || "User").slice(0, 2)}
                            </div>
                          )}
                        </div>
                      </div>
                      {totalCount > 1 && (
                        <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] font-black rounded-full w-5 h-5 flex items-center justify-center border-2 border-white dark:border-[#0A0A0C]">
                          {totalCount}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {mostRecent.user_name}
                      </h4>
                      <p className="text-[11px] text-slate-400 font-semibold mt-0.5 flex items-center gap-1">
                        <span>{getRelativeTime(mostRecent.created_at)}</span>
                        <span>•</span>
                        <span>{mostRecent.status_type === "image" ? "📷 Image status" : "✏️ Text status"}</span>
                      </p>
                    </div>
                  </div>

                  <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE SHEET BOTTOM MODAL (CHOOSE TYPE) */}
      <AnimatePresence>
        {createSheetOpen && (
          <div className="fixed inset-0 z-[10005] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCreateSheetOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-md bg-white dark:bg-[#141416] rounded-t-[2.5rem] border-t border-slate-100 dark:border-white/10 p-6 pb-12 shadow-2xl z-10"
            >
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-white/10 rounded-full mx-auto mb-6" />
              
              <h3 className="text-center font-extrabold text-base text-slate-900 dark:text-white mb-6 font-display">
                Create Status Update
              </h3>

              <div className="grid grid-cols-2 gap-4">
                {/* Photo Status */}
                <button
                  onClick={() => {
                    setCreateSheetOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl hover:border-blue-500/50 dark:hover:border-blue-500/30 transition-all cursor-pointer group"
                >
                  <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 mb-3 group-hover:scale-110 transition-transform">
                    <Camera size={20} />
                  </div>
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-200">
                    📷 Photo Status
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">
                    Upload an image with caption
                  </span>
                </button>

                {/* Text Status */}
                <button
                  onClick={() => {
                    setCreateSheetOpen(false);
                    setTextComposerOpen(true);
                  }}
                  className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl hover:border-blue-500/50 dark:hover:border-blue-500/30 transition-all cursor-pointer group"
                >
                  <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center text-green-500 mb-3 group-hover:scale-110 transition-transform">
                    <Pencil size={18} />
                  </div>
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-200">
                    ✏️ Text Status
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">
                    Write a colorful text update
                  </span>
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TEXT COMPOSER (FULL SCREEN ACCENT CARD) */}
      <AnimatePresence>
        {textComposerOpen && (
          <div className="fixed inset-0 z-[10010] flex flex-col items-center justify-center p-4">
            {/* Ambient glass backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />

            {/* Composer Box */}
            <motion.div
              initial={{ scale: 0.9, y: 50, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 50, opacity: 0 }}
              style={{ backgroundColor: BG_PRESETS[selectedBgIndex] }}
              className="relative w-full max-w-md h-full max-h-[85vh] sm:aspect-[9/16] sm:h-auto rounded-[2rem] p-6 flex flex-col justify-between shadow-2xl z-10 select-none overflow-hidden border border-white/10"
            >
              {/* Tap background helper banner */}
              <div 
                onClick={() => setSelectedBgIndex((prev) => (prev + 1) % BG_PRESETS.length)}
                className="absolute inset-0 cursor-pointer z-0" 
              />

              {/* Controls */}
              <div className="relative z-10 flex justify-between items-center">
                <button
                  onClick={() => setTextComposerOpen(false)}
                  className="p-2 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>

                <button
                  onClick={() => setSelectedBgIndex((prev) => (prev + 1) % BG_PRESETS.length)}
                  className="px-3 py-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Sparkles size={11} />
                  Change BG
                </button>
              </div>

              {/* Center Input */}
              <div className="relative z-10 flex-grow flex flex-col items-center justify-center px-4">
                <textarea
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value.slice(0, 200))}
                  placeholder="Type a status update..."
                  className="w-full text-center text-white font-extrabold text-2xl bg-transparent border-none outline-none focus:ring-0 resize-none placeholder-white/40 max-h-60"
                  rows={4}
                  autoFocus
                />
                <span className="text-[10px] font-black text-white/50 uppercase tracking-widest mt-4">
                  {statusText.length}/200 characters
                </span>
              </div>

              {/* Bottom Post */}
              <div className="relative z-10 flex justify-end">
                <button
                  onClick={handlePostTextStatus}
                  disabled={!statusText.trim()}
                  className="px-6 py-3 bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-40 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer"
                >
                  Post Status
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PHOTO COMPOSER (PREVIEW + CAPTION OVERLAY) */}
      <AnimatePresence>
        {photoComposerOpen && (
          <div className="fixed inset-0 z-[10010] flex flex-col items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
            />

            <motion.div
              initial={{ scale: 0.9, y: 50, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 50, opacity: 0 }}
              className="relative w-full max-w-md h-full max-h-[85vh] sm:aspect-[9/16] sm:h-auto bg-slate-900 rounded-[2rem] flex flex-col justify-between shadow-2xl z-10 overflow-hidden border border-white/10"
            >
              {/* Photo Display */}
              {photoPreview && (
                <img
                  src={photoPreview}
                  alt="Status"
                  className="absolute inset-0 w-full h-full object-cover z-0"
                />
              )}

              {/* Top Controls */}
              <div className="relative z-10 p-6 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
                <button
                  onClick={() => {
                    setPhotoComposerOpen(false);
                    setPhotoFile(null);
                    setPhotoPreview(null);
                  }}
                  disabled={uploadingPhoto}
                  className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>

                <span className="font-extrabold text-xs text-white drop-shadow-md uppercase tracking-wider">
                  Photo Status Preview
                </span>
              </div>

              {/* Bottom Caption Overlay */}
              <div className="relative z-10 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent space-y-4">
                {/* Caption input */}
                <div className="space-y-1">
                  <input
                    type="text"
                    value={photoCaption}
                    onChange={(e) => setPhotoCaption(e.target.value.slice(0, 100))}
                    placeholder="Add a caption (optional)..."
                    disabled={uploadingPhoto}
                    className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white text-sm placeholder-white/50 focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex justify-between text-[9px] text-white/40 uppercase tracking-wider px-1">
                    <span>Add Caption</span>
                    <span>{photoCaption.length}/100</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end">
                  <button
                    onClick={handlePostPhotoStatus}
                    disabled={uploadingPhoto}
                    className="px-6 py-3 bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-50 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
                  >
                    {uploadingPhoto ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Posting...
                      </>
                    ) : (
                      "Post Status"
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* STORY VIEWER (FULL SCREEN INTERACTIVE STORIES) */}
      <AnimatePresence>
        {storyViewerOpen && viewerStatuses.length > 0 && (
          <div className="fixed inset-0 z-[10020] flex flex-col items-center justify-center bg-slate-950">
            {/* Inner frame */}
            <div className="relative w-full max-w-md h-full max-h-[85vh] sm:aspect-[9/16] sm:h-auto bg-slate-900 md:rounded-[2rem] overflow-hidden flex flex-col justify-between shadow-2xl z-10">
              {/* Gesture boundaries (Moved inside inner frame and given z-index) */}
              <div className="absolute inset-0 flex z-20 pointer-events-none">
                <div 
                  onClick={handlePrevStory}
                  className="w-1/2 h-full cursor-pointer pointer-events-auto" 
                />
                <div 
                  onClick={handleNextStory}
                  onMouseDown={() => setViewerPaused(true)}
                  onMouseUp={() => setViewerPaused(false)}
                  onTouchStart={() => setViewerPaused(true)}
                  onTouchEnd={() => setViewerPaused(false)}
                  className="w-1/2 h-full cursor-pointer pointer-events-auto" 
                />
              </div>

              {/* Background Render */}
              {viewerStatuses[viewerIndex].status_type === "image" ? (
                <>
                  <img
                    src={viewerStatuses[viewerIndex].image_url || ""}
                    alt="Story"
                    className="absolute inset-0 w-full h-full object-cover z-0 select-none pointer-events-none"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/75 z-0" />
                </>
              ) : (
                <div
                  style={{ backgroundColor: viewerStatuses[viewerIndex].bg_color || "#1e293b" }}
                  className="absolute inset-0 flex items-center justify-center p-8 z-0"
                >
                  <p className="text-white font-extrabold text-2xl text-center break-words max-w-full">
                    {viewerStatuses[viewerIndex].content}
                  </p>
                </div>
              )}

              {/* Top Section (Bars + Header Overlay) */}
              <div className="relative z-10 p-4 space-y-3 bg-gradient-to-b from-black/70 to-transparent">
                {/* Thin Segment Progress Bars */}
                <div className="flex gap-1">
                  {viewerStatuses.map((s, idx) => (
                    <div
                      key={s.id}
                      className="h-1 flex-grow bg-white/20 rounded-full overflow-hidden"
                    >
                      <div
                        className="h-full bg-white transition-all duration-100 ease-linear"
                        style={{
                          width:
                            idx < viewerIndex
                              ? "100%"
                              : idx === viewerIndex
                              ? `${viewerProgress}%`
                              : "0%",
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Profile Header */}
                <div className="flex items-center justify-between">
                  <div 
                    className="flex items-center gap-3 cursor-pointer" 
                    onClick={(e) => {
                      e.stopPropagation();
                      onProfileClick?.(viewerStatuses[viewerIndex].user_id);
                    }}
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-white/20 bg-white/10 shrink-0">
                      {viewerStatuses[viewerIndex].user_profile_pic ? (
                        <img
                          src={viewerStatuses[viewerIndex].user_profile_pic || ""}
                          alt={viewerStatuses[viewerIndex].user_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-white text-sm bg-slate-700">
                          {(viewerStatuses[viewerIndex].user_name || "User").slice(0, 2)}
                        </div>
                      )}
                    </div>
                    <div className="text-left">
                      <h4 className="font-extrabold text-sm text-white drop-shadow">
                        {viewerStatuses[viewerIndex].user_name}
                      </h4>
                      <p className="text-[10px] text-white/70 font-semibold drop-shadow">
                        {getRelativeTime(viewerStatuses[viewerIndex].created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Delete Option for Owner */}
                    {viewerStatuses[viewerIndex].user_id === userId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteStatus(viewerStatuses[viewerIndex].id);
                        }}
                        className="p-1.5 rounded-full bg-white/10 hover:bg-red-500/30 text-white hover:text-red-200 transition-colors cursor-pointer"
                        title="Delete Status"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setStoryViewerOpen(false);
                      }}
                      className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer relative z-30 pointer-events-auto"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom Group Container - always anchored at the very bottom */}
              <div className="relative z-30 mt-auto p-6 flex flex-col items-center gap-4 pointer-events-auto w-full">
                {/* Caption (only for Image status) */}
                {viewerStatuses[viewerIndex].status_type === "image" && viewerStatuses[viewerIndex].content && (
                  <div className="w-full text-center bg-black/40 backdrop-blur-md rounded-2xl p-4 border border-white/10 select-none relative z-30">
                    <p className="text-white text-sm font-bold leading-relaxed break-words">
                      {viewerStatuses[viewerIndex].content}
                    </p>
                  </div>
                )}

                {/* Quick Reaction Emojis */}
                {viewerStatuses[viewerIndex].user_id !== userId && (
                  <div className="flex items-center justify-center gap-3 w-full animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-30">
                    {["❤️", "🔥", "😂", "👏", "😮", "😢"].map((emoji) => (
                      <button
                        key={emoji}
                        onClick={(e) => {
                          e.stopPropagation();
                          sendQuickReply(emoji);
                        }}
                        className="text-2xl hover:scale-125 active:scale-95 transition-transform p-2 bg-white/10 rounded-full backdrop-blur-md border border-white/10 cursor-pointer pointer-events-auto"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {/* Reply Input Bar */}
                {viewerStatuses[viewerIndex].user_id !== userId && (
                  <div className="flex items-center gap-3 w-full relative z-30 pointer-events-auto">
                    <input 
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type a reply..."
                      className="flex-grow bg-white/10 border border-white/20 rounded-full px-5 py-3 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40 transition-all backdrop-blur-md pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                      onFocus={() => setViewerPaused(true)}
                      onBlur={() => setViewerPaused(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && replyText.trim()) {
                          sendQuickReply(replyText);
                        }
                      }}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (replyText.trim()) sendQuickReply(replyText);
                      }}
                      disabled={!replyText.trim() || sendingReply}
                      className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 cursor-pointer pointer-events-auto"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                )}

                {/* Viewers bar for OWN Status */}
                {viewerStatuses[viewerIndex].user_id === userId && (
                  <button
                    onClick={() => {
                      setViewerPaused(true);
                      setViewsListExpanded(true);
                    }}
                    className="w-full py-2.5 bg-black/40 backdrop-blur-md hover:bg-black/60 rounded-xl border border-white/10 flex items-center justify-center gap-2 text-white text-xs font-black uppercase tracking-wider cursor-pointer"
                  >
                    <Eye size={14} />
                    <span>Viewed by {storyViewsList.length} people</span>
                  </button>
                )}
              </div>
            </div>

            {/* EXPANDABLE VIEWER LIST PANEL FOR OWN STATUS */}
            <AnimatePresence>
              {viewsListExpanded && (
                <div className="fixed inset-0 z-[10030] flex items-end justify-center">
                  <div 
                    onClick={() => {
                      setViewsListExpanded(false);
                      setViewerPaused(false);
                    }}
                    className="absolute inset-0 bg-black/70" 
                  />
                  <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    className="relative w-full max-w-md bg-white dark:bg-[#141416] rounded-t-3xl border-t border-slate-100 dark:border-white/10 p-6 pb-10 z-10 text-left"
                  >
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                        <Eye className="text-blue-500" size={18} />
                        Views ({storyViewsList.length})
                      </h3>
                      <button
                        onClick={() => {
                          setViewsListExpanded(false);
                          setViewerPaused(false);
                        }}
                        className="p-1.5 rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 hover:text-slate-900 dark:text-white"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    <div className="max-h-72 overflow-y-auto space-y-3 pr-2">
                      {loadingViews ? (
                        <div className="flex justify-center py-6">
                          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                        </div>
                      ) : storyViewsList.length === 0 ? (
                        <p className="text-center py-6 text-xs text-slate-400 font-bold uppercase tracking-wider">
                          No views yet
                        </p>
                      ) : (
                        storyViewsList.map((view) => (
                          <div key={view.id} className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-white/5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-100 dark:bg-black/20 shrink-0">
                                {view.viewerPic ? (
                                  <img src={view.viewerPic} alt={view.viewerName} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center font-black text-xs text-slate-500 bg-slate-200">
                                    {view.viewerName?.slice(0, 2)}
                                  </div>
                                )}
                              </div>
                              <div>
                                <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                                  {view.viewerName}
                                </h4>
                                <p className="text-[10px] text-slate-400 font-medium">
                                  {getRelativeTime(view.viewed_at)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
