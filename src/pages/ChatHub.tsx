import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { supabase } from "../lib/supabase";
import { compressAndUpload } from "../utils/uploadMedia";
import { motion, AnimatePresence } from "motion/react";
import { SearchChat, Highlight } from "../components/SearchChat";
import { 
  MessageSquare, Users, Search, Plus, Compass, ArrowRight, ArrowLeft, ChevronLeft,
  MessageCircle, Loader2, Image as ImageIcon, Check, Globe, Lock, ShieldCheck, X,
  CircleDot, Settings, Megaphone, Share2, Trash2, User
} from "lucide-react";
import { useProfile } from "../hooks/useProfile";
import { useTheme } from "../lib/ThemeContext";
import StatusHub from "../components/chat/StatusHub";
import toast from "react-hot-toast";
import { useOnlinePresence } from "../contexts/OnlinePresenceContext";
import plugsyLogo from "../assets/images/plugsy_icon.svg";
import { getCanonicalOneLinkUrl } from "../utils/onelink";
import { syncClerkUserToSupabase } from "../lib/authUtils";
import { createRefreshCoordinator, shouldScheduleChatHubRefresh } from "../utils/chatScalability";
import {
  parseOneLinkProfileBio,
} from "../../shared/onelink.js";

interface Profile {
  clerk_id: string;
  username: string | null;
  full_name: string | null;
  profile_pic_url: string | null;
  image_url: string | null;
  bio: string | null;
  one_link_username?: string | null;
  last_login_at?: string | null;
}

const CHAT_PROFILE_COLUMNS =
  "clerk_id,username,full_name,profile_pic_url,image_url,bio,one_link_username,last_login_at";

interface Chat {
  id: string;
  chat_type: "dm" | "group" | "support";
  name: string | null;
  description: string | null;
  cover_image_url: string | null;
  is_public: boolean;
  member_count: number;
  last_message: string | null;
  last_message_at: string | null;
  active_call_status: string | null;
}

interface ChatWithMember extends Chat {
  otherMember?: Profile;
}

interface ChatHubProps {
  defaultTab?: "dm" | "communities" | "status" | "settings" | "you";
}

export default function ChatHub({ defaultTab }: ChatHubProps = {}) {
  const { userId, signOut, getToken } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const { isUserOnline } = useOnlinePresence();
  const { theme, toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<"dm" | "communities" | "status" | "settings">("dm");
  const [chatSounds, setChatSounds] = useState<boolean>(() => {
    const saved = localStorage.getItem("plugsy-chat-sounds");
    return saved ? JSON.parse(saved) : true;
  });
  const [readReceipts, setReadReceipts] = useState<boolean>(() => {
    const saved = localStorage.getItem("plugsy-read-receipts");
    return saved ? JSON.parse(saved) : true;
  });
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const inboxRefreshCoordinator = React.useMemo(() => createRefreshCoordinator(150), [userId, activeTab]);

  // DM State
  const [dms, setDms] = useState<ChatWithMember[]>([]);
  const dmsRef = useRef<ChatWithMember[]>([]);

  useEffect(() => {
    dmsRef.current = dms;
  }, [dms]);

  // Search State
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);

  // Communities State
  const [myGroups, setMyGroups] = useState<Chat[]>([]);
  const [discoverGroups, setDiscoverGroups] = useState<Chat[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [communityName, setCommunityName] = useState("");
  const [communityDesc, setCommunityDesc] = useState("");
  const [communityCover, setCommunityCover] = useState("");
  const [communityPublic, setCommunityPublic] = useState(true);
  const [coverUploading, setCoverUploading] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Edit Profile State
  const { profile: myProfile, loading: profileLoading, mutate: mutateProfile } = useProfile(userId || undefined);
  const [accountSyncState, setAccountSyncState] = useState<"syncing" | "synced" | "needed">("syncing");
  const accountSyncAttemptedRef = useRef("");
  const [profileDraftEdited, setProfileDraftEdited] = useState(false);
  const [profileUsername, setProfileUsername] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profileFullName, setProfileFullName] = useState("");
  const [profilePic, setProfilePic] = useState("");
  const [profilePicUploading, setProfilePicUploading] = useState(false);
  const [userProfileModal, setUserProfileModal] = useState<any | null>(null);

  const handleShowUserProfile = async (userIdToFind: string) => {
    if (userIdToFind === userId) return;
    try {
      const { data, error } = await supabase
        .from("profile_directory_v1")
        .select(CHAT_PROFILE_COLUMNS)
        .eq("clerk_id", userIdToFind)
        .maybeSingle();
      if (data) setUserProfileModal(data);
    } catch (err) {
      console.error("Profile fetch failed:", err);
    }
  };

  const isChannelCreation = false;

  // Suggested Profiles State
  const [suggestedProfiles, setSuggestedProfiles] = useState<Profile[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);

  useEffect(() => {
    if (myProfile && !profileDraftEdited) {
      setProfileUsername(myProfile.username || user?.username || "");
      setProfileBio(
        parseOneLinkProfileBio(myProfile.bio).biography,
      );
      setProfileFullName(myProfile.full_name || "");
      setProfilePic(myProfile.profile_pic_url || myProfile.image_url || "");
    }
  }, [myProfile, user, profileDraftEdited]);

  const confirmAccountSync = async () => {
    if (!user?.id) return;
    setAccountSyncState("syncing");
    try {
      await syncClerkUserToSupabase(user, getToken);
      const confirmedProfile = await mutateProfile();
      setAccountSyncState(
        confirmedProfile?.clerk_id === user.id ? "synced" : "needed",
      );
    } catch {
      setAccountSyncState("needed");
    }
  };

  useEffect(() => {
    if (!user?.id || profileLoading) {
      setAccountSyncState("syncing");
      return;
    }

    if (myProfile?.clerk_id === user.id) {
      setAccountSyncState("synced");
      return;
    }

    if (accountSyncAttemptedRef.current !== user.id) {
      accountSyncAttemptedRef.current = user.id;
      void confirmAccountSync();
      return;
    }

    setAccountSyncState("needed");
  }, [user?.id, profileLoading, myProfile?.clerk_id]);

  useEffect(() => {
    if (searchOpen && userId) {
      fetchSuggestedProfiles();
    }
  }, [searchOpen, userId]);

  const fetchSuggestedProfiles = async () => {
    setLoadingSuggested(true);
    try {
      const { data, error } = await supabase
        .from("profile_directory_v1")
        .select(CHAT_PROFILE_COLUMNS)
        .neq("clerk_id", userId)
        .limit(5);
      if (!error && data) {
        setSuggestedProfiles(data);
      }
    } catch (err) {
      console.error("Error loading suggested profiles:", err);
    } finally {
      setLoadingSuggested(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileFullName.trim()) {
      toast.error("Display Name is required");
      return;
    }
    
    const formattedUsername = profileUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!formattedUsername) {
      toast.error("Chat username is required");
      return;
    }

    const saveToast = toast.loading("Saving profile changes...");
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session has expired. Sign in again.");
      const response = await fetch("/api/profile?action=save-chat-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName: profileFullName,
          username: formattedUsername,
          biography: profileBio,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || !payload?.profile) {
        throw new Error(payload?.error || "Failed to update Chat profile");
      }
      setProfileDraftEdited(false);
      await mutateProfile();
      toast.success("Profile updated successfully!", { id: saveToast });
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile", { id: saveToast });
    }
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tabParam = searchParams.get("tab");
    if (tabParam === "status" || tabParam === "dm" || tabParam === "communities" || tabParam === "settings") {
      setActiveTab(tabParam as any);
    } else if (defaultTab) {
      setActiveTab(defaultTab);
    }
    const oneLinkSearch = String(
      searchParams.get("search") || "",
    )
      .trim()
      .toLowerCase();
    if (/^[a-z0-9_]{1,64}$/.test(oneLinkSearch)) {
      setActiveTab("dm");
      setSearchQuery(oneLinkSearch);
      setSearchOpen(true);
    }
  }, [defaultTab]);

  useEffect(() => {
    if (userId && activeTab !== "status") {
      scheduleFetchChats();
    } else if (activeTab === "status") {
      setLoading(false);
    }
  }, [userId, activeTab]);

  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && activeTab !== "status") {
        scheduleFetchChats();
      }
    }, 5 * 60_000);
    return () => clearInterval(interval);
  }, [userId, activeTab]);

  useEffect(() => {
    if (!userId) return;
    // Keep inbox updates on their own channel. RealtimeNotifications owns the
    // user-events topic, and Supabase channels cannot be modified after
    // subscription.
    const channel = supabase.channel('user-events-' + userId + '-inbox')
      .on('broadcast', { event: 'new_unread' }, () => {
        if (shouldScheduleChatHubRefresh("new_unread", userId)) scheduleFetchChats();
      })
      .subscribe();

    return () => {
      inboxRefreshCoordinator.dispose();
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [userId, activeTab]);

  const scheduleFetchChats = () => {
    inboxRefreshCoordinator.schedule(() => fetchChats());
  };

  const fetchChats = async () => {
    if (!userId) return;
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    try {
      const { data: memberships, error: memErr } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", userId);

      if (memErr) throw memErr;
      const chatIds = memberships?.map((m) => m.chat_id) || [];

      if (activeTab === "dm" || activeTab === "settings" || activeTab === "you") {
        if (chatIds.length === 0) {
          setDms([]);
          setLoading(false);
          return;
        }

        // Fetch DM chats
        const { data: chatsData, error: chatsErr } = await supabase
          .from("chats")
          .select("id,chat_type,name,description,cover_image_url,is_public,member_count,last_message,last_message_at,active_call_status,created_at,unread_count,typing_users")
          .eq("chat_type", "dm")
          .in("id", chatIds)
          .order("last_message_at", { ascending: false });

        if (chatsErr) throw chatsErr;
        const dmChats = chatsData || [];

        if (dmChats.length === 0) {
          setDms([]);
          setLoading(false);
          return;
        }

        // Fetch other members
        const dmChatIds = dmChats.map((c) => c.id);
        const { data: membersData, error: membersErr } = await supabase
          .from("chat_members")
          .select("chat_id, user_id, user_name, user_email")
          .in("chat_id", dmChatIds)
          .neq("user_id", userId);

        if (membersErr) throw membersErr;
        const otherUserIds = Array.from(new Set((membersData || []).map((m) => m.user_id)));

        // Fetch profiles
        let profilesMap: Record<string, Profile> = {};
        if (otherUserIds.length > 0) {
          const { data: profilesData, error: profErr } = await supabase
            .from("profile_directory_v1")
            .select(CHAT_PROFILE_COLUMNS)
            .in("clerk_id", otherUserIds);

          // A profile enrichment failure must never hide a user's inbox.
          // chat_members already contains a safe display-name fallback.
          if (profErr) {
            console.error("Error loading chat profiles:", profErr);
          }
          (profilesData || []).forEach((p: Profile) => {
            profilesMap[p.clerk_id] = p;
          });
        }

        const seenMemberIds = new Set<string>();
        const uniqueEnrichedDms: ChatWithMember[] = [];

        dmChats.forEach((chat) => {
          const relation = (membersData || []).find((m) => m.chat_id === chat.id);
          const otherUserId = relation?.user_id || "";
          if (!otherUserId) return;
          
          if (seenMemberIds.has(otherUserId)) return;
          seenMemberIds.add(otherUserId);

          const otherProfile = profilesMap[otherUserId];
          uniqueEnrichedDms.push({
            ...chat,
            otherMember: otherProfile || {
              clerk_id: otherUserId,
              username: relation?.user_name || "User",
              full_name: relation?.user_name || "User",
              profile_pic_url: null,
              image_url: null,
              bio: null
            }
          });
        });

        setDms(uniqueEnrichedDms);
      } else if (activeTab === "communities") {
        let groupChats: Chat[] = [];
        if (chatIds.length > 0) {
          const { data: joinedGroups, error: joinedErr } = await supabase
            .from("chats")
          .select("id,chat_type,name,description,cover_image_url,is_public,member_count,last_message,last_message_at,active_call_status,created_at,unread_count,typing_users")
            .eq("chat_type", "group")
            .in("id", chatIds)
            .order("last_message_at", { ascending: false });

          if (joinedErr) throw joinedErr;
          groupChats = joinedGroups || [];
        }
        setMyGroups(groupChats);

        // Fetch public communities
        const { data: publicGroups, error: pubErr } = await supabase
          .from("chats")
            .select("id,chat_type,name,description,cover_image_url,is_public,member_count,last_message,last_message_at,active_call_status,created_at,unread_count,typing_users")
          .eq("chat_type", "group")
          .eq("is_public", true)
          .order("member_count", { ascending: false })
          .limit(10);

        if (pubErr) throw pubErr;
        const unjoinedPublic = (publicGroups || []).filter(
          (g) => !chatIds.includes(g.id)
        );
        setDiscoverGroups(unjoinedPublic);
      }
    } catch (err: any) {
      console.error("Error loading chat hub:", err);
    } finally {
      setLoading(false);
      hasLoadedRef.current = true;
    }
  };

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const delayDebounce = setTimeout(() => {
      searchProfiles();
    }, 400);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const searchProfiles = async () => {
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("profile_directory_v1")
        .select(CHAT_PROFILE_COLUMNS)
        .or(`username.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`)
        .neq("clerk_id", userId)
        .limit(8);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const startDM = async (otherUser: Profile) => {
    if (!userId || !user) return;
    try {
      const { data: myMemberships } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", userId);

      const existingChatIds = myMemberships?.map((m) => m.chat_id) || [];

      let mutualChatId = null;
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
            .eq("user_id", otherUser.clerk_id)
            .limit(1);

          if (mutualChat && mutualChat.length > 0) {
            mutualChatId = mutualChat[0].chat_id;
          }
        }
      }

      if (mutualChatId) {
        setSearchOpen(false);
        navigate(`/chats/${mutualChatId}`);
      } else {
        const { data: newChat, error: chatErr } = await supabase
          .from("chats")
          .insert({ chat_type: "dm" })
          .select()
          .single();

        if (chatErr) throw chatErr;

        const currentFullName = user.fullName || user.username || "User";
        const otherFullName = otherUser.full_name || otherUser.username || "User";

        const { error: memErr } = await supabase.from("chat_members").insert([
          {
            chat_id: newChat.id,
            user_id: userId,
            user_email: user.primaryEmailAddress?.emailAddress || "",
            user_name: currentFullName,
            role: "member",
          },
          {
            chat_id: newChat.id,
            user_id: otherUser.clerk_id,
            user_email: "",
            user_name: otherFullName,
            role: "member",
          },
        ]);

        if (memErr) throw memErr;
        setSearchOpen(false);
        navigate(`/chats/${newChat.id}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to initiate direct message");
    }
  };

  const handleDeleteDM = async (e: React.MouseEvent, chatId: string, partnerName: string) => {
    e.preventDefault();
    e.stopPropagation();
    const confirm = window.confirm(`Are you sure you want to delete your conversation with ${partnerName} and all messages? This action is irreversible.`);
    if (!confirm) return;

    try {
      await supabase.from("messages").delete().eq("chat_id", chatId);
      await supabase.from("chat_members").delete().eq("chat_id", chatId);
      const { error: chatErr } = await supabase.from("chats").delete().eq("id", chatId);
      if (chatErr) throw chatErr;

      toast.success(`Deleted conversation with ${partnerName}`);
      scheduleFetchChats();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete conversation");
    }
  };

  const joinGroup = async (group: Chat) => {
    if (!userId || !user) {
      toast.error("Please log in to join communities");
      return;
    }
    try {
      const currentFullName = user.fullName || user.username || "User";
      const { error: joinErr } = await supabase.from("chat_members").insert({
        chat_id: group.id,
        user_id: userId,
        user_email: user.primaryEmailAddress?.emailAddress || "",
        user_name: currentFullName,
        role: "member",
      });

      if (joinErr) throw joinErr;
      await supabase.rpc("increment_member_count", { chat_id_param: group.id }).catch(() => {
        return supabase.from("chats").update({ member_count: (group.member_count || 0) + 1 }).eq("id", group.id);
      });

      toast.success(`Joined community "${group.name}"!`);
      navigate(`/chats/${group.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to join community");
    }
  };

  const handleCreateGroup = async () => {
    if (!userId || !user) return;
    if (!communityName.trim()) {
      toast.error("Community name is required");
      return;
    }
    setCreatingGroup(true);
    try {
      const inviteCode = "invite_" + Math.random().toString(36).slice(2, 10);
      const { data: newChat, error: chatErr } = await supabase
        .from("chats")
        .insert({
          chat_type: "group",
          name: communityName,
          description: communityDesc,
          cover_image_url: communityCover || null,
          is_public: communityPublic,
          created_by: userId,
          invite_code: inviteCode,
          member_count: 1,
        })
        .select()
        .single();

      if (chatErr) throw chatErr;

      const currentFullName = user.fullName || user.username || "User";
      await supabase.from("chat_members").insert({
        chat_id: newChat.id,
        user_id: userId,
        user_email: user.primaryEmailAddress?.emailAddress || "",
        user_name: currentFullName,
        role: "admin",
      });

      toast.success(`Created community "${communityName}"!`);
      setCreateOpen(false);
      navigate(`/chats/${newChat.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create community");
    } finally {
      setCreatingGroup(false);
    }
  };

  const isOtherUserTyping = (conv: any) => {
    if (!conv.typing_users || !conv.otherMember?.clerk_id) return false;
    const typingInfo = conv.typing_users[conv.otherMember.clerk_id];
    if (!typingInfo) return false;
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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 dark:bg-[#08080a] text-slate-800 dark:text-slate-100 font-sans relative">
      
      {/* Center Unified Page Wrapper */}
      <div className="flex-grow flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-[#08080a] relative">
        <div className="max-w-3xl w-full mx-auto px-4 pt-6 pb-28 flex flex-col h-full overflow-y-auto scrollbar-none relative">
          
          {/* Unified Header */}
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div className="flex items-center gap-3 text-left">
              <Link
                to="/dashboard"
                className="p-2.5 rounded-2xl bg-white dark:bg-white/[0.03] hover:bg-slate-100 dark:hover:bg-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-white/5 transition-all flex items-center justify-center cursor-pointer shadow-sm"
                title="Back to Dashboard"
              >
                <ChevronLeft size={18} />
              </Link>
              <div className="text-left">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-display uppercase">
                  {activeTab === "dm" ? "Chats" : activeTab === "communities" ? "Groups" : activeTab === "status" ? "Updates" : activeTab === "settings" ? "Settings" : "You"}
                </h1>
              </div>
            </div>

            {/* Top-Right action button, just like in WhatsApp screenshot */}
            <div className="flex items-center gap-3">
              {activeTab === "you" && myProfile?.one_link_username && (
                <button
                  onClick={() => {
                    const profileUrl = getCanonicalOneLinkUrl(
                      myProfile.one_link_username,
                    );
                    if (navigator.share) {
                      navigator.share({
                        title: `${myProfile.full_name || "Plugsy creator"}'s One Link`,
                        text: "Check out my One Link on Plugsy.",
                        url: profileUrl,
                      }).catch(err => console.log("Error sharing", err));
                    } else {
                      navigator.clipboard.writeText(profileUrl);
                      toast.success("One Link URL copied.");
                    }
                  }}
                  className="p-2.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 text-[#3b82f6] border border-blue-500/20 transition-all cursor-pointer"
                  title="Share Profile Link"
                >
                  <Share2 size={16} />
                </button>
              )}

              {/* Liquid Plus Button for DMs or Communities */}
              {(activeTab === "dm" || activeTab === "communities") && (
                <button
                  onClick={() => {
                    if (activeTab === "dm") setSearchOpen(true);
                    else if (activeTab === "communities") setCreateOpen(true);
                  }}
                  className="w-11 h-11 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white rounded-full shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/35 transition-all cursor-pointer shrink-0"
                  title={activeTab === "dm" ? "Start New Chat" : "Create Community"}
                >
                  <Plus size={22} className="stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>

          {/* Minimal Search Field (only for Chats and Communities filter) */}
          {(activeTab === "dm" || activeTab === "communities") && (
            <div className="mb-6 shrink-0 text-left">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                  <Search size={16} />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={activeTab === "dm" ? "Search chats..." : "Search joined or public communities..."}
                  className="w-full pl-11 pr-4 py-3 bg-white dark:bg-[#16161a] border border-slate-200 dark:border-white/5 rounded-2xl text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:border-slate-300 dark:focus:border-white/15 transition-colors placeholder:text-slate-500 font-medium shadow-sm"
                />
              </div>
            </div>
          )}

          {/* Active Tab Component Renderers */}
          <div className="flex-grow">
            
            {/* 1. CHATS TAB */}
            {activeTab === "dm" && (
              <div className="space-y-4">
                
                {/* Active Now horizontal contact ring */}
                {!loading && dms.filter(d => d.otherMember && isUserOnline(d.otherMember.clerk_id, d.otherMember.last_login_at)).length > 0 && (
                  <div className="mb-6 animate-fade-in text-left shrink-0">
                    <h3 className="text-[10px] font-black uppercase text-[#3B82F6] tracking-wider mb-3 flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      Active Now
                    </h3>
                    <div className="flex overflow-x-auto gap-4 py-1 px-0.5 scrollbar-none snap-x touch-pan-x">
                      {dms
                        .filter(d => d.otherMember && isUserOnline(d.otherMember.clerk_id, d.otherMember.last_login_at))
                        .map((dm) => {
                          const displayName = dm.otherMember?.full_name || dm.otherMember?.username || "Plugsy User";
                          const displayPic = dm.otherMember?.profile_pic_url || dm.otherMember?.image_url;
                          return (
                            <Link
                              key={dm.id}
                              to={`/chats/${dm.id}`}
                              className="flex flex-col items-center gap-1.5 shrink-0 snap-start focus:outline-none group"
                            >
                              <div className="relative p-[2px] rounded-full bg-gradient-to-tr from-emerald-500 via-[#3B82F6] to-cyan-400 group-hover:scale-105 transition-transform duration-300">
                                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#08080a] bg-black/40">
                                  {displayPic ? (
                                    <img src={displayPic} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-[#3B82F6]/10 text-[#3B82F6] text-sm font-black uppercase">
                                      {displayName.slice(0, 2)}
                                    </div>
                                  )}
                                </div>
                                <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#08080a] rounded-full" />
                              </div>
                              <span className="text-[10px] text-slate-500 dark:text-slate-300 font-bold max-w-[60px] truncate text-center group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                {displayName.split(" ")[0]}
                              </span>
                            </Link>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* DMs List */}
                {loading ? (
                  <div className="space-y-3.5">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                        <div className="flex items-center gap-4 min-w-0 flex-grow">
                          <div className="w-12 h-12 rounded-full bg-white/[0.05] animate-pulse shrink-0" />
                          <div className="space-y-2 flex-grow min-w-0">
                            <div className="w-28 h-4 bg-white/[0.05] animate-pulse rounded" />
                            <div className="w-1/2 h-3.5 bg-white/[0.05] animate-pulse rounded" />
                          </div>
                        </div>
                        <div className="w-10 h-3 bg-white/[0.05] animate-pulse rounded shrink-0 self-start mt-1" />
                      </div>
                    ))}
                  </div>
                ) : dms.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-16 bg-white/[0.01] border border-white/5 rounded-3xl p-8">
                    <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center text-[#3B82F6] mb-4 border border-blue-500/10">
                      <MessageCircle size={28} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No conversations yet</h3>
                    <p className="text-sm text-slate-400 max-w-sm mb-6">
                      Start a direct chat with creative designers, template authors, or friends. Click the green button to begin!
                    </p>
                    <button
                      onClick={() => setSearchOpen(true)}
                      className="px-6 py-3 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-blue-500/15"
                    >
                      Find Contacts
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {dms
                      .filter(dm => {
                        const name = dm.otherMember?.full_name || dm.otherMember?.username || "User";
                        return name.toLowerCase().includes(searchQuery.toLowerCase());
                      })
                      .map((dm) => {
                        const displayName = dm.otherMember?.full_name || dm.otherMember?.username || "Plugsy User";
                        const displayPic = dm.otherMember?.profile_pic_url || dm.otherMember?.image_url;
                        const isOnline = dm.otherMember && isUserOnline(dm.otherMember.clerk_id, dm.otherMember.last_login_at);

                        return (
                          <motion.div
                            key={dm.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Link
                              to={`/chats/${dm.id}`}
                              className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-white/[0.01] border border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all group relative overflow-hidden backdrop-blur-md shadow-sm dark:shadow-lg dark:shadow-black/20"
                            >
                              <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#3B82F6] to-cyan-500 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300" />
                              <div className="flex items-center gap-4 min-w-0 flex-grow text-left">
                                <div className="relative shrink-0">
                                  <div className="w-12 h-12 rounded-full overflow-hidden border border-slate-200 dark:border-white/10 bg-black/10 dark:bg-black/40">
                                    {displayPic ? (
                                      <img src={displayPic} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-[#3B82F6]/10 text-[#3B82F6] text-sm font-black uppercase">
                                        {displayName.slice(0, 2)}
                                      </div>
                                    )}
                                  </div>
                                  {isOnline && (
                                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-100 dark:border-[#0c0c0e] rounded-full" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-grow">
                                  <div className="flex items-center gap-1.5">
                                    <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors truncate">
                                      {displayName}
                                    </h4>
                                  </div>
                                  {isOtherUserTyping(dm) ? (
                                    <span className="text-xs text-blue-500 dark:text-blue-400 font-semibold italic animate-pulse">typing...</span>
                                  ) : (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-medium max-w-[240px]">
                                      {dm.last_message || "No messages yet"}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-2 shrink-0 ml-3">
                                <span className="text-[10px] font-semibold text-slate-500">
                                  {getRelativeTime(dm.last_message_at || dm.created_at)}
                                </span>
                                <div className="flex items-center gap-2">
                                  {dm.unread_count > 0 && (
                                    <span className="bg-blue-500 text-white text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                                      {dm.unread_count}
                                    </span>
                                  )}
                                  <button
                                    onClick={(e) => handleDeleteDM(e, dm.id, displayName)}
                                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                    title="Delete Conversation"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            </Link>
                          </motion.div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* 2. STATUS / UPDATES TAB */}
            {activeTab === "status" && (
              <StatusHub 
                onBackToChats={() => setActiveTab("dm")} 
                onProfileClick={handleShowUserProfile} 
              />
            )}

            {/* 3. COMMUNITIES TAB */}
            {activeTab === "communities" && (
              <div className="space-y-6 text-left animate-fade-in">
                {/* My Groups */}
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-3">
                    My Communities ({myGroups.length})
                  </h3>
                  {myGroups.length === 0 ? (
                    <div className="p-8 text-center bg-white dark:bg-[#141416]/40 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                        You haven't joined any communities yet. Click the green plus up top to make one!
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {myGroups
                        .filter(g => g.name?.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((group) => (
                          <Link
                            key={group.id}
                            to={`/chats/${group.id}`}
                            className="flex gap-4 p-4 rounded-2xl bg-white dark:bg-white/[0.01] border border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all text-left backdrop-blur-md shadow-sm dark:shadow-lg dark:shadow-black/20 group relative overflow-hidden"
                          >
                            <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#3B82F6] to-cyan-500 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300" />
                            <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-black/10 dark:bg-black/40 shrink-0">
                              {group.cover_image_url ? (
                                <img src={group.cover_image_url} alt={group.name || "Group"} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-[#3B82F6]/10 text-[#3B82F6] font-extrabold uppercase text-base">
                                  {group.name?.slice(0, 2)}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-grow">
                              <div className="flex items-center gap-1.5">
                                <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">{group.name}</h4>
                                {group.is_public ? <Globe size={11} className="text-slate-500 shrink-0" /> : <Lock size={11} className="text-slate-500 shrink-0" />}
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5 font-medium">{group.description || "Community Chat"}</p>
                              <span className="inline-block text-[10px] text-[#3b82f6] font-black mt-1.5 uppercase tracking-wider">
                                {group.member_count || 1} members
                              </span>
                            </div>
                          </Link>
                        ))}
                    </div>
                  )}
                </div>

                {/* Discover Communities */}
                {discoverGroups.length > 0 && (
                  <div>
                    <h3 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-3 flex items-center gap-1.5">
                      <Compass size={14} />
                      Discover Communities
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {discoverGroups
                        .filter(g => g.name?.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((group) => (
                          <div
                            key={group.id}
                            className="flex flex-col p-4 rounded-2xl bg-white dark:bg-white/[0.01] border border-slate-200 dark:border-white/5 text-left justify-between backdrop-blur-md shadow-sm dark:shadow-lg dark:shadow-black/20 relative overflow-hidden group"
                          >
                            <div className="flex gap-4">
                              <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-black/10 dark:bg-black/40 shrink-0">
                                {group.cover_image_url ? (
                                  <img src={group.cover_image_url} alt={group.name || "Group"} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-[#3B82F6]/10 text-[#3B82F6] font-extrabold uppercase text-base">
                                    {group.name?.slice(0, 2)}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-grow">
                                <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">{group.name}</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 font-medium">{group.description || "No description provided."}</p>
                                <span className="inline-block text-[10px] text-slate-500 font-bold mt-1.5 uppercase tracking-wider">
                                  {group.member_count || 1} members
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => joinGroup(group)}
                              className="w-full mt-4 py-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-slate-800 dark:text-white border border-slate-200 dark:border-white/5 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Plus size={13} /> Join Community
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. SETTINGS TAB */}
            {activeTab === "settings" && (
              <div className="space-y-6 text-left animate-fade-in">
                {/* User profile Summary block */}
                <div className="p-5 rounded-3xl bg-white dark:bg-white/[0.01] border border-slate-200 dark:border-white/5 flex items-center justify-between shadow-sm dark:shadow-none">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-14 h-14 rounded-full overflow-hidden border border-slate-200 dark:border-white/10 bg-black/10 dark:bg-black/40">
                      {profilePic ? (
                        <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#3B82F6]/10 text-[#3B82F6] text-lg font-black uppercase">
                          {(myProfile?.full_name || user?.username || "U").slice(0, 2)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 text-left">
                      <h4 className="font-bold text-base text-slate-900 dark:text-white truncate">{myProfile?.full_name || "Plugsy Member"}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">@{myProfile?.username || "unclaimed"}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1" aria-live="polite">
                    <span className={`text-[10px] px-2 py-1 rounded-xl font-extrabold uppercase tracking-wider border ${
                      accountSyncState === "synced"
                        ? "text-blue-500 bg-blue-500/10 border-blue-500/10"
                        : accountSyncState === "syncing"
                          ? "text-amber-500 bg-amber-500/10 border-amber-500/10"
                          : "text-red-500 bg-red-500/10 border-red-500/10"
                    }`}>
                      {accountSyncState === "synced"
                        ? "Account Synced"
                        : accountSyncState === "syncing"
                          ? "Syncing Account"
                          : "Sync Needed"}
                    </span>
                    {accountSyncState === "needed" && (
                      <button
                        type="button"
                        onClick={() => void confirmAccountSync()}
                        className="text-[10px] font-bold text-red-500 underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>

                {/* Profile Customization Card */}
                <div className="p-5 rounded-3xl bg-white dark:bg-white/[0.01] border border-slate-200 dark:border-white/5 space-y-4 shadow-sm dark:shadow-none">
                  <h3 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1">Profile Biography</h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 dark:text-white/40 tracking-wider block mb-1.5">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={profileFullName}
                        onChange={(e) => {
                          setProfileDraftEdited(true);
                          setProfileFullName(e.target.value);
                        }}
                        className="w-full px-4 py-2.5 text-xs rounded-2xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#141416]/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-slate-300 dark:focus:border-white/10"
                        placeholder="John Doe"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 dark:text-white/40 tracking-wider block mb-1.5 flex items-center gap-1">
                        Chat username
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">@</span>
                        <input
                          type="text"
                          value={profileUsername}
                          onChange={(e) => {
                            setProfileDraftEdited(true);
                            setProfileUsername(e.target.value);
                          }}
                          className="w-full pl-8 pr-4 py-2.5 text-xs rounded-2xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#141416]/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-slate-300 dark:focus:border-white/10"
                          placeholder="your_tag"
                        />
                      </div>
                      <p className="mt-1.5 text-[10px] leading-4 text-slate-500 dark:text-white/35">
                        Used only for your Chat profile and direct-message discovery.
                      </p>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 dark:text-white/40 tracking-wider block mb-1.5">
                        Bio / Status Message
                      </label>
                      <textarea
                        rows={2}
                        value={profileBio}
                        onChange={(e) => {
                          setProfileDraftEdited(true);
                          setProfileBio(e.target.value);
                        }}
                        className="w-full px-4 py-2.5 text-xs rounded-2xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#141416]/50 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-slate-300 dark:focus:border-white/10"
                        placeholder="Share your story or active status..."
                      />
                    </div>

                    <button
                      onClick={handleSaveProfile}
                      className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      Save Profile Details
                    </button>
                  </div>
                </div>

                {/* Preference Options Card */}
                <div className="grid grid-cols-1 gap-4">
                  <div className="p-5 rounded-3xl bg-white dark:bg-white/[0.01] border border-slate-200 dark:border-white/5 space-y-4 shadow-sm dark:shadow-none">
                    <h3 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-2">Preferences</h3>
                    
                    {/* Dark mode switch */}
                    <div className="flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Dark Theme Interface</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Enable modern high-contrast style</p>
                      </div>
                      <button
                        onClick={toggleTheme}
                        className={`w-12 h-6 flex items-center rounded-full p-1 transition-all duration-300 cursor-pointer ${
                          theme === "dark" ? "bg-emerald-500 justify-end" : "bg-slate-700 justify-start"
                        }`}
                      >
                        <motion.div layout className="w-4 h-4 bg-white rounded-full shadow" />
                      </button>
                    </div>

                    <hr className="border-slate-100 dark:border-white/5" />

                    {/* Play sound switch */}
                    <div className="flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Play Chat Sounds</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Alert chime on message reception</p>
                      </div>
                      <button
                        onClick={() => {
                          const newValue = !chatSounds;
                          setChatSounds(newValue);
                          localStorage.setItem("plugsy-chat-sounds", JSON.stringify(newValue));
                          toast.success(newValue ? "Sounds enabled" : "Sounds muted");
                        }}
                        className={`w-12 h-6 flex items-center rounded-full p-1 transition-all duration-300 cursor-pointer ${
                          chatSounds ? "bg-emerald-500 justify-end" : "bg-slate-700 justify-start"
                        }`}
                      >
                        <motion.div layout className="w-4 h-4 bg-white rounded-full shadow" />
                      </button>
                    </div>

                    <hr className="border-slate-100 dark:border-white/5" />

                    {/* Read receipts switch */}
                    <div className="flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Read Receipts</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Allow members to see typing and read states</p>
                      </div>
                      <button
                        onClick={() => {
                          const newValue = !readReceipts;
                          setReadReceipts(newValue);
                          localStorage.setItem("plugsy-read-receipts", JSON.stringify(newValue));
                          toast.success(newValue ? "Read receipts visible" : "Read receipts hidden");
                        }}
                        className={`w-12 h-6 flex items-center rounded-full p-1 transition-all duration-300 cursor-pointer ${
                          readReceipts ? "bg-emerald-500 justify-end" : "bg-slate-700 justify-start"
                        }`}
                      >
                        <motion.div layout className="w-4 h-4 bg-white rounded-full shadow" />
                      </button>
                    </div>
                  </div>

                  {/* Privacy Policy, Terms, Sign Out */}
                  <div className="p-5 rounded-3xl bg-white dark:bg-white/[0.01] border border-slate-200 dark:border-white/5 space-y-4 shadow-sm dark:shadow-none">
                    <h3 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-2">Legal & Account</h3>
                    
                    <div className="flex items-center justify-between py-1 text-sm font-semibold text-slate-800 dark:text-white hover:text-[#3B82F6] dark:hover:text-emerald-400 transition-colors cursor-pointer" onClick={() => navigate("/privacy")}>
                      <span>Privacy Policy</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">View Policy</span>
                    </div>

                    <hr className="border-slate-100 dark:border-white/5" />

                    <div className="flex items-center justify-between py-1 text-sm font-semibold text-slate-800 dark:text-white hover:text-[#3B82F6] dark:hover:text-emerald-400 transition-colors cursor-pointer" onClick={() => navigate("/terms")}>
                      <span>Terms of Service</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">View Terms</span>
                    </div>

                    <hr className="border-slate-100 dark:border-white/5" />

                    <div className="flex items-center justify-between py-1 text-sm font-semibold text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 transition-colors cursor-pointer" onClick={() => {
                      const logoutToast = toast.loading("Logging out...");
                      signOut().then(() => {
                        toast.success("Signed out successfully", { id: logoutToast });
                        navigate("/login");
                      }).catch(() => {
                        toast.error("Logout failed", { id: logoutToast });
                      });
                    }}>
                      <span>Sign Out Account</span>
                      <span className="text-xs text-red-500/60 dark:text-red-400/60 uppercase tracking-widest font-black">Exit</span>
                    </div>
                  </div>
                </div>
              </div>
            )}



          </div>

        </div>
      </div>

      {/* Floating Liquid Glass Bottom Navigation Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] sm:w-[calc(100%-4rem)] max-w-md z-[999] bg-white/70 dark:bg-[#0c0c0e]/75 backdrop-blur-3xl saturate-150 rounded-full p-2 flex justify-between items-center shadow-2xl shadow-black/10 dark:shadow-[0_12px_45px_rgba(0,0,0,0.8)] border border-slate-200 dark:border-white/10">
        
        {/* updates */}
        <button
          onClick={() => {
            setActiveTab("status");
            const url = new URL(window.location.href);
            url.searchParams.set("tab", "status");
            window.history.pushState({}, "", url.toString());
          }}
          className={`flex flex-col items-center gap-1 py-2 px-3 sm:px-4 rounded-full transition-all duration-300 relative cursor-pointer ${
            activeTab === "status" ? "text-blue-500 font-extrabold scale-[1.04]" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          {activeTab === "status" && (
            <motion.div
              layoutId="nav-glow-bubble"
              className="absolute inset-0 bg-slate-100/80 dark:bg-white/[0.05] rounded-full border border-slate-200/50 dark:border-white/5 -z-10"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <CircleDot size={18} className={activeTab === "status" ? "text-blue-500" : ""} />
          <span className="text-[9px] uppercase tracking-wider font-extrabold">Updates</span>
        </button>

        {/* groups */}
        <button
          onClick={() => {
            setActiveTab("communities");
            const url = new URL(window.location.href);
            url.searchParams.set("tab", "communities");
            window.history.pushState({}, "", url.toString());
          }}
          className={`flex flex-col items-center gap-1 py-2 px-3 sm:px-4 rounded-full transition-all duration-300 relative cursor-pointer ${
            activeTab === "communities" ? "text-blue-500 font-extrabold scale-[1.04]" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          {activeTab === "communities" && (
            <motion.div
              layoutId="nav-glow-bubble"
              className="absolute inset-0 bg-slate-100/80 dark:bg-white/[0.05] rounded-full border border-slate-200/50 dark:border-white/5 -z-10"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <Users size={18} className={activeTab === "communities" ? "text-blue-500" : ""} />
          <span className="text-[9px] uppercase tracking-wider font-extrabold">Groups</span>
        </button>

        {/* chats */}
        <button
          onClick={() => {
            setActiveTab("dm");
            const url = new URL(window.location.href);
            url.searchParams.set("tab", "dm");
            window.history.pushState({}, "", url.toString());
          }}
          className={`flex flex-col items-center gap-1 py-2 px-3 sm:px-4 rounded-full transition-all duration-300 relative cursor-pointer ${
            activeTab === "dm" ? "text-blue-500 font-extrabold scale-[1.04]" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          {activeTab === "dm" && (
            <motion.div
              layoutId="nav-glow-bubble"
              className="absolute inset-0 bg-slate-100/80 dark:bg-white/[0.05] rounded-full border border-slate-200/50 dark:border-white/5 -z-10"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <div className="relative">
            <MessageSquare size={18} className={activeTab === "dm" ? "text-blue-500" : ""} />
            {dms.reduce((acc, dm) => acc + (dm.unread_count || 0), 0) > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] bg-emerald-500 text-white font-black text-[8px] rounded-full flex items-center justify-center px-0.5 border border-[#0c0c0e]">
                {dms.reduce((acc, dm) => acc + (dm.unread_count || 0), 0)}
              </span>
            )}
          </div>
          <span className="text-[9px] uppercase tracking-wider font-extrabold">Chats</span>
        </button>

        {/* settings */}
        <button
          onClick={() => {
            setActiveTab("settings");
            const url = new URL(window.location.href);
            url.searchParams.set("tab", "settings");
            window.history.pushState({}, "", url.toString());
          }}
          className={`flex flex-col items-center gap-1 py-2 px-3 sm:px-4 rounded-full transition-all duration-300 relative cursor-pointer ${
            activeTab === "settings" ? "text-blue-500 font-extrabold scale-[1.04]" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          {activeTab === "settings" && (
            <motion.div
              layoutId="nav-glow-bubble"
              className="absolute inset-0 bg-slate-100/80 dark:bg-white/[0.05] rounded-full border border-slate-200/50 dark:border-white/5 -z-10"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <Settings size={18} className={activeTab === "settings" ? "text-blue-500" : ""} />
          <span className="text-[9px] uppercase tracking-wider font-extrabold">Settings</span>
        </button>



      </div>

      {/* NEW CHAT / DIRECT MESSAGE MODAL */}
      <AnimatePresence>
        {searchOpen && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSearchOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-[#0f0f11] rounded-3xl border border-slate-200 dark:border-white/10 p-6 shadow-2xl z-10 text-left"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">New Direct Message</h3>
                <button
                  onClick={() => setSearchOpen(false)}
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors text-slate-300 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Input field */}
              <div className="relative mb-6">
                <Search className="absolute left-3.5 top-3.5 text-slate-500" size={16} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by full name or handle..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/40 text-slate-800 dark:text-white text-sm focus:outline-none focus:border-white/20"
                  autoFocus
                />
              </div>

              {/* Search results */}
              <div className="max-h-60 overflow-y-auto space-y-2">
                {searching ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((p) => (
                    <button
                      key={p.clerk_id}
                      onClick={() => startDM(p)}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-white/10 bg-black/30 shrink-0">
                          {p.profile_pic_url || p.image_url ? (
                            <img
                              src={p.profile_pic_url || p.image_url || ""}
                              alt={p.full_name || ""}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-black uppercase text-[#3B82F6] bg-[#3B82F6]/10">
                              {(p.full_name || p.username || "P").slice(0, 2)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {p.full_name || p.username}
                          </h4>
                          {p.username && (
                            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                              @{p.username}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-blue-500 bg-blue-500/10 px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-all shrink-0">
                        Chat
                      </span>
                    </button>
                  ))
                ) : searchQuery.trim().length >= 2 ? (
                  <div className="py-6 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">
                    No creators found
                  </div>
                ) : searchQuery.trim().length > 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 font-medium">
                    Type at least 2 characters to search...
                  </div>
                ) : (
                  /* SUGGESTED CONTACTS */
                  <div className="space-y-2 text-left">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider mb-2">
                      Suggested Creators
                    </p>
                    {loadingSuggested ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                      </div>
                    ) : suggestedProfiles.length > 0 ? (
                      suggestedProfiles.map((p) => (
                        <button
                          key={p.clerk_id}
                          onClick={() => startDM(p)}
                          className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-all text-left group cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full overflow-hidden border border-white/5 bg-black/30 shrink-0">
                              {p.profile_pic_url || p.image_url ? (
                                <img
                                  src={p.profile_pic_url || p.image_url || ""}
                                  alt={p.full_name || ""}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs font-black uppercase text-blue-500 bg-blue-500/10">
                                  {(p.full_name || p.username || "P").slice(0, 2)}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                {p.full_name || p.username}
                              </h4>
                              {p.username && (
                                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                  @{p.username}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-all shrink-0">
                            Chat
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-slate-600">No suggestions available</p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CREATE GROUP / COMMUNITY MODAL */}
      <AnimatePresence>
        {createOpen && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCreateOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-[#0f0f11] rounded-3xl border border-slate-200 dark:border-white/10 p-6 shadow-2xl z-10 text-left"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create Community</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Start a collaborative room with templates, chats and resources.</p>
                </div>
                <button
                  onClick={() => setCreateOpen(false)}
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors text-slate-300 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Community Name */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Community Name</label>
                  <input
                    type="text"
                    value={communityName}
                    onChange={(e) => setCommunityName(e.target.value)}
                    placeholder="e.g. Graphic Designers Club"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/40 text-slate-800 dark:text-white text-sm focus:outline-none focus:border-white/20"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={communityDesc}
                    onChange={(e) => setCommunityDesc(e.target.value)}
                    placeholder="Describe the topics, templates, or design elements discussed here..."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/40 text-slate-800 dark:text-white text-sm focus:outline-none focus:border-white/20"
                  />
                </div>

                {/* Cover Image Upload */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Cover Image URL (Optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="https://images.unsplash.com/..."
                      value={communityCover}
                      onChange={(e) => setCommunityCover(e.target.value)}
                      className="flex-grow px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/40 text-slate-800 dark:text-white placeholder:text-slate-600 focus:outline-none"
                    />
                    <label className="px-3 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 border border-slate-200 dark:border-white/10">
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={coverUploading}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setCoverUploading(true);
                          const uploadToast = toast.loading("Uploading cover image...");
                          try {
                            const url = await compressAndUpload(file);
                            setCommunityCover(url);
                            toast.success("Cover photo uploaded!", { id: uploadToast });
                          } catch (err: any) {
                            toast.error(err.message || "Failed to upload photo", { id: uploadToast });
                          } finally {
                            setCoverUploading(false);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* Public / Private */}
                <div className="flex items-center justify-between p-3.5 bg-white/[0.02] border border-white/5 rounded-2xl">
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 dark:text-white">Public Discoverability</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">Allow anyone to discover and join this community</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={communityPublic}
                    onChange={(e) => setCommunityPublic(e.target.checked)}
                    className="w-4 h-4 text-blue-500 rounded border-slate-300 focus:ring-blue-500 bg-white"
                  />
                </div>

                <button
                  onClick={handleCreateGroup}
                  disabled={creatingGroup || coverUploading}
                  className="w-full py-3 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
                >
                  {creatingGroup && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Community
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* VIEW OTHER USER'S PROFILE MODAL */}
      <AnimatePresence>
        {userProfileModal && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center px-4">
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
              className="relative w-full max-w-sm bg-[#0c0c0e] rounded-3xl border border-slate-200 dark:border-white/10 p-6 shadow-2xl z-10 text-center"
            >
              <div className="flex justify-end absolute top-4 right-4">
                <button
                  onClick={() => setUserProfileModal(null)}
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors text-slate-300 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="w-20 h-20 rounded-full overflow-hidden border border-slate-200 dark:border-white/10 bg-black/30 mx-auto mt-2 mb-4 shrink-0">
                {userProfileModal.profile_pic_url || userProfileModal.image_url ? (
                  <img
                    src={userProfileModal.profile_pic_url || userProfileModal.image_url || ""}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl font-black uppercase text-[#3B82F6] bg-[#3B82F6]/10">
                    {(userProfileModal.full_name || userProfileModal.username || "P").slice(0, 2)}
                  </div>
                )}
              </div>

              <h3 className="text-lg font-black text-white flex items-center gap-1.5 justify-center">
                {userProfileModal.full_name || "Plugsy User"}
                <ShieldCheck size={16} className="text-[#3b82f6] shrink-0" />
              </h3>
              {userProfileModal.username && (
                <p className="text-xs text-blue-500 font-extrabold uppercase tracking-widest mt-0.5">
                  @{userProfileModal.username}
                </p>
              )}

              <div className="mt-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-left text-xs text-slate-300 max-h-24 overflow-y-auto leading-relaxed font-medium">
                {parseOneLinkProfileBio(userProfileModal.bio).biography || "This creator hasn't written a bio yet."}
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => {
                    setUserProfileModal(null);
                    startDM(userProfileModal);
                  }}
                  className="flex-grow py-3 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <MessageCircle size={14} /> Direct Message
                </button>
                {userProfileModal.one_link_username && (
                  <Link
                    to={`/one/${encodeURIComponent(userProfileModal.one_link_username)}`}
                    className="py-3 px-4 bg-white/5 hover:bg-white/10 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center border border-slate-200 dark:border-white/10"
                    onClick={() => setUserProfileModal(null)}
                  >
                    View OneLink
                  </Link>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
