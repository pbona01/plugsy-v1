import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { Helmet } from "react-helmet-async";
import { supabase } from "../lib/supabase";
import { 
  Video, Palette, Camera, Code2, 
  Layout, PenTool, TrendingUp, 
  Bot, ShieldCheck, Box, Loader2, ArrowLeft, CheckCircle2, ChevronDown, Play,
  Wallet, CreditCard
} from "lucide-react";
import { PortfolioOnboarding } from "../components/verification/PortfolioOnboarding";
import { usePortfolioAccess } from "../lib/PortfolioContext";
import { useTheme } from "../lib/ThemeContext";
import { CATEGORY_CONFIG, getCategoryConfig } from "../utils/categoryConfig";
import { LiquidGlass } from "../components/ui/LiquidGlass";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { SEO } from "../components/seo/SEO";
import { showToast } from "../components/Toast";
import PreviewModal from "../components/verification/PreviewModal";
import { getStableIdempotencyKey, clearStableIdempotencyKey } from "../utils/idempotency";

export interface PairedCategory {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  options: {
    label: string;
    subLabel: string;
    categories: string[];
  }[];
}

export const PAIRED_CATEGORIES: PairedCategory[] = [
  {
    id: "video_motion",
    name: "Video Editing & Motion Graphics",
    icon: <Video className="w-6 h-6" />,
    description: "Cuts, color grading, animations, kinetype, and polished visual flow.",
    options: [
      { label: "Video Editing Only", subLabel: "Video cuts & grading", categories: ["video_editing"] },
      { label: "Motion Graphics Only", subLabel: "Animations & VFX", categories: ["motion_graphics"] },
      { label: "Both (Video & Motion)", subLabel: "Complete paired package", categories: ["video_editing", "motion_graphics"] }
    ]
  },
  {
    id: "writing_copy",
    name: "Content Writing & Copywriting",
    icon: <PenTool className="w-6 h-6" />,
    description: "Engaging blog content, long-form articles, and high-converting marketing copy.",
    options: [
      { label: "Content Writing Only", subLabel: "Long-form & blogs", categories: ["content_writing"] },
      { label: "Copywriting Only", subLabel: "High-conversion copy", categories: ["copywriting"] },
      { label: "Both (Writing & Copy)", subLabel: "Complete paired package", categories: ["content_writing", "copywriting"] }
    ]
  },
  {
    id: "marketing_social",
    name: "Digital Marketing & Social Media Management",
    icon: <TrendingUp className="w-6 h-6" />,
    description: "Paid growth campaigns, SEO, audience analytics, and grid posting design.",
    options: [
      { label: "Digital Marketing Only", subLabel: "Campaigns & ad strategy", categories: ["digital_marketing"] },
      { label: "Social Media Only", subLabel: "Community & grid design", categories: ["social_media_management"] },
      { label: "Both (Growth & Social)", subLabel: "Complete paired package", categories: ["digital_marketing", "social_media_management"] }
    ]
  },
  {
    id: "photo_video",
    name: "Photography & Videography",
    icon: <Camera className="w-6 h-6" />,
    description: "Premium visual capture, studio photography shoots, and cinematic film production.",
    options: [
      { label: "Photography Only", subLabel: "Hi-res image capture", categories: ["photography"] },
      { label: "Videography Only", subLabel: "Cinematic filming", categories: ["videography"] },
      { label: "Both (Photo & Video)", subLabel: "Complete paired package", categories: ["photography", "videography"] }
    ]
  },
  {
    id: "ai_prompt",
    name: "AI Automation & Prompt Engineering",
    icon: <Bot className="w-6 h-6" />,
    description: "Autonomous workflow agents, tool connections, and precise prompt context tuning.",
    options: [
      { label: "AI Automation Only", subLabel: "Workflow automation", categories: ["ai_automation"] },
      { label: "Prompt Engineering Only", subLabel: "Query & context tuning", categories: ["prompt_engineering"] },
      { label: "Both (AI & Prompts)", subLabel: "Complete paired package", categories: ["ai_automation", "prompt_engineering"] }
    ]
  },
  {
    id: "graphic_design",
    name: "Graphic Design",
    icon: <Palette className="w-6 h-6" />,
    description: "Brand identities, prints, illustrations, and social graphics.",
    options: [
      { label: "Graphic Design", subLabel: "Full graphics portfolio", categories: ["graphic_design"] }
    ]
  },
  {
    id: "web_dev",
    name: "Web Development",
    icon: <Code2 className="w-6 h-6" />,
    description: "Websites, dynamic web app development, and interactive project showcases.",
    options: [
      { label: "Web Development", subLabel: "Full coding/dev portfolio", categories: ["web_development"] }
    ]
  },
  {
    id: "ui_ux",
    name: "UI/UX Design",
    icon: <Layout className="w-6 h-6" />,
    description: "User journey wireframes, dynamic interfaces, and clean prototypes.",
    options: [
      { label: "UI/UX Design", subLabel: "Full user experience portfolio", categories: ["uiux_design"] }
    ]
  },
  {
    id: "three_d_vfx",
    name: "3D Animation & VFX",
    icon: <Box className="w-6 h-6" />,
    description: "3D model compositions, CGI animations, and visual effect integrations.",
    options: [
      { label: "3D Animation Only", subLabel: "Full 3D modeling/animation portfolio", categories: ["three_d_animation"] },
      { label: "VFX Only", subLabel: "Full VFX portfolio", categories: ["vfx"] },
      { label: "Both (3D Animation & VFX)", subLabel: "Complete paired package", categories: ["three_d_design"] }
    ]
  }
];

export function CreatePortfolio() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { isPortfolioUnlocked } = usePortfolioAccess();
  
  const [loading, setLoading] = useState<string | null>(null);
  const paymentInFlightRef = useRef(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(2);
  const [isDropdownOpen, setIsDropdownOpen] = useState<string | null>(null);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isSelectionConfirmed, setIsSelectionConfirmed] = useState(false);
  const [onboardingCategory, setOnboardingCategory] = useState<string | null>(null);
  const [previewCategory, setPreviewCategory] = useState<string | null>(null);
  
  const [purchaseCode, setPurchaseCode] = useState("");
  const [purchaseCodeOwnerId, setPurchaseCodeOwnerId] = useState<string | null>(null);
  const [purchaseCodeOwnerName, setPurchaseCodeOwnerName] = useState<string | null>(null);
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [useWallet, setUseWallet] = useState(true);
  const [activeMedal, setActiveMedal] = useState<any>(null);

  useEffect(() => {
    if (user?.id) {
       supabase.from("profiles").select("*").eq("clerk_id", user.id).single().then(({ data }) => setProfile(data));
       
       // Fetch medal
       fetch(`/api/payments?action=get-medal-status&userId=${user.id}`)
         .then(res => res.json())
         .then(data => {
           if (data?.success && data?.medal) {
             setActiveMedal(data.medal);
           }
         })
         .catch(err => console.warn("Medal fetch error:", err));
    }
  }, [user?.id]);

  useEffect(() => {
    if (isLoaded) {
      if (!user) {
        navigate("/login");
        return;
      }
    }
  }, [isLoaded, user]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      validateCode(purchaseCode);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [purchaseCode]);

  const validateCode = async (code: string) => {
    setCodeError("");
    setPurchaseCodeOwnerId(null);
    setPurchaseCodeOwnerName(null);
    if (!code || code.length < 3) return;
    setIsValidatingCode(true);

    try {
      const { data, error } = await supabase.rpc("get_code_owner", {
        lookup_code: code.trim().toUpperCase()
      });
      const result = Array.isArray(data) ? data[0] : data;
      
      if (error || !result?.valid) {
        setCodeError("Invalid code");
      } else if (result.owner_id === user?.id) {
        setCodeError("Cannot use your own code");
      } else {
        // Resolve owner's clerk_id to prevent UUID mismatch in referral reward
        const { data: profileQuery } = await supabase
          .from("profiles")
          .select("clerk_id")
          .eq("id", result.owner_id)
          .maybeSingle();

        const finalOwnerClerkId = profileQuery?.clerk_id || result.owner_clerk_id || result.owner_id;
        setPurchaseCodeOwnerId(finalOwnerClerkId);
        const ownerName = result.owner_name || result.owner_email || result.full_name;
        setPurchaseCodeOwnerName(ownerName);
      }
    } catch (e: any) {
      console.error(e);
      setCodeError("Error validating code");
    } finally {
      setIsValidatingCode(false);
    }
  };

  const handleSelectPair = (pairId: string, optionIdx: number = 2) => {
    if (!user || isSelectionConfirmed) return;
    
    setSelectedPairId(pairId);
    
    const pair = PAIRED_CATEGORIES.find(p => p.id === pairId);
    if (pair) {
      const idx = optionIdx >= pair.options.length ? pair.options.length - 1 : optionIdx;
      setSelectedOptionIndex(idx);
      setSelectedCategories(pair.options[idx].categories);
    }
  };
  
  const initiatePayment = async () => {
    if (
      selectedCategories.length === 0 ||
      !user ||
      paymentInFlightRef.current
    ) {
      return;
    }
    paymentInFlightRef.current = true;

    setLoading("payment");
    
    // Trigger confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    try {
      const token = await getToken();
      const key = getStableIdempotencyKey(`portfolio:${selectedCategories.join(",")}`);
      const res = await fetch("/api/portfolio?action=purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          categories: selectedCategories,
          purchaseCode: purchaseCodeOwnerId ? purchaseCode.toUpperCase() : undefined,
        })
      });
      
      const data = await res.json();
      if (!res.ok || !data.success || !data.entitlement?.id) {
        throw new Error(data.error || "Portfolio purchase failed");
      }
      clearStableIdempotencyKey(`portfolio:${selectedCategories.join(",")}`);
      showToast("Portfolio purchase successful!");
      navigate(`/portfolio/${data.entitlement.id}/edit`);
    } catch (e: any) {
      console.error(e);
      showToast(e.message, "error");
      paymentInFlightRef.current = false;
      setLoading(null);
    }
  };

  if (onboardingCategory) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <PortfolioOnboarding 
          categoryId={onboardingCategory} 
          onComplete={(portfolioId) => navigate(`/portfolio/${portfolioId}/edit`)} 
          onBack={() => setOnboardingCategory(null)} 
        />
      </div>
    );
  }

  const selectedConfig = selectedCategories.length > 0 ? getCategoryConfig(JSON.stringify(selectedCategories)) : null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen py-12 px-4 relative"
      style={{
        backgroundColor: "var(--brand-bg)",
        color: "var(--brand-text)"
      }}
    >
      <SEO 
        title="Plugsy - Create Portfolio" 
        description="Choose your discipline and set up the perfect verification structure for your craft."
      />
      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-12 text-center"
        >
          <div className="mb-6 flex justify-center">
             <Link 
               to="/portfolio" 
               className="p-3 rounded-xl shadow-sm transition border flex items-center justify-center"
               style={{
                 backgroundColor: "var(--brand-surface)",
                 borderColor: "var(--brand-border)",
                 color: "var(--brand-text-secondary)"
               }}
               onMouseEnter={(e) => e.currentTarget.style.color = "var(--brand-text)"}
               onMouseLeave={(e) => e.currentTarget.style.color = "var(--brand-text-secondary)"}
             >
               <ArrowLeft size={20} />
             </Link>
          </div>
          <h1 className="text-4xl md:text-5xl font-serif mb-4" style={{ color: "var(--brand-text)" }}>Choose your discipline</h1>
          <p className="text-xl max-w-2xl mx-auto" style={{ color: "var(--brand-text-secondary)" }}>
            Select what you do best. We'll set up the perfect verification structure for your craft.
          </p>
        </motion.div>

        <motion.div layout className="flex flex-col items-center justify-center gap-8 w-full min-h-[400px]">
          <AnimatePresence mode="popLayout" initial={false}>
            {!isSelectionConfirmed ? (
              <motion.div 
                layout
                key="grid"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
                transition={{ duration: 0.3 }}
                className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
              >
                {PAIRED_CATEGORIES.map((pair) => {
                  const isSelected = selectedPairId === pair.id;
                  const activeOptionIdx = isSelected 
                    ? (selectedOptionIndex < pair.options.length ? selectedOptionIndex : pair.options.length - 1) 
                    : pair.options.length - 1;
                  const currentOption = pair.options[activeOptionIdx];
                  const config = getCategoryConfig(JSON.stringify(currentOption.categories));
                  if (!config) return null;

                  return (
                    <motion.div
                       key={pair.id}
                       layout
                       initial={{ opacity: 0, y: 20 }}
                       whileInView={{ opacity: 1, y: 0 }}
                       viewport={{ once: true }}
                       transition={{ duration: 0.4 }}
                       onClick={() => {
                         if (selectedPairId === pair.id) {
                           setSelectedPairId(null);
                           setSelectedCategories([]);
                           setSelectedOptionIndex(2);
                         } else {
                           handleSelectPair(pair.id, 2);
                         }
                       }}
                       className={`relative p-6 transition-all flex flex-col items-start gap-4 border rounded-2xl shadow-md cursor-pointer ${
                         loading === pair.id ? 'opacity-70 cursor-wait' : ''
                       } ${isSelectionConfirmed && !isSelected ? 'opacity-50 grayscale' : ''}`}
                       style={{
                         backgroundColor: isSelected ? "rgba(239, 68, 68, 0.05)" : "var(--brand-card)",
                         borderColor: isSelected ? "#EF4444" : "var(--brand-border)",
                         color: "var(--brand-text)",
                         zIndex: isDropdownOpen === pair.id ? 200 : (isSelected ? 10 : 1)
                       }}
                    >
                      {isSelected && (
                        <div className="absolute top-4 right-4 bg-[#EF4444] text-white rounded-full p-1 z-20 shadow-md">
                          <CheckCircle2 size={16} />
                        </div>
                      )}
                      
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center border z-10 relative pointer-events-none"
                        style={{
                          backgroundColor: "var(--brand-surface)",
                          borderColor: "var(--brand-border)",
                          color: "var(--brand-text)"
                        }}
                      >
                        {loading === pair.id ? <Loader2 className="w-6 h-6 animate-spin" /> : pair.icon}
                      </div>

                      <div className="w-full relative z-10 flex-1 flex flex-col justify-between">
                        <div>
                          <h3 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selectedPairId === pair.id) {
                                setSelectedPairId(null);
                                setSelectedCategories([]);
                                setSelectedOptionIndex(2);
                              } else {
                                handleSelectPair(pair.id, 2);
                              }
                            }}
                            className="font-bold text-lg mb-1.5 cursor-pointer hover:text-[#EF4444] transition-colors"
                            style={{ color: "var(--brand-text)" }}
                          >
                            {pair.name}
                          </h3>
                          <p className="text-xs leading-relaxed mb-4" style={{ color: "var(--brand-text-secondary)" }}>
                            {pair.description}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewCategory(currentOption.categories[0]);
                            }}
                            className="bg-black/5 border border-black/10 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-white/40 hover:bg-black/10 hover:border-black/20 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:border-white/20 dark:hover:text-white/70 text-[11px] font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all mb-4"
                            style={{ letterSpacing: "0.05em" }}
                          >
                            <span>👁</span>
                            <span>Preview</span>
                          </button>
                        </div>

                        <div className="space-y-4">
                          {/* Price */}
                          <div className="flex items-baseline gap-1">
                            <span className="text-xs font-medium" style={{ color: "var(--brand-text-secondary)" }}>Price:</span>
                            <span className="text-[#EF4444] font-black text-lg">₦{(activeMedal ? Math.round(config.price * (1 - activeMedal.discount)) : config.price).toLocaleString()}</span>
                            {activeMedal && (
                              <span className="text-[10px] line-through opacity-40 ml-1">₦{config.price.toLocaleString()}</span>
                            )}
                          </div>

                          {/* Styled Dropdown or Select Button */}
                          {pair.options.length > 1 ? (
                            <div className={`relative w-full ${isDropdownOpen === pair.id ? 'z-50' : 'z-10'}`}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isSelected) {
                                    handleSelectPair(pair.id, 2);
                                  }
                                  setIsDropdownOpen(isDropdownOpen === pair.id ? null : pair.id);
                                }}
                                className={`w-full py-2.5 px-4 rounded-xl text-left text-xs font-bold transition flex items-center justify-between border`}
                                style={{
                                  backgroundColor: isSelected ? "#EF4444" : "var(--brand-surface)",
                                  color: isSelected ? "#ffffff" : "var(--brand-text-secondary)",
                                  borderColor: isSelected ? "transparent" : "var(--brand-border)"
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.style.color = "var(--brand-text)";
                                    e.currentTarget.style.borderColor = "var(--brand-text-secondary)";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.style.color = "var(--brand-text-secondary)";
                                    e.currentTarget.style.borderColor = "var(--brand-border)";
                                  }
                                }}
                              >
                                <span className="truncate">
                                  {isSelected ? pair.options[selectedOptionIndex].label : "Configure Scope"}
                                </span>
                                <ChevronDown size={14} className={`transition-transform duration-200 shrink-0 ${isDropdownOpen === pair.id ? "rotate-180" : ""}`} />
                              </button>

                              <AnimatePresence>
                                {isDropdownOpen === pair.id && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute top-full left-0 w-full mt-2 rounded-2xl shadow-2xl z-50 overflow-hidden bg-white/70 dark:bg-[#0D0D0F]/70 backdrop-blur-xl border border-black/10 dark:border-white/10"
                                    style={{
                                      boxShadow: theme === "dark" 
                                        ? "inset 0 1px 0px 0px rgba(255, 255, 255, 0.1), 0 25px 50px -12px rgb(0 0 0 / 0.5)" 
                                        : "inset 0 1px 1px 0px rgba(255, 255, 255, 0.4), 0 25px 50px -12px rgb(0 0 0 / 0.25)",
                                      color: "var(--brand-text)"
                                    }}
                                  >
                                    {pair.options.map((opt, oIdx) => {
                                      const isOptSelected = isSelected && selectedOptionIndex === oIdx;
                                      return (
                                        <button
                                          key={oIdx}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelectPair(pair.id, oIdx);
                                            setIsDropdownOpen(null);
                                          }}
                                          className="w-full text-left p-3 transition flex flex-col gap-0.5 border-b border-black/5 dark:border-white/5 last:border-b-0"
                                          style={{
                                            backgroundColor: isOptSelected ? "rgba(239, 68, 68, 0.1)" : "transparent",
                                            color: isOptSelected ? "#EF4444" : "var(--brand-text-secondary)"
                                          }}
                                          onMouseEnter={(e) => {
                                            if (!isOptSelected) {
                                              e.currentTarget.style.color = "var(--brand-text)";
                                              e.currentTarget.style.backgroundColor = "var(--brand-surface)";
                                            }
                                          }}
                                          onMouseLeave={(e) => {
                                            if (!isOptSelected) {
                                              e.currentTarget.style.color = "var(--brand-text-secondary)";
                                              e.currentTarget.style.backgroundColor = "transparent";
                                            }
                                          }}
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="font-bold text-xs">{opt.label}</span>
                                            {isOptSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />}
                                          </div>
                                          <span className="text-[10px] opacity-60 font-medium">{opt.subLabel}</span>
                                        </button>
                                      );
                                    })}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isSelected) {
                                  setSelectedPairId(null);
                                  setSelectedCategories([]);
                                  setSelectedOptionIndex(2);
                                } else {
                                  handleSelectPair(pair.id, 0);
                                }
                              }}
                              className={`w-full py-2.5 px-4 rounded-xl text-center text-xs font-bold transition border`}
                              style={{
                                backgroundColor: isSelected ? "#EF4444" : "var(--brand-surface)",
                                color: isSelected ? "#ffffff" : "var(--brand-text-secondary)",
                                borderColor: isSelected ? "transparent" : "var(--brand-border)"
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.color = "var(--brand-text)";
                                  e.currentTarget.style.borderColor = "var(--brand-text-secondary)";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.color = "var(--brand-text-secondary)";
                                  e.currentTarget.style.borderColor = "var(--brand-border)";
                                }
                              }}
                            >
                              {isSelected ? "Selected" : "Select Discipline"}
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            ) : (
              /* CHECKOUT SIDEBAR */
              <motion.div 
                layout
                key="checkout"
                id="checkout-sidebar" 
                className="w-full max-w-md shrink-0"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
               <div className="p-6 rounded-[16px] border shadow-2xl" style={{ backgroundColor: "var(--brand-card)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }}>
                  <div className="flex justify-between items-center mb-6 border-b pb-4" style={{ borderColor: "var(--brand-border)" }}>
                    <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: "var(--brand-text-secondary)" }}>
                      Purchase Portfolio
                    </h3>
                    <button 
                      onClick={() => setIsSelectionConfirmed(false)}
                      className="text-xs text-[#EF4444] font-bold hover:underline"
                    >
                      EDIT SELECTION
                    </button>
                  </div>
                  
                  <div className="mb-6">
                    <div className="text-sm mb-1" style={{ color: "var(--brand-text-secondary)" }}>{selectedConfig?.name}</div>
                    <div style={{ fontSize: "2rem", fontWeight: 700 }} className="flex items-start gap-1">
                      <span className="text-lg mt-2 text-[#EF4444]">₦</span>
                      <div className="overflow-hidden inline-flex">
                        <AnimatePresence mode="popLayout" initial={false}>
                          <motion.span
                            key={selectedConfig?.price}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -20, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            style={{ display: "inline-block", color: "var(--brand-text)" }}
                          >
                            {(activeMedal && selectedConfig ? Math.round(selectedConfig.price * (1 - activeMedal.discount)) : (selectedConfig?.price || 0)).toLocaleString()}
                          </motion.span>
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  <div className="mb-8 space-y-4">
                    <div className="rounded-2xl p-4 mt-4 border" style={{ backgroundColor: "var(--brand-surface)", borderColor: "var(--brand-border)" }}>
                      <label className="text-[10px] font-bold tracking-widest block mb-2 uppercase" style={{ color: "var(--brand-text-secondary)", opacity: 0.8 }}>
                        REFERRAL CODE (OPTIONAL)
                      </label>
                      
                      <div className="flex gap-2">
                        <input
                          value={purchaseCode}
                          onChange={e => setPurchaseCode(e.target.value.toUpperCase())}
                          placeholder="Enter referral code"
                          className="flex-1 bg-transparent border rounded-xl text-sm px-3.5 py-2.5 outline-none font-mono tracking-wider focus:border-[#EF4444]/50 transition-colors"
                          style={{
                            color: "var(--brand-text)",
                            borderColor: "var(--brand-border)"
                          }}
                        />
                        <button
                          onClick={() => validateCode(purchaseCode)}
                          disabled={isValidatingCode || !purchaseCode.trim()}
                          className={`rounded-xl px-4 py-2.5 text-xs font-semibold border transition-all duration-200`}
                          style={{
                            backgroundColor: purchaseCode ? "#EF4444" : "var(--brand-surface)",
                            color: purchaseCode ? "#ffffff" : "var(--brand-text-secondary)",
                            borderColor: purchaseCode ? "transparent" : "var(--brand-border)",
                            cursor: purchaseCode ? "pointer" : "not-allowed"
                          }}
                        >
                          {isValidatingCode ? "..." : "Apply"}
                        </button>
                      </div>
                      
                      {/* Validation result */}
                      {(codeError || purchaseCodeOwnerName) && (
                        <div className={`mt-2 text-xs font-medium ${!codeError ? "text-emerald-500" : "text-rose-500"}`}>
                          {!codeError 
                            ? "✓ Code applied — " + purchaseCodeOwnerName
                            : "✗ " + codeError}
                        </div>
                      )}
                    </div>
                  </div>

                  {(() => {
                    const walletBalance = profile?.balance || 0;
                    const price = activeMedal && selectedConfig 
                      ? Math.round(selectedConfig.price * (1 - activeMedal.discount)) 
                      : (selectedConfig?.price || 0);
                    const canAfford = walletBalance >= price;

                    return (
                      <div className="space-y-4">
                        {/* Payment Method Selector */}
                        <div className="space-y-2">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-secondary">
                            SELECT PAYMENT METHOD
                          </label>
                          <div className="grid grid-cols-1 gap-2.5">
                            <button
                              type="button"
                              onClick={() => setUseWallet(true)}
                              className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                                useWallet
                                  ? "border-brand-accent bg-brand-accent/10 text-brand-text"
                                  : "border-brand-border bg-brand-card/50 text-brand-text/60 hover:border-brand-border/80"
                              }`}
                            >
                              <Wallet className={`w-5 h-5 mt-0.5 shrink-0 ${useWallet ? "text-brand-accent" : "text-brand-text/40"}`} />
                              <div>
                                <div className="text-xs font-bold uppercase tracking-wider">Plugsy Wallet</div>
                                <div className="text-[10px] font-mono text-brand-text-secondary mt-0.5">
                                  Balance: ₦{walletBalance.toLocaleString()}
                                </div>
                              </div>
                            </button>

                            <button
                              type="button"
                              disabled
                              className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                                !useWallet
                                  ? "border-brand-accent bg-brand-accent/10 text-brand-text"
                                  : "border-brand-border bg-brand-card/50 text-brand-text/60 hover:border-brand-border/80"
                              }`}
                            >
                              <CreditCard className={`w-5 h-5 mt-0.5 shrink-0 ${!useWallet ? "text-brand-accent" : "text-brand-text/40"}`} />
                              <div>
                                <div className="text-xs font-bold uppercase tracking-wider">Wallet only</div>
                                <div className="text-[10px] font-mono text-brand-text-secondary mt-0.5">
                                  Direct provider checkout is retired
                                </div>
                              </div>
                            </button>
                          </div>
                        </div>

                        {useWallet ? (
                          <div>
                            <button
                              disabled={loading === "payment"}
                              onClick={initiatePayment}
                              className="w-full py-4 px-6 rounded-xl font-bold text-xs uppercase tracking-wider text-white transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 border-none bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
                            >
                              {loading === "payment" ? <Loader2 size={16} className="animate-spin" /> : null}
                              {loading === "payment" 
                                ? "PROCESSING WALLET PAYMENT..." 
                                : (canAfford 
                                  ? `PAY ₦${price.toLocaleString()} FROM WALLET` 
                                  : "INSUFFICIENT WALLET BALANCE")}
                            </button>

                            {!canAfford && (
                              <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                                <p className="text-xs text-red-400 mb-2">
                                  Your wallet balance (₦{walletBalance.toLocaleString()}) is lower than the price.
                                </p>
                                <div className="flex justify-center gap-3">
                                  <Link
                                    to="/wallet"
                                    className="text-xs font-bold text-sky-400 hover:underline uppercase tracking-wider"
                                  >
                                    Top Up Wallet
                                  </Link>
                                  <span className="text-xs text-brand-text/30">•</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <button
                              disabled={loading === "payment"}
                              onClick={initiatePayment}
                              className="w-full py-4 px-6 rounded-xl font-bold text-xs uppercase tracking-wider text-white transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 border-none bg-brand-accent hover:bg-brand-accent/90 shadow-lg shadow-brand-accent/20 flex items-center justify-center gap-2"
                            >
                              {loading === "payment" ? <Loader2 size={16} className="animate-spin" /> : null}
                              {loading === "payment"
                                ? "INITIALIZING FLUTTERWAVE..."
                                : `PAY ₦${price.toLocaleString()} VIA FLUTTERWAVE`}
                            </button>
                            <p className="text-[11px] text-center text-brand-text-secondary mt-2">
                              Supports Card, Bank Transfer, USSD, OPay & Mobile Money
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
               </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Video Tutorial Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mt-12 max-w-2xl mx-auto w-full"
        >
          <div 
            className="p-6 rounded-2xl border shadow-xl flex flex-col gap-4 text-center relative overflow-hidden"
            style={{ 
              backgroundColor: "var(--brand-card)", 
              borderColor: "var(--brand-border)",
              color: "var(--brand-text)" 
            }}
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-red-500/10 text-[#EF4444] border border-red-500/20">
                <Video className="w-5 h-5" />
              </span>
              <h3 className="font-bold text-base uppercase tracking-wider text-brand-text">
                How to Buy & Launch Tutorial
              </h3>
            </div>
            <p className="text-xs text-brand-text-secondary max-w-md mx-auto mb-2">
              Watch this step-by-step video guide showing you exactly how to select your category, make a payment, and set up your verified professional portfolio.
            </p>
            <div className="relative aspect-video rounded-xl overflow-hidden border border-brand-border bg-black/50 shadow-inner group">
              <video 
                src="https://res.cloudinary.com/doit6oaze/video/upload/v1782271767/VID-20260623-WA0135_merzzf.mp4" 
                controls 
                preload="metadata"
                playsInline
                className="w-full h-full object-contain"
                poster="https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=1200&q=80"
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* CONFIRMATION DRAWER */}
      <AnimatePresence>
        {selectedCategories.length > 0 && !isSelectionConfirmed && (
          <motion.div 
            initial={{ y: 150, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 150, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 flex justify-center pointer-events-none"
          >
            <div className="pointer-events-auto border rounded-[24px] shadow-2xl w-full max-w-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6" style={{ backgroundColor: "var(--brand-card)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }}>
              <div className="flex-1 text-center sm:text-left">
                <h3 className="font-bold text-xl mb-1 tracking-tight" style={{ color: "var(--brand-text)" }}>Confirm Selection</h3>
                <p className="text-sm font-medium" style={{ color: "var(--brand-text-secondary)" }}>
                  {selectedCategories.length} {selectedCategories.length === 1 ? 'discipline' : 'disciplines'} selected for ₦{selectedConfig?.price.toLocaleString()}
                </p>
              </div>
              <LiquidGlass
                button
                onClick={() => {
                  setIsSelectionConfirmed(true);
                  setTimeout(() => {
                    const checkoutSidebar = document.getElementById('checkout-sidebar');
                    if (checkoutSidebar) {
                      checkoutSidebar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                  }, 150);
                }}
                className="w-full sm:w-auto hover:opacity-90 transition-opacity !bg-slate-900 dark:!bg-white !text-white dark:!text-slate-900"
                style={{
                  borderRadius: "9999px",
                  padding: "16px 32px",
                  fontWeight: "bold"
                }}
              >
                <div className="flex items-center gap-2">
                   <span>Confirm & Proceed to Payment</span>
                   <ArrowLeft className="w-4 h-4 rotate-180" />
                </div>
              </LiquidGlass>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PREVIEW MODAL */}
      {previewCategory && (
        <PreviewModal
          category={previewCategory}
          categoryName={CATEGORY_CONFIG[previewCategory]?.name || getCategoryConfig(JSON.stringify([previewCategory]))?.name || ""}
          price={CATEGORY_CONFIG[previewCategory]?.price || getCategoryConfig(JSON.stringify([previewCategory]))?.price || 1000}
          onClose={() => setPreviewCategory(null)}
          onSelect={() => {
            const pair = PAIRED_CATEGORIES.find(p => p.options.some(opt => opt.categories[0] === previewCategory));
            if (pair) {
              const optIdx = pair.options.findIndex(opt => opt.categories[0] === previewCategory);
              handleSelectPair(pair.id, optIdx !== -1 ? optIdx : 0);
            }
            setPreviewCategory(null);
          }}
        />
      )}

      {/* Floating 'How to buy' Button */}
      <button
        onClick={() => setIsTutorialOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-brand-accent hover:bg-brand-accent/90 text-white font-black uppercase tracking-widest text-xs px-5 py-3.5 rounded-full shadow-lg shadow-brand-accent/30 transition-all hover:scale-105 cursor-pointer border border-white/10"
      >
        <Play size={14} fill="currentColor" />
        <span>How to Buy</span>
      </button>

      {/* Video Tutorial Overlay */}
      <AnimatePresence>
        {isTutorialOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
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
                      How to Buy & Launch Tutorial
                    </h3>
                    <p className="text-[10px] text-brand-text-secondary">
                      Step-by-step video guide showing you exactly how to select your category, make a payment, and set up your verified professional portfolio.
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
                  src="https://res.cloudinary.com/doit6oaze/video/upload/v1782271767/VID-20260623-WA0135_merzzf.mp4"
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
    </motion.div>
  );
}

