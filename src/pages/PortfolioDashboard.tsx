import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { Helmet } from "react-helmet-async";
import { supabase } from "../lib/supabase";
import { VPPortfolio } from "../types/verification";
import { Plus, ArrowRight, Eye, Briefcase, Trash2 } from "lucide-react";
import { LiquidGlass } from "../components/ui/LiquidGlass";
import { motion, AnimatePresence } from "framer-motion";
import { SEO } from "../components/seo/SEO";

import { showToast } from "../components/Toast";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
};

export default function PortfolioDashboard() {
  const { user, isLoaded } = useUser();
  const clerkUserId = user?.id;
  const [portfolios, setPortfolios] = useState<VPPortfolio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clerkUserId) {
      console.log("[portfolio-dashboard] no clerkUserId yet")
      return
    }
    fetchPortfolios()
  }, [clerkUserId])

  const fetchPortfolios = async () => {
    try {
      const { data: portfolios, error } = await supabase
        .from("vp_portfolios")
        .select(`
          *,
          items:vp_portfolio_items ( count )
        `)
        .eq("user_id", clerkUserId)
        .order("created_at", { ascending: false });

      console.log("[portfolio-dashboard] clerkUserId:", clerkUserId)
      console.log("[portfolio-dashboard] portfolios:", portfolios)
      console.log("[portfolio-dashboard] error:", error)

      if (error) throw error;
      setPortfolios(portfolios || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePortfolio = async (portfolioId: string) => {
    if (!window.confirm("Delete this portfolio? This cannot be undone.")) return;

    // Delete work items first
    await supabase
      .from("vp_portfolio_items")
      .delete()
      .eq("portfolio_id", portfolioId);
    
    // Delete custom categories
    await supabase
      .from("vp_custom_categories")
      .delete()
      .eq("portfolio_id", portfolioId);
    
    // Delete reactions
    await supabase
      .from("vp_reactions")
      .delete()
      .eq("portfolio_id", portfolioId);
    
    // Delete portfolio
    const { error } = await supabase
      .from("vp_portfolios")
      .delete()
      .eq("id", portfolioId)
      .eq("user_id", clerkUserId);
    
    if (error) {
      showToast("Failed to delete: " + error.message, "error");
      return;
    }
    
    // Remove from local state
    setPortfolios((prev) => prev.filter((p) => p.id !== portfolioId));
  };

  // Live Content: Only rendered/mounted when unlocked
  return (
    <div className="relative min-h-screen overflow-hidden">
      <SEO 
        title="Plugsy - Creator Hub" 
        description="Manage your portfolios and track client engagement."
      />
      {!isLoaded || loading ? (
        <div className="p-8 text-center text-gray-500 min-h-screen flex items-center justify-center uppercase tracking-widest font-mono text-xs">Loading Live Ledger...</div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-7xl mx-auto p-4 md:p-8"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-serif text-slate-900 dark:text-[#F5F5F7] tracking-tight">Your Verification Portfolios</h1>
              <p className="text-slate-600 dark:text-white/60 mt-2">Manage your skill proof and track client engagement.</p>
            </div>
            <Link 
              to="/portfolio/new" 
              className="bg-brand-text text-brand-surface px-6 py-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-800 transition shadow-md"
            >
              <Plus size={20} />
              New Portfolio
            </Link>
          </div>

          {portfolios.length === 0 ? (
            <div className="text-center bg-gray-50 dark:bg-white/[0.02] rounded-2xl border border-gray-100 dark:border-white/5 p-12 max-w-2xl mx-auto mt-12">
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-500/10 text-red-500 flex items-center justify-center rounded-2xl mb-6">
                <Briefcase size={32} />
              </div>
              <h2 className="text-4xl font-serif text-slate-900 dark:text-white mb-4">Stop Sending CVs.</h2>
              <div className="w-16 h-1 bg-red-500 mx-auto mb-6"></div>
              <h3 className="text-2xl text-slate-800 dark:text-white/90 font-medium mb-4">Start sending proof.</h3>
              <p className="text-slate-600 dark:text-white/70 mb-8 max-w-md mx-auto leading-relaxed">
                Build your free verification portfolio in minutes. Share your work. Let clients react. Get hired.
              </p>
              <Link 
                to="/portfolio/new" 
                className="inline-flex items-center gap-2 bg-brand-text text-brand-surface px-8 py-4 rounded-xl font-bold hover:bg-gray-800 transition"
              >
                Build My Portfolio <ArrowRight size={20} />
              </Link>
            </div>
          ) : (
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {portfolios.map((port) => (
                <motion.div 
                  variants={itemVariants}
                  whileHover={{ y: -4 }}
                  key={port.id} 
                  className="bg-brand-bg border flex flex-col border-brand-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {(() => {
                        let cats: any = port.category;
                        if (typeof cats === 'string' && cats.startsWith('[')) {
                          try { cats = JSON.parse(cats); } catch (e) {}
                        }
                        const catArray = Array.isArray(cats) ? cats : [cats].filter(Boolean);
                        
                        if (catArray.length === 0) return null;
                        
                        return catArray.map((cat: string) => (
                          <span key={cat} className="bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/10 text-slate-800 dark:text-white/80 rounded-full px-2.5 py-1 text-xs font-medium tracking-wide uppercase">
                            {cat.replace(/_/g, ' ')}
                          </span>
                        ));
                      })()}
                    </div>
                    {port.status === 'published' ? (
                      <span className="text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 px-2.5 py-1 rounded-full text-xs font-bold border border-emerald-100 dark:border-emerald-500/20 shrink-0">Live</span>
                    ) : (
                      <span className="text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-100 dark:border-amber-500/20 shrink-0">Draft</span>
                    )}
                  </div>
                  
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 truncate">
                    {port.full_name || 'Untitled Portfolio'}
                  </h3>
                  
                  {/* Visual Completeness Progress Tracker */}
                  {(() => {
                    const steps = [
                      { label: "Avatar set", complete: !!port.profile_image_url },
                      { label: "Bio/Tagline set", complete: !!port.bio_text || !!port.tagline },
                      { label: "Project links added", complete: (port as any).items?.[0]?.count > 0 },
                    ];
                    const completed = steps.filter(s => s.complete).length;
                    const percentage = Math.round((completed / steps.length) * 100);
                    
                    return (
                      <div className="mb-4 mt-2">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-[10px] font-black text-slate-500 dark:text-white/50 uppercase tracking-widest">Profile Completeness</span>
                          <span className="text-[10px] font-black text-brand-text">{percentage}%</span>
                        </div>
                        <div className="w-full bg-black/5 dark:bg-white/10 rounded-full h-1.5 mb-3 hidden sm:block">
                          <div className="bg-brand-text h-1.5 rounded-full transition-all duration-700 ease-in-out" style={{ width: `${percentage}%` }}></div>
                        </div>
                        <ul className="space-y-1.5">
                          {steps.map((step, idx) => (
                            <li key={idx} className="flex items-center gap-2.5 text-[11px]">
                              {step.complete ? (
                                <div className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                                  <svg className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              ) : (
                                <div className="w-4 h-4 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 shrink-0"></div>
                              )}
                              <span className={step.complete ? "text-slate-900 dark:text-white font-medium" : "text-slate-500 dark:text-white/40"}>
                                {step.label}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                  
                  <div className="flex items-center gap-4 py-4 mt-auto border-t border-black/5 dark:border-white/5">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-white/60">
                      <Eye size={16} />
                      <span className="text-sm font-medium">{port.view_count || 0}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2 mt-4">
                    <div className="flex gap-2 w-full">
                      <Link 
                        to={`/portfolio/${port.id}/edit`} 
                        className="flex-[2] text-center py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition shadow-sm"
                      >
                        Edit
                      </Link>
                      {port.status === "published" && (
                        <Link 
                          to={`/vp/${port.slug}`} 
                          target="_blank"
                          className="flex-[2] text-center py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-bold transition shadow-sm"
                        >
                          View Live
                        </Link>
                      )}
                      {port.status === "published" && (
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/vp/${port.slug}`);
                          }}
                          className="flex-[2] text-center py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-bold transition shadow-sm whitespace-nowrap"
                        >
                          Copy Link
                        </button>
                      )}
                      <button 
                        onClick={() => handleDeletePortfolio(port.id)}
                        className="w-10 flex items-center justify-center shrink-0 bg-red-100 hover:bg-red-200 text-[#dc2626] rounded-lg transition border border-red-200"
                        title="Delete portfolio"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}
