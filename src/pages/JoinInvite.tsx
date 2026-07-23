import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { supabase } from "../lib/supabase";
import { motion } from "motion/react";
import { Globe, Lock, Loader2, ArrowRight, ShieldCheck, XCircle, Users } from "lucide-react";
import toast from "react-hot-toast";

interface Community {
  id: string;
  name: string;
  description: string;
  cover_image_url: string | null;
  is_public: boolean;
  member_count: number;
}

export default function JoinInvite() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const { userId } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [group, setGroup] = useState<Community | null>(null);
  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    if (inviteCode) {
      fetchCommunity();
    }
  }, [inviteCode, userId]);

  const fetchCommunity = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("chats")
        .select("*")
        .eq("invite_code", inviteCode)
        .eq("chat_type", "group")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setGroup(null);
        setLoading(false);
        return;
      }

      setGroup(data);

      if (userId) {
        // Check if already a member
        const { data: membership } = await supabase
          .from("chat_members")
          .select("id")
          .eq("chat_id", data.id)
          .eq("user_id", userId)
          .maybeSingle();

        if (membership) {
          setIsMember(true);
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load community details");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!userId || !user || !group) {
      navigate(`/login?redirect=/join/${inviteCode}`);
      return;
    }

    setJoining(true);
    try {
      const currentFullName = user.fullName || user.username || "User";

      // 1. Insert member
      const { error: joinErr } = await supabase.from("chat_members").insert({
        chat_id: group.id,
        user_id: userId,
        user_email: user.primaryEmailAddress?.emailAddress || "",
        user_name: currentFullName,
        role: "member",
      });

      if (joinErr) throw joinErr;

      // 2. Increment member_count
      const { error: rpcErr } = await supabase.rpc("increment_member_count", { chat_id_param: group.id });
      if (rpcErr) {
        await supabase
          .from("chats")
          .update({ member_count: (group.member_count || 0) + 1 })
          .eq("id", group.id);
      }

      toast.success(`Joined community "${group.name}"!`);
      navigate(`/chats/${group.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to join community");
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#141416] rounded-3xl border border-slate-150 dark:border-white/15 overflow-hidden shadow-2xl space-y-6 pb-6 animate-pulse">
          {/* Cover header skeleton */}
          <div className="relative h-40 bg-slate-200 dark:bg-white/10" />

          {/* Group info details skeleton */}
          <div className="px-6 space-y-4">
            <div className="space-y-2">
              <div className="w-2/3 h-6 bg-slate-200 dark:bg-white/10 rounded" />
              <div className="w-1/3 h-4 bg-slate-150 dark:bg-white/5 rounded" />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/5">
              <div className="w-full h-4 bg-slate-150 dark:bg-white/5 rounded" />
              <div className="w-5/6 h-4 bg-slate-150 dark:bg-white/5 rounded" />
            </div>

            {/* Join button skeleton */}
            <div className="w-full h-12 bg-slate-200 dark:bg-white/10 rounded-xl mt-4" />
          </div>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#141416] p-8 rounded-3xl border border-slate-150 dark:border-white/5 text-center shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 dark:bg-red-500/5 rounded-full flex items-center justify-center text-red-500 mx-auto mb-6 border border-red-500/10">
            <XCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 font-display">
            Invalid Invite Link
          </h2>
          <p className="text-sm text-slate-500 dark:text-[#a1a1a1] mb-6">
            This invite link is invalid, has expired, or the community has been deactivated.
          </p>
          <Link
            to="/chats"
            className="inline-block w-full py-3 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
          >
            Back to Hub
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="max-w-md w-full bg-white dark:bg-[#141416] rounded-3xl border border-slate-150 dark:border-white/15 overflow-hidden shadow-2xl"
      >
        {/* Cover */}
        <div className="relative h-40 bg-gradient-to-r from-blue-600 to-indigo-600">
          {group.cover_image_url && (
            <img
              src={group.cover_image_url}
              alt={group.name}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md text-white text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full flex items-center gap-1.5 border border-white/10">
            {group.is_public ? (
              <>
                <Globe size={11} />
                Public
              </>
            ) : (
              <>
                <Lock size={11} />
                Private
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 text-center text-left">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-2 text-center font-display">
            {group.name}
          </h2>
          <p className="text-xs text-slate-400 dark:text-[#a1a1a1] uppercase font-bold tracking-widest text-center mb-6 flex items-center justify-center gap-1.5">
            <Users size={12} />
            {group.member_count || 1} Members
          </p>

          <div className="bg-slate-50 dark:bg-black/20 p-5 rounded-2xl border border-slate-200/50 dark:border-white/5 mb-6 text-left">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              About this community
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {group.description || "No description provided."}
            </p>
          </div>

          {isMember ? (
            <button
              onClick={() => navigate(`/chats/${group.id}`)}
              className="w-full py-3.5 bg-green-600 hover:bg-green-700 active:scale-95 text-white text-xs uppercase tracking-widest font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Open Chat Room
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full py-3.5 bg-[#3b82f6] hover:bg-[#2563eb] active:scale-95 text-white text-xs uppercase tracking-widest font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {joining ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : userId ? (
                <>
                  Join Community
                  <ArrowRight size={14} />
                </>
              ) : (
                <>
                  Sign in to Join
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
