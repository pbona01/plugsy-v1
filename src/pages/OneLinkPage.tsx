import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useProfile } from "../hooks/useProfile";
import { supabase } from "../lib/supabase";
import { compressAndUpload } from "../utils/uploadMedia";
import OneLinkEditor from "../components/OneLinkEditor";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import toast from "react-hot-toast";
import { 
  ArrowLeft, 
  Sparkles, 
  ShieldCheck, 
  Image as ImageIcon, 
  Lock, 
  Loader2, 
  User as UserIcon,
  Link2,
  ExternalLink
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { LiquidGlass } from "../components/ui/LiquidGlass";
import { cn } from "../lib/utils";

export default function OneLinkPage() {
  useDocumentTitle("Plugsy - OneLink Builder");
  const { userId } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  
  const { profile: myProfile, loading: profileLoading, mutate: mutateProfile } = useProfile(userId || undefined);

  // Local editor states
  const [profilePic, setProfilePic] = useState<string>("");
  const [profileUsername, setProfileUsername] = useState<string>("");
  const [bioText, setBioText] = useState<string>("");
  const [onelinkSettings, setOnelinkSettings] = useState<any>({ theme: "dark-twilight", socials: [], projects: [] });
  const [profileFullName, setProfileFullName] = useState<string>("");
  const [savingBio, setSavingBio] = useState<boolean>(false);
  const [savingTag, setSavingTag] = useState<boolean>(false);

  useEffect(() => {
    if (myProfile) {
      setProfilePic(myProfile.profile_pic_url || myProfile.image_url || "");
      setProfileUsername(myProfile.username || user?.username || "");
      setProfileFullName(myProfile.full_name || "");
      
      let plainBio = myProfile.bio || "";
      let settings = { theme: "dark-twilight" as any, socials: [], projects: [] };
      if (plainBio.startsWith("{")) {
        try {
          const parsed = JSON.parse(plainBio);
          plainBio = parsed.bio || "";
          if (parsed.onelink) {
            settings = parsed.onelink;
          }
        } catch (e) {}
      }
      setBioText(plainBio);
      setOnelinkSettings(settings);
    }
  }, [myProfile, user]);

  const handleCopyLink = () => {
    if (!profileUsername) {
      toast.error("Please claim a Wallet Tag first!");
      return;
    }
    const link = `${window.location.origin}/u/${profileUsername}`;
    navigator.clipboard.writeText(link);
    toast.success("OneLink URL copied to clipboard!");
  };

  const isProfileComplete = !!myProfile?.username;

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading your OneLink settings...</p>
        </div>
      </div>
    );
  }

  return (
    <OneLinkEditor
      username={profileUsername || myProfile.username}
      avatarUrl={profilePic}
      fullName={profileFullName || undefined}
      bioText={bioText}
      initialSettings={onelinkSettings}
      onSave={async (newSettings) => {
        const serialized = JSON.stringify({
          bio: bioText,
          onelink: newSettings
        });
        
        const { error } = await supabase
          .from("profiles")
          .update({ bio: serialized })
          .eq("clerk_id", userId);
          
        if (error) throw error;
        setOnelinkSettings(newSettings);
        await mutateProfile();
        toast.success("OneLink published successfully!");
      }}
    />
  );
}
