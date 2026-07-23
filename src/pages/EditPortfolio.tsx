import React, { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { Helmet } from "react-helmet-async";
import { supabase } from "../lib/supabase";
import { VPPortfolio, VPCustomCategory } from "../types/verification";
import { PublicPortfolio } from "./PublicPortfolio";
import { THEMES } from "../utils/verification";
import { SkeletonCard } from "../components/Skeleton";
import { Settings, X, Monitor, Tablet, Smartphone, Video, Play } from "lucide-react";
import { usePortfolioAccess } from "../lib/PortfolioContext";
import { LiquidGlass } from "../components/ui/LiquidGlass";
import { showToast } from "../components/Toast";
import { motion, AnimatePresence } from "framer-motion";

import { TabIdentity } from "../components/verification/editor/TabIdentity";
import { TabWork } from "../components/verification/editor/TabWork";
import { TabLinks } from "../components/verification/editor/TabLinks";
import { TabAnalytics } from "../components/verification/editor/TabAnalytics";
import { TabPublish } from "../components/verification/editor/TabPublish";

export function EditPortfolio() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();
  const { isPortfolioUnlocked } = usePortfolioAccess();
  
  const [portfolio, setPortfolio] = useState<VPPortfolio | null>(null);
  const [categories, setCategories] = useState<VPCustomCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"Saved ✓" | "Saving..." | "">("");
  
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'IDENTITY' | 'WORK' | 'LINKS' | 'ANALYTICS' | 'PUBLISH'>('IDENTITY');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [tutorialVideoUrl, setTutorialVideoUrl] = useState("https://res.cloudinary.com/doit6oaze/video/upload/v1782272301/VID-20260623-WA0147_h41hjz.mp4");

  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (isLoaded) {
      if (!user) {
        navigate("/login");
        return;
      }
      if (id) {
        loadData();
      }
    }
  }, [isLoaded, user, id]);

  const loadData = async () => {
    try {
      const { data: port, error } = await supabase
        .from("vp_portfolios")
        .select("*")
        .eq("id", id)
        .single();
        
      if (error) throw error;
      if (port.user_id !== user?.id) {
        navigate("/portfolio");
        return;
      }
      
      setPortfolio(port);

      const { data: cats } = await supabase
        .from("vp_custom_categories")
        .select("*")
        .eq("portfolio_id", id)
        .order("order_index");
        
      setCategories(cats || []);

      // Load custom tutorial URL from site settings if available
      try {
        const { data: settingsData } = await supabase
          .from("site_settings")
          .select("*")
          .limit(100);

        if (settingsData && settingsData.length > 0) {
          const legacyRow = settingsData.find((s: any) => s.setting_key === 'portfolio_tutorial_url');
          if (legacyRow && legacyRow.setting_value) {
            setTutorialVideoUrl(legacyRow.setting_value);
          } else if (settingsData[0].portfolio_tutorial_url) {
            setTutorialVideoUrl(settingsData[0].portfolio_tutorial_url);
          }
        }
      } catch (settingsErr) {
        console.warn("Failed to load custom portfolio tutorial URL:", settingsErr);
      }
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const updatePortfolio = (updates: Partial<VPPortfolio>) => {
    if (!portfolio) return;
    const newData = { ...portfolio, ...updates };
    setPortfolio(newData as VPPortfolio);
    setSaveStatus("Saving...");
    window.dispatchEvent(new CustomEvent('vp-portfolio-updated'));
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const dbPayload: any = { ...updates, updated_at: new Date().toISOString() };
      delete dbPayload.avatarUrl;
      delete dbPayload.bioImage;
      delete dbPayload.longBio;
      
      const { error } = await supabase.from("vp_portfolios").update(dbPayload).eq("id", portfolio.id);
      if (error) {
        console.error("Error updating portfolio:", error);
      }
      setSaveStatus("Saved ✓");
      window.dispatchEvent(new CustomEvent('vp-portfolio-updated'));
      setTimeout(() => setSaveStatus(""), 2000);
    }, 1000);
  };

  if (!isLoaded || loading || !portfolio) return (
    <div className="p-8 mt-12 max-w-4xl mx-auto space-y-4">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );

  const currentTheme = THEMES[portfolio.color_theme] || THEMES.modern;

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: currentTheme.bg }}>
      <Helmet>
        <title>Plugsy - Edit Portfolio</title>
      </Helmet>
      
      {/* Live Builder Top Bar */}
      <div className="bg-brand-text text-brand-surface px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-[100] shadow-md border-b border-gray-800 overflow-x-auto no-scrollbar gap-4">
        <div className="flex items-center gap-4 shrink-0">
          <Link to="/portfolio" className="text-gray-400 hover:text-white transition text-xs font-bold tracking-wider uppercase">
            <span className="md:hidden">←</span>
            <span className="hidden md:inline">← Dashboard</span>
          </Link>
          <div className="w-px h-4 bg-gray-800 hidden md:block"></div>
          <span className="font-bold text-xs uppercase tracking-widest hidden md:inline truncate max-w-[150px]">{portfolio.full_name || 'Untitled Portfolio'}</span>
        </div>
        
        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden md:flex items-center bg-gray-900 rounded-md p-1 shrink-0">
            <button onClick={() => setPreviewDevice('desktop')} className={`p-1.5 rounded ${previewDevice === 'desktop' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>
              <Monitor size={14} />
            </button>
            <button onClick={() => setPreviewDevice('tablet')} className={`p-1.5 rounded ${previewDevice === 'tablet' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>
              <Tablet size={14} />
            </button>
            <button onClick={() => setPreviewDevice('mobile')} className={`p-1.5 rounded ${previewDevice === 'mobile' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>
              <Smartphone size={14} />
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden md:inline text-xs uppercase tracking-widest font-bold text-gray-400">Mode:</span>
            <button 
              onClick={() => setIsEditMode(true)} 
              className={`px-3 py-1.5 md:py-1 text-[10px] font-bold tracking-wider uppercase rounded transition ${isEditMode ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white bg-gray-900 md:bg-transparent'}`}
            >
              Build
            </button>
            <button 
              onClick={() => setIsEditMode(false)} 
              className={`px-3 py-1.5 md:py-1 text-[10px] font-bold tracking-wider uppercase rounded transition ${!isEditMode ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-white bg-gray-900 md:bg-transparent'}`}
            >
              <span className="hidden md:inline">View as Client</span>
              <span className="md:hidden">View</span>
            </button>
          </div>

          <div className="w-px h-4 bg-gray-800 hidden md:block"></div>

          {saveStatus && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-green-400 shrink-0 min-w-[60px] text-right">
              {saveStatus}
            </span>
          )}

          <button
            onClick={() => setIsTutorialOpen(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#EF4444]/30 bg-[#EF4444]/10 hover:bg-[#EF4444]/20 text-[#EF4444] transition shadow-sm cursor-pointer"
          >
            <Video size={14} />
            <span className="hidden md:inline text-[10px] font-bold tracking-widest uppercase">Setup Guide</span>
            <span className="md:hidden text-[10px] font-bold tracking-widest uppercase">Guide</span>
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded transition shadow-sm ${showSettings ? 'border border-gray-600 bg-gray-800 text-white' : 'border border-gray-800 text-gray-400 hover:text-white hover:bg-gray-900'}`}
          >
            <Settings size={14} />
            <span className="hidden md:inline text-[10px] font-bold tracking-widest uppercase">Settings</span>
          </button>

          <div className="hidden md:flex items-center gap-2 min-w-[80px] justify-end shrink-0">
             {saveStatus === 'Saving...' && <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider animate-pulse">{saveStatus}</span>}
             {saveStatus === 'Saved ✓' && <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">{saveStatus}</span>}
          </div>
        </div>
      </div>
          {/* Settings Overlay Slide-Out Menu */}
      {showSettings && (
        <>
          {/* Backdrop on mobile */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[240] md:hidden"
            onClick={() => setShowSettings(false)}
          />
          <LiquidGlass
            blur={24}
            chromaticAberration={2}
            className="fixed bottom-0 left-0 right-0 md:top-0 md:bottom-auto md:right-0 md:left-auto h-[82vh] md:h-screen w-full md:w-[420px] z-[250] border-t md:border-t-0 md:border-l shadow-2xl flex flex-col rounded-t-[2.5rem] md:rounded-none overflow-hidden transition-all duration-300"
            style={{
              backgroundColor: "var(--brand-card)",
              borderColor: "var(--brand-border)"
            }}
          >
            {/* Handle Bar for mobile drawer */}
            <div className="w-12 h-1.5 bg-neutral-300 dark:bg-neutral-800 rounded-full mx-auto my-3 md:hidden shrink-0 opacity-80" />
            
            <div className="flex items-center justify-between p-4 border-b border-brand-border dark:border-neutral-800 shrink-0">
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-brand-text" />
                <span className="font-bold text-xs uppercase tracking-widest text-brand-text">App Settings</span>
              </div>
              <button onClick={() => setShowSettings(false)} className="portfolio-btn p-2 bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 rounded-lg text-brand-text shadow-sm flex items-center justify-center">
                <X size={16} />
                <span className="sr-only">Close Settings</span>
              </button>
            </div>
            
            <div className="flex items-center border-b border-brand-border dark:border-neutral-800 shrink-0 overflow-x-auto no-scrollbar px-2 bg-gray-50 dark:bg-neutral-900">
              {['IDENTITY', 'WORK', 'LINKS', 'ANALYTICS', 'PUBLISH'].map(t => (
                <button 
                  key={t}
                  onClick={() => setActiveTab(t as any)}
                  className={`portfolio-btn px-3 py-3 text-[10px] font-bold tracking-[0.15em] uppercase whitespace-nowrap border-b-[2px] transition ${activeTab === t ? 'text-brand-text border-black dark:border-white' : 'text-gray-400 dark:text-neutral-500 border-transparent hover:text-gray-700 dark:hover:text-gray-300'}`}
                >{t}</button>
              ))}
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 text-brand-text bg-brand-bg pb-24 md:pb-6">
              {activeTab === 'IDENTITY' && <TabIdentity portfolio={portfolio} updatePortfolio={updatePortfolio} />}
              {activeTab === 'WORK' && <TabWork portfolio={portfolio} categories={categories} setCategories={setCategories} updatePortfolio={updatePortfolio} />}
              {activeTab === 'LINKS' && <TabLinks portfolio={portfolio} updatePortfolio={updatePortfolio} />}
              {activeTab === 'ANALYTICS' && <TabAnalytics portfolio={portfolio} />}
              {activeTab === 'PUBLISH' && <TabPublish portfolio={portfolio} updatePortfolio={updatePortfolio} />}
            </div>
            
            <div 
              className="absolute bottom-0 left-0 right-0 border-t p-4 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-10px_20px_rgba(0,0,0,0.4)]"
              style={{
                backgroundColor: "var(--brand-card)",
                borderColor: "var(--brand-border)"
              }}
            >
              <button onClick={() => setShowSettings(false)} className="portfolio-btn w-full bg-black dark:bg-white text-white dark:text-black py-4 rounded-xl font-bold text-xs tracking-widest uppercase cursor-pointer">
                Save & Close Settings
              </button>
            </div>
          </LiquidGlass>
        </>
      )}

      {/* Render the actual portfolio with editing capabilities enabled */}
      <div className={`mx-auto transition-all duration-300 ${previewDevice === 'mobile' ? 'max-w-[400px] border-x border-brand-border/20 shadow-2xl' : previewDevice === 'tablet' ? 'max-w-[768px] border-x border-brand-border/20 shadow-2xl' : 'w-full'}`}>
        <PublicPortfolio 
          slugOrId={portfolio.slug} 
          previewData={portfolio} 
          previewMode={true} 
          isEditMode={isEditMode}
          onUpdatePortfolio={updatePortfolio}
        />
      </div>

      {/* Floating 'How to Setup' Button */}
      <button
        onClick={() => setIsTutorialOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-brand-accent hover:bg-brand-accent/90 text-white font-black uppercase tracking-widest text-xs px-5 py-3.5 rounded-full shadow-lg shadow-brand-accent/30 transition-all hover:scale-105 cursor-pointer border border-white/10"
      >
        <Play size={14} fill="currentColor" />
        <span>How to Setup</span>
      </button>

      {/* Video Tutorial Overlay */}
      <AnimatePresence>
        {isTutorialOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[300] flex items-center justify-center p-4"
            onClick={() => setIsTutorialOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-[var(--brand-card)] border border-brand-border rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative flex flex-col gap-4 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-brand-border pb-4">
                <div className="flex items-center gap-2 text-left">
                  <span className="p-1.5 rounded-lg bg-red-500/10 text-[#EF4444] border border-red-500/20">
                    <Video className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-base uppercase tracking-wider text-brand-text">
                      Portfolio Setup Tutorial
                    </h3>
                    <p className="text-[10px] text-brand-text-secondary">
                      Step-by-step video guide showing you exactly how to customize and publish your portfolio.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsTutorialOpen(false)}
                  className="text-brand-text-secondary hover:text-brand-text text-sm font-bold uppercase tracking-wider p-2 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className="relative aspect-video rounded-xl overflow-hidden border border-brand-border bg-black shadow-inner">
                <video
                  src={tutorialVideoUrl}
                  controls
                  autoPlay
                  preload="metadata"
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
