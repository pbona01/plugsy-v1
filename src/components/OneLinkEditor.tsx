import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { 
  Github, 
  Linkedin, 
  Instagram, 
  Youtube, 
  Globe, 
  Plus, 
  Trash2, 
  ExternalLink, 
  Sparkles, 
  Link2, 
  Palette, 
  Layout, 
  FolderPlus,
  ArrowLeft,
  Share2,
  Settings,
  BarChart3,
  User,
  Smartphone
} from "lucide-react";
import { OneLinkSettings, OneLinkSocial, OneLinkProject } from "../types";
import toast from "react-hot-toast";
import { THEME_PRESETS } from "../constants/onelink-themes";
import { getPlatformIcon } from "../utils/onelink";
import { cn } from "../lib/utils";

interface OneLinkEditorProps {
  initialSettings: OneLinkSettings;
  username: string;
  avatarUrl?: string;
  fullName?: string;
  bioText?: string;
  onSave: (settings: OneLinkSettings) => Promise<void>;
}

const SECTIONS = [
  { id: "page", label: "My Page", icon: "👤" },
  { id: "design", label: "Design", icon: "🎨" },
  { id: "links", label: "Links & Socials", icon: "🔗" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "settings", label: "Settings", icon: "⚙️" }
];

export default function OneLinkEditor({
  initialSettings,
  username,
  avatarUrl,
  fullName,
  bioText,
  onSave
}: OneLinkEditorProps) {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("page");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [theme, setTheme] = useState<OneLinkSettings["theme"]>(initialSettings.theme || "dark-twilight");
  const [socials, setSocials] = useState<OneLinkSocial[]>(initialSettings.socials || []);
  const [projects, setProjects] = useState<OneLinkProject[]>(initialSettings.projects || []);
  
  const [saving, setSaving] = useState(false);
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  
  const activePreset = THEME_PRESETS[theme];

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedSettings: OneLinkSettings = {
        theme,
        socials,
        projects
      };
      await onSave(updatedSettings);
      toast.success("OneLink published successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to publish OneLink settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0a0c] overflow-hidden text-white">
      {/* LEFT: Editor sidebar */}
      <div className="w-[320px] flex-shrink-0 border-r border-white/8 flex flex-col overflow-y-auto">
        {/* Top: Logo/back + nav */}
        <div className="p-5 border-b border-white/8">
            <div className="flex items-center gap-3 mb-6">
                <ArrowLeft size={16} className="text-white/50 cursor-pointer" onClick={() => navigate(-1)} />
                <span className="font-bold">OneLink</span>
            </div>
            <div className="bg-white/5 rounded-lg p-3 text-xs text-white/50 flex justify-between items-center">
                <span>plugsy.ng/one/{username}</span>
                <Share2 size={14} />
            </div>
        </div>

        {/* Section Navigation */}
        <nav className="flex-1 py-4">
          {SECTIONS.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "flex items-center gap-4 w-full px-6 py-4 border-l-[3px] text-sm font-medium transition-all",
                activeSection === section.id 
                  ? "bg-red-500/10 border-red-500 text-white" 
                  : "border-transparent text-white/50 hover:text-white hover:bg-white/5"
              )}
            >
              <span className="text-xl">{section.icon}</span>
              {section.label}
            </button>
          ))}
        </nav>

        {/* Section Content Area */}
        <div className="p-6 border-t border-white/8 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
          {activeSection === "page" && (
            <motion.div
              key="page"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <h3 className="font-bold text-sm">My Page</h3>
              <input type="text" placeholder="Full Name" value={fullName || ""} className="w-full bg-white/5 p-3 rounded-lg text-sm" />
              <textarea placeholder="Bio" value={bioText || ""} className="w-full bg-white/5 p-3 rounded-lg text-sm" rows={3} />
            </motion.div>
          )}
          {activeSection === "design" && (
            <motion.div
              key="design"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <h3 className="font-bold text-sm">Design</h3>
              {Object.entries(THEME_PRESETS).map(([key, value]) => (
                <button key={key} onClick={() => setTheme(key as any)} className={cn("w-full p-3 rounded-lg text-sm text-left", theme === key ? "bg-white/10" : "bg-white/5")}>
                  {value.name}
                </button>
              ))}
            </motion.div>
          )}
          {activeSection === "links" && (
            <motion.div
              key="links"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="text-sm"
            >
              Links Section (Work in Progress)
            </motion.div>
          )}
          {activeSection === "analytics" && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="text-sm"
            >
              Analytics Section (Work in Progress)
            </motion.div>
          )}
          {activeSection === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="text-sm"
            >
              Settings Section (Work in Progress)
            </motion.div>
          )}
        </AnimatePresence>
        </div>

        {isMobile && (
          <button
            onClick={() => setShowPreviewModal(true)}
            className="fixed bottom-20 right-6 bg-red-500 text-white p-4 rounded-full shadow-lg z-50"
          >
            👁 Preview
          </button>
        )}

        {/* Sticky Bottom Actions */}
        <div className="p-6 border-t border-white/8 space-y-3">
          <button className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold">View Live</button>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-red-500 hover:bg-red-600 rounded-xl text-sm font-bold"
          >
            {saving ? "Publishing..." : "Share Link"}
          </button>
        </div>
      </div>

      {/* RIGHT: Live preview */}
      <div className={cn("flex-1 flex items-center justify-center bg-[radial-gradient(circle_at_50%_30%,rgba(239,68,68,0.08),transparent_60%)] overflow-y-auto p-10", isMobile && "hidden")}>
        {/* Phone-frame preview */}
        <div className="w-[300px] h-[600px] rounded-[3rem] border-[8px] border-black bg-black shadow-2xl overflow-hidden relative">
             <div className={`w-full h-full p-6 flex flex-col items-center text-center overflow-y-auto ${activePreset.background}`}>
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/10 mb-4 shrink-0 bg-white/5">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/50 text-2xl font-bold">
                    {(fullName || username || "?")[0].toUpperCase()}
                  </div>
                )}
              </div>
              <h4 className={`text-lg font-black tracking-tight ${activePreset.textPrimary}`}>
                {fullName || "Your Name"}
              </h4>
              <p className={`text-xs mt-1 ${activePreset.textSecondary}`}>
                @{username || "username"}
              </p>
              {bioText && (
                <p className={`text-xs mt-4 leading-relaxed ${activePreset.textSecondary}`}>
                  {bioText}
                </p>
              )}
              <div className="w-full h-[1px] bg-white/5 my-6" />
              <div className="w-full space-y-3">
                {projects.map((proj) => (
                    <div key={proj.id} className={`w-full p-4 rounded-2xl flex justify-between items-center ${activePreset.buttonBg}`}>
                        <span className={`text-sm font-bold ${activePreset.textPrimary}`}>{proj.title}</span>
                        <ExternalLink size={14} />
                    </div>
                ))}
              </div>
            </div>
        </div>
      </div>
      
      {/* Mobile Preview Modal */}
      {isMobile && showPreviewModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] p-4 flex flex-col justify-end" onClick={() => setShowPreviewModal(false)}>
            <div className="bg-[#0a0a0c] rounded-t-3xl h-[80vh] p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between mb-4">
                    <h3 className="font-bold">Live Preview</h3>
                    <button onClick={() => setShowPreviewModal(false)}>✕</button>
                </div>
                 <div className="w-[300px] h-[500px] rounded-[3rem] border-[8px] border-black bg-black shadow-2xl overflow-hidden mx-auto">
                    <div className={`w-full h-full p-6 flex flex-col items-center text-center overflow-y-auto ${activePreset.background}`}>
                        <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/10 mb-4 shrink-0 bg-white/5">
                            {avatarUrl ? (
                            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/50 text-2xl font-bold">
                                {(fullName || username || "?")[0].toUpperCase()}
                            </div>
                            )}
                        </div>
                        <h4 className={`text-lg font-black tracking-tight ${activePreset.textPrimary}`}>
                            {fullName || "Your Name"}
                        </h4>
                        <p className={`text-xs mt-1 ${activePreset.textSecondary}`}>
                            @{username || "username"}
                        </p>
                    </div>
                 </div>
            </div>
        </div>
      )}
    </div>
  );
}
