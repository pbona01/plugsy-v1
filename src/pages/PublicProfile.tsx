import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { supabase } from "../lib/supabase";
import { motion } from "motion/react";
import { MessageSquare, Loader2, UserX, User, ArrowLeft, Award, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { useOnlinePresence } from "../contexts/OnlinePresenceContext";
import { THEME_PRESETS } from "../constants/onelink-themes";
import { getPlatformIcon } from "../utils/onelink";

interface Profile {
  clerk_id: string;
  username: string | null;
  full_name: string | null;
  profile_pic_url: string | null;
  image_url: string | null;
  bio: string | null;
  last_login_at: string | null;
}

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>();
  const { userId } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const { isUserOnline } = useOnlinePresence();


  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [startingChat, setStartingChat] = useState(false);
  const [activeMedal, setActiveMedal] = useState<any>(null);
  const [medalNumber, setMedalNumber] = useState<number | null>(null);

  useEffect(() => {
    if (username) {
      fetchProfile();
    }
  }, [username]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username.toLowerCase())
        .maybeSingle();

      if (error) throw error;
      setProfile(data);

      if (data) {
        try {
          const res = await fetch(`/api/payments?action=get-medal-status&userId=${data.clerk_id}`);
          const medalData = await res.json();
          if (medalData?.success && medalData?.medal) {
            setActiveMedal(medalData.medal);
            setMedalNumber(medalData.medalNumber);
          }
        } catch (mErr) {
          console.warn("Error fetching profile active medal:", mErr);
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load user profile");
    } finally {
      setLoading(false);
    }
  };

  const handleMessage = async () => {
    if (!userId || !user) {
      navigate(`/login?redirect=/u/${username}`);
      return;
    }

    if (!profile) return;

    if (profile.clerk_id === userId) {
      toast.error("You cannot send a message to yourself!");
      return;
    }

    setStartingChat(true);
    try {
      // 1. Check if direct chat already exists
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
            .eq("user_id", profile.clerk_id)
            .limit(1);

          if (mutualChat && mutualChat.length > 0) {
            mutualChatId = mutualChat[0].chat_id;
          }
        }
      }

      if (mutualChatId) {
        navigate(`/chats/${mutualChatId}`);
      } else {
        // 2. Create new DM chat
        const { data: newChat, error: chatErr } = await supabase
          .from("chats")
          .insert({ chat_type: "dm" })
          .select()
          .single();

        if (chatErr) throw chatErr;

        // 3. Insert both members
        const currentFullName = user.fullName || user.username || "User";
        const otherFullName = profile.full_name || profile.username || "User";

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
            user_id: profile.clerk_id,
            user_email: "",
            user_name: otherFullName,
            role: "member",
          },
        ]);

        if (memErr) throw memErr;

        navigate(`/chats/${newChat.id}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to start direct message");
    } finally {
      setStartingChat(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-4">
        <div className="w-24 h-4 bg-slate-200 dark:bg-white/5 animate-pulse rounded mb-6" />

        <div className="max-w-md w-full bg-white dark:bg-[#141416] rounded-3xl border border-slate-150 dark:border-white/15 p-6 md:p-8 text-center shadow-2xl space-y-6">
          {/* Profile Pic Circle */}
          <div className="mx-auto w-28 h-28 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse" />

          {/* Title and Username */}
          <div className="space-y-2 flex flex-col items-center">
            <div className="w-48 h-6 bg-slate-200 dark:bg-white/10 animate-pulse rounded" />
            <div className="w-24 h-3.5 bg-blue-500/20 dark:bg-blue-500/10 animate-pulse rounded" />
          </div>

          {/* Bio block */}
          <div className="bg-slate-50 dark:bg-black/20 p-5 rounded-2xl border border-slate-200/50 dark:border-white/5 space-y-2 text-left">
            <div className="w-10 h-2.5 bg-slate-200 dark:bg-white/10 animate-pulse rounded" />
            <div className="w-full h-4 bg-slate-200 dark:bg-white/10 animate-pulse rounded" />
            <div className="w-2/3 h-4 bg-slate-200 dark:bg-white/10 animate-pulse rounded" />
          </div>

          {/* Action button */}
          <div className="w-full h-12 bg-slate-200 dark:bg-white/10 animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#141416] p-8 rounded-3xl border border-slate-150 dark:border-white/5 text-center shadow-2xl">
          <div className="w-16 h-16 bg-amber-500/10 dark:bg-amber-500/5 rounded-full flex items-center justify-center text-amber-500 mx-auto mb-6 border border-amber-500/10">
            <UserX size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 font-display">
            User Not Found
          </h2>
          <p className="text-sm text-slate-500 dark:text-[#a1a1a1] mb-6">
            The profile for user "@{username}" could not be found. Check the spelling or link.
          </p>
          <Link
            to="/chats"
            className="inline-block w-full py-3 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
          >
            Go to Hub
          </Link>
        </div>
      </div>
    );
  }

  let bioText = profile.bio || "";
  let onelink: any = null;

  if (profile.bio && profile.bio.startsWith("{")) {
    try {
      const parsed = JSON.parse(profile.bio);
      bioText = parsed.bio || "";
      onelink = parsed.onelink || null;
    } catch (e) {
      // Stored as regular bio string
    }
  }

  const displayPic = profile.profile_pic_url || profile.image_url;
  const displayName = profile.full_name || profile.username || "Plugsy Creator";

  // Use the custom theme if they have configured OneLink, otherwise fall back to premium default "dark-twilight" styling
  const activePreset = onelink?.theme && THEME_PRESETS[onelink.theme as keyof typeof THEME_PRESETS]
    ? THEME_PRESETS[onelink.theme as keyof typeof THEME_PRESETS]
    : THEME_PRESETS["dark-twilight"];

  return (
    <div className={`min-h-[calc(100vh-4rem)] w-full flex flex-col items-center justify-center p-4 transition-all duration-500 ${activePreset.background}`}>
      
      {/* Top Back Nav */}
      {/* Back to Hub removed to make the portfolio look standalone */}

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 15 }}
        className={`max-w-md w-full rounded-3xl border p-6 md:p-8 text-center shadow-2xl relative ${(activePreset as any).cardBg || activePreset.buttonBg}`}
      >
        {/* Profile Pic with spring float hover */}
        <motion.div 
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300, damping: 10 }}
          className="relative mx-auto w-28 h-28 mb-4 shrink-0"
        >
          <div className="w-full h-full rounded-full overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/30 shadow-md">
            {displayPic ? (
              <img src={displayPic} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-200 dark:bg-black/40">
                <User size={36} />
              </div>
            )}
          </div>
          {isUserOnline(profile.clerk_id, profile.last_login_at) && (
            <span className="absolute bottom-1 right-1 w-6 h-6 bg-emerald-500 border-4 border-white dark:border-[#141416] rounded-full shadow-[0_0_12px_rgba(16,185,129,0.8)] z-10 flex items-center justify-center">
              <span className="absolute w-full h-full bg-emerald-400 rounded-full animate-ping opacity-75"></span>
            </span>
          )}
        </motion.div>

        {/* Info & Medal Tier Badge */}
        <h2 className={`text-2xl font-black mb-1 font-display tracking-tight ${activePreset.textPrimary}`}>
          {displayName}
        </h2>
        <p className={`text-xs font-black uppercase tracking-widest mb-4 ${(activePreset as any).previewBtn || activePreset.textSecondary}`}>
          @{profile.username}
        </p>

        {activeMedal && (
          <div className="flex justify-center mb-5">
            <span className={`text-[10px] font-mono font-black uppercase tracking-wider px-3.5 py-1.5 rounded-xl border flex items-center gap-1.5 shadow-sm ${
              activeMedal.name.includes("Gold") ? "bg-amber-400/10 text-amber-500 border-amber-400/20" :
              activeMedal.name.includes("Silver") ? "bg-zinc-400/10 text-zinc-400 border-zinc-300/25" :
              "bg-orange-500/10 text-orange-400 border-orange-500/25"
            }`}>
              <Award size={13} className="shrink-0 animate-pulse" />
              {activeMedal.name} #{medalNumber?.toString().padStart(3, "0")}
            </span>
          </div>
        )}

        {/* Bio Block */}
        <div className="p-5 rounded-2xl bg-white/[0.01] border border-white/5 mb-5 text-left">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
            Bio
          </h4>
          <p className={`text-sm leading-relaxed ${activePreset.textSecondary}`}>
            {bioText || "This creator hasn't written a bio yet."}
          </p>
        </div>

        {/* Custom Social Shortcuts Row with Spring Pop Animation */}
        {onelink?.socials && onelink.socials.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {onelink.socials.map((social: any) => (
              <motion.a
                key={social.id}
                href={social.url}
                target="_blank"
                rel="noreferrer"
                whileHover={{ scale: 1.15, rotate: 3 }}
                whileTap={{ scale: 0.95 }}
                className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all border shadow-sm cursor-pointer ${(activePreset as any).accent || activePreset.buttonBg}`}
                title={`Visit ${social.platform}`}
              >
                {getPlatformIcon(social.platform)}
              </motion.a>
            ))}
          </div>
        )}

        {/* Custom Bento Links & Featured Projects with Spring Physics */}
        {onelink?.projects && onelink.projects.length > 0 && (
          <div className="space-y-3 mb-6">
            {onelink.projects.map((proj: any) => (
              <motion.a
                key={proj.id}
                href={proj.url}
                target="_blank"
                rel="noreferrer"
                whileHover={{ scale: 1.025, x: 2 }}
                whileTap={{ scale: 0.985 }}
                className={`w-full p-4 rounded-2xl flex flex-col justify-center text-left transition-all border cursor-pointer hover:shadow-md ${activePreset.buttonBg}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-black ${activePreset.textPrimary}`}>
                    {proj.title}
                  </span>
                  <ExternalLink size={13} className={activePreset.textSecondary} />
                </div>
                {proj.description && (
                  <p className={`text-xs mt-1 leading-relaxed ${activePreset.textSecondary}`}>
                    {proj.description}
                  </p>
                )}
              </motion.a>
            ))}
          </div>
        )}

        {/* Send Direct Message Action Button */}
        {profile.clerk_id !== userId && (
          <button
            onClick={handleMessage}
            disabled={startingChat}
            className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white text-xs uppercase tracking-widest font-black rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-500/15 border border-blue-400/20"
          >
            {startingChat ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <MessageSquare size={14} />
                Send Message
              </>
            )}
          </button>
        )}

        {/* Branded Footer */}
        <div style={{
          textAlign: "center",
          marginTop: "48px",
          paddingBottom: "24px"
        }}>
          <a
            href="https://www.plugsy.ng"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "rgba(255,255,255,0.35)",
              fontSize: "11px",
              textDecoration: "none",
              letterSpacing: "0.05em"
            }}
          >
            <span style={{ fontWeight: 700 }}>⚡</span>
            Powered by Plugsy
          </a>
        </div>

      </motion.div>
    </div>
  );
}
