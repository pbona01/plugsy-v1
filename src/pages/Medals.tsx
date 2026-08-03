import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useUser } from "@clerk/clerk-react";
import { supabase } from "../lib/supabase";
import {
  Award,
  Crown,
  Sparkles,
  Percent,
  Coins,
  Users,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Loader2,
  HelpCircle,
  X
} from "lucide-react";
import { LiquidGlass } from "../components/ui/LiquidGlass";
import { Helmet } from "react-helmet-async";
import { toast } from "react-hot-toast";
import { cn } from "../lib/utils";
import { MEDAL_CAPACITY, validateMedalSalesResponse } from "../../shared/medals.js";

interface MedalPlan {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  category: string;
}

export default function Medals() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useUser();
  const userId = user?.id;

  const [loading, setLoading] = useState(true);
  const [medalPlans, setMedalPlans] = useState<MedalPlan[]>([]);
  const [activeMedal, setActiveMedal] = useState<any>(null);
  const [medalNumber, setMedalNumber] = useState<number | null>(null);
  const [totalSold, setTotalSold] = useState<number | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const salesSequenceRef = useRef(0);
  const salesAbortRef = useRef<AbortController | null>(null);
  const salesInFlightRef = useRef(false);

  const refreshMedalSales = useCallback(async (force = false) => {
    if (!force && document.visibilityState !== "visible") return;
    if (salesInFlightRef.current) return;
    salesInFlightRef.current = true;
    const sequence = ++salesSequenceRef.current;
    salesAbortRef.current?.abort();
    const controller = new AbortController();
    salesAbortRef.current = controller;
    try {
      const response = await fetch("/api/payments?action=get-medal-sales", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") || "";
      let payload: unknown = null;
      if (contentType.toLowerCase().includes("application/json")) {
        try { payload = await response.json(); } catch { payload = null; }
      }
      if (response.ok && sequence === salesSequenceRef.current && validateMedalSalesResponse(payload)) {
        setTotalSold(payload.totalSold);
      }
    } catch {
      // Preserve the last confirmed count; the next focus/interval retries.
    } finally {
      if (sequence === salesSequenceRef.current) salesInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (searchParams.get('success') === 'medal') {
      setShowSuccessModal(true);
      void refreshMedalSales(true);
      // Clean URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [searchParams, refreshMedalSales]);

  useEffect(() => {
    async function initData() {
      try {
        // Fetch medal plans from database
        const { data: plans, error: plansError } = await supabase
          .from("plans")
          .select("*")
          .in("category", ["medal_8k", "medal_15k", "medal_20k"])
          .eq("is_active", true);

        if (plansError) throw plansError;
        setMedalPlans(plans || []);

        // Fetch user medal status separately from the public aggregate count.
        if (userId) {
          const res = await fetch(`/api/payments?action=get-medal-status&userId=${userId}&t=${Date.now()}`);
          const data = await res.json();
          if (data?.success) {
            setActiveMedal(data.medal);
            setMedalNumber(data.medalNumber);
          }
        }
      } catch (err) {
        console.error("Error loading medals page data:", err);
      } finally {
        setLoading(false);
      }
    }

    initData();
  }, [userId]);

  useEffect(() => {
    void refreshMedalSales(true);
    const interval = window.setInterval(() => void refreshMedalSales(), 10000);
    const onFocus = () => void refreshMedalSales();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshMedalSales();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      salesSequenceRef.current += 1;
      salesAbortRef.current?.abort();
      salesAbortRef.current = null;
      salesInFlightRef.current = false;
    };
  }, [refreshMedalSales]);

  const getMedalStyles = (tierName: string) => {
    const name = tierName.toLowerCase();
    if (name.includes("gold")) {
      return {
        gradient: "from-amber-400 via-yellow-500 to-amber-600",
        shadow: "shadow-yellow-500/20",
        border: "border-yellow-400/50",
        text: "text-yellow-400",
        bg: "bg-yellow-400/5",
        accentColor: "#f59e0b",
        label: "Gold Tier"
      };
    }
    if (name.includes("silver")) {
      return {
        gradient: "from-slate-300 via-zinc-400 to-slate-500",
        shadow: "shadow-zinc-500/20",
        border: "border-zinc-300/50",
        text: "text-zinc-300",
        bg: "bg-zinc-300/5",
        accentColor: "#a1a1aa",
        label: "Silver Tier"
      };
    }
    // Default to Bronze
    return {
      gradient: "from-amber-600 via-orange-700 to-amber-800",
      shadow: "shadow-orange-700/20",
      border: "border-orange-500/50",
      text: "text-orange-400",
      bg: "bg-orange-500/5",
      accentColor: "#c2410c",
      label: "Bronze Tier"
    };
  };

  const formatNumber = (num: number | null) => {
    if (num === null) return "---";
    return num.toString().padStart(3, "0");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg">
        <Loader2 className="animate-spin text-brand-accent w-12 h-12" />
      </div>
    );
  }

  // Sort plans by price ascending
  const sortedPlans = [...medalPlans].sort((a, b) => a.price - b.price);

  return (
    <div className="min-h-screen py-20 px-4 bg-brand-bg relative overflow-hidden">
      <Helmet>
        <title>Plugsy - Discount Medals</title>
        <meta name="description" content="Secure your limited Plugsy Discount Medal. Lifetime discounts, premium referral commission boosts, and digital badges." />
      </Helmet>

      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-brand-card border border-brand-accent/30 p-8 rounded-2xl max-w-sm w-full text-center relative overflow-hidden shadow-[0_0_50px_rgba(var(--brand-accent-rgb),0.2)]"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-accent/0 via-brand-accent to-brand-accent/0" />
              
              <button 
                onClick={() => setShowSuccessModal(false)}
                className="absolute top-4 right-4 p-2 hover:bg-brand-accent/10 rounded-full transition-colors text-brand-text/50"
              >
                <X size={20} />
              </button>

              <div className="w-20 h-20 bg-brand-accent/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-brand-accent/30">
                <Award size={40} className="text-brand-accent animate-bounce" />
              </div>

              <h2 className="text-2xl font-black text-brand-text mb-2 uppercase tracking-tight">
                Congratulations!
              </h2>
              <p className="text-brand-text-secondary text-sm mb-8 leading-relaxed">
                You are now an official Plugsy Medal Holder. Your lifetime benefits are active across all products.
              </p>

              <LiquidGlass
                button
                onClick={() => setShowSuccessModal(false)}
                className="w-full py-4 text-sm font-black uppercase tracking-widest bg-brand-accent text-white rounded-xl shadow-lg shadow-brand-accent/20"
              >
                Let's Go
              </LiquidGlass>

              <div className="mt-6 flex items-center justify-center gap-2">
                <Sparkles size={14} className="text-brand-accent" />
                <span className="text-[10px] font-mono text-brand-text/40 uppercase tracking-widest">
                  Verified Medal Owner
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Background ambient glows */}
      <div className="absolute top-10 left-1/4 w-96 h-96 rounded-full bg-brand-accent/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 rounded-full bg-brand-accent/3 blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-16">
        
        {/* Header Block */}
        <header className="text-center space-y-4 max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-xs font-black uppercase tracking-widest"
          >
            <Crown size={14} className="animate-bounce" />
            <span>Exclusive Membership Card</span>
          </motion.div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight font-display text-brand-text">
            Plugsy <span className="text-brand-accent">Discount Medals</span>
          </h1>
          <p className="text-brand-text-secondary text-sm md:text-base leading-relaxed">
            Gain a lifetime computational edge. Permanent lifetime discounts, boosted affiliate payouts, and a cryptographic sequential badge on your public profiles.
          </p>

          {/* Sold out tracker bar */}
          <div className="pt-6">
            <div className="bg-brand-surface border border-brand-border p-4 rounded-2xl max-w-md mx-auto space-y-3">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                <span className="text-brand-text/60">Global Medal Capacity</span>
                <span className="text-brand-accent" aria-live="polite">
                  {totalSold === null ? `Updating count / ${MEDAL_CAPACITY} Claimed` : `${totalSold} / ${MEDAL_CAPACITY} Claimed`}
                </span>
              </div>
              <div className="w-full bg-brand-bg rounded-full h-2.5 overflow-hidden border border-brand-border/40">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${totalSold === null ? 0 : Math.min((totalSold / MEDAL_CAPACITY) * 100, 100)}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="bg-brand-accent h-full rounded-full shadow-lg shadow-brand-accent/40"
                />
              </div>
              <p className="text-[10px] text-brand-text-secondary uppercase font-semibold text-center tracking-widest">
                Strict limit of 160 unique medal licenses. Secure yours before capacity is met.
              </p>
            </div>
          </div>
        </header>

        {/* User's Medal Certificate (Show if owned) */}
        {activeMedal ? (
          <motion.section
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-xl mx-auto"
          >
            <div className="text-center mb-6">
              <span className="text-xs font-mono font-black uppercase tracking-widest text-brand-accent flex items-center justify-center gap-2">
                <ShieldCheck size={16} /> Plugsy Verified Membership Medal
              </span>
            </div>

            {/* Premium Digital Badge Card */}
            {(() => {
              const styles = getMedalStyles(activeMedal.name);
              return (
                <div
                  className={`relative card-premium p-10 flex flex-col justify-between overflow-hidden border-2 ${styles.border} ${styles.shadow} bg-gradient-to-b ${styles.bg} to-brand-card/90 transition-all group`}
                >
                  {/* Glowing metallic reflections */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
                  
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="text-xs font-mono uppercase tracking-widest text-brand-text/40">Plugsy Discount Medal</div>
                      <h3 className="text-2xl font-black tracking-tighter text-brand-text">
                        Medal status
                      </h3>
                      <span className={`text-xs font-black tracking-widest px-2.5 py-0.5 rounded-full ${styles.text} bg-brand-bg border border-brand-border/40`}>
                        ({activeMedal.name.includes("Gold") ? "Gold tier" : activeMedal.name.includes("Silver") ? "Silver tier" : "Bronze tier"})
                      </span>
                    </div>
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${styles.gradient} flex items-center justify-center shadow-lg`}>
                      <Award size={28} className="text-brand-bg" />
                    </div>
                  </div>

                  {/* Certificate holder info */}
                  <div className="mt-12 pt-6 border-t border-brand-border/40 flex justify-between items-end">
                    <div className="space-y-1">
                      <div className="text-[9px] font-mono text-brand-text/40 uppercase tracking-widest">License Holder</div>
                      <div className="text-sm font-bold uppercase tracking-wide text-brand-text flex items-center gap-2">
                        {user?.imageUrl && (
                          <img
                            src={user.imageUrl}
                            alt=""
                            className="w-5 h-5 rounded-full object-cover border border-brand-border"
                          />
                        )}
                        <span>{user?.fullName || user?.primaryEmailAddress?.emailAddress}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-mono text-brand-text/40 uppercase tracking-widest">Registry Number</div>
                      <div className={`text-2xl font-black font-mono tracking-widest ${styles.text}`}>
                        #{formatNumber(medalNumber)}
                      </div>
                    </div>
                  </div>

                  {/* Benefit indicators */}
                  <div className="mt-6 grid grid-cols-2 gap-4 bg-brand-bg/50 border border-brand-border/30 p-4 rounded-xl text-xs font-bold uppercase tracking-wider">
                    <div className="flex items-center gap-2 text-brand-text">
                      <Percent size={14} className="text-brand-accent" />
                      <span>{Math.round(activeMedal.discount * 100)}% Off Lifetime</span>
                    </div>
                    <div className="flex items-center gap-2 text-brand-text">
                      <Coins size={14} className="text-brand-accent" />
                      <span>+{Math.round(activeMedal.commissionBonus * 100)}% Comms Boost</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </motion.section>
        ) : null}

        {activeMedal && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-xl mx-auto p-8 bg-brand-surface/40 border border-brand-border rounded-3xl relative overflow-hidden group shadow-2xl"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-brand-accent/5 via-transparent to-transparent opacity-50" />
            <h3 className="relative z-10 text-sm font-black uppercase tracking-widest text-brand-text mb-6 flex items-center gap-2">
              <Sparkles size={16} className="text-brand-accent animate-pulse" /> Your Activated Benefits
            </h3>
            <div className="relative z-10 space-y-4">
               {[
                 {
                   name: "Lifetime Discount",
                   desc: `${Math.round(activeMedal.discount * 100)}% lifetime discount on eligible Plugsy official products.`,
                   icon: Percent,
                   badgeValue: `-${Math.round(activeMedal.discount * 100)}%`
                 },
                 {
                   name: "Priority Reward Access",
                   desc: "Priority access to participate in Plugsy reward programs.",
                   icon: Crown,
                   badgeValue: "VIP"
                 },
                 {
                   name: "Commission Boost",
                   desc: `${Math.round(activeMedal.commissionBonus * 100)}% higher commission rewards when someone uses your purchase code.`,
                   icon: Coins,
                   badgeValue: `+${Math.round(activeMedal.commissionBonus * 100)}%`
                 },
                 {
                   name: "Exclusive Identity",
                   desc: "Exclusive Lifetime Member badge with a unique member identity.",
                   icon: ShieldCheck,
                   badgeValue: `#${formatNumber(medalNumber)}`
                 }
               ].map((benefit, i) => {
                 const BenefitIcon = benefit.icon;
                 return (
                   <div key={i} className="flex gap-4 items-start p-4 bg-brand-bg/60 rounded-2xl border border-brand-border/40 hover:border-brand-accent/30 transition-all">
                     <div className="p-2 bg-brand-accent/10 rounded-xl border border-brand-accent/20 text-brand-accent shrink-0 mt-0.5">
                       <BenefitIcon size={16} />
                     </div>
                     <div className="flex-1 space-y-1">
                       <div className="text-[11px] font-black uppercase tracking-tight text-brand-text">{benefit.name}</div>
                       <div className="text-[10px] font-bold uppercase tracking-wider text-brand-text-secondary leading-relaxed">{benefit.desc}</div>
                     </div>
                     <div className="text-[10px] font-mono font-black text-brand-accent bg-brand-accent/10 px-2.5 py-1 rounded-full border border-brand-accent/20 shrink-0">
                       {benefit.badgeValue}
                     </div>
                   </div>
                 );
               })}
               <div className="text-[10px] text-brand-text-secondary text-center mt-4 font-mono uppercase tracking-widest opacity-60">
                  Securely verified on account registry #{formatNumber(medalNumber)}
               </div>
            </div>
          </motion.section>
        )}

        {/* List of Medal Plans available for purchase */}
        <section className="space-y-10">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black uppercase tracking-tight text-brand-text">
              {activeMedal ? "Upgrade Your Membership" : "Choose Your Medal License"}
            </h2>
            <p className="text-brand-text-secondary text-xs uppercase tracking-widest">
              Instant activation upon purchase confirmation. No recurring fees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {sortedPlans.map((plan) => {
              const styles = getMedalStyles(plan.name);
              const isActiveUsersMedal = activeMedal?.name === plan.name;

              return (
                <motion.div
                  key={plan.id}
                  whileHover={{ y: -4 }}
                  className={`card-premium p-8 flex flex-col justify-between relative border-brand-border/50 ring-1 ring-brand-accent/10 hover:border-brand-accent group ${isActiveUsersMedal ? "border-brand-accent/50 ring-2 ring-brand-accent/30" : ""}`}
                >
                  {/* Highlight current medal */}
                  {isActiveUsersMedal && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-accent text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">
                      Your Active Medal
                    </div>
                  )}

                  <div>
                    {/* Premium Header Layout matching the certificate */}
                    <div className="flex justify-between items-start gap-4 mb-6">
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-brand-text/40">Plugsy Discount Medal</div>
                        <h3 className="text-2xl font-black tracking-tighter uppercase text-brand-text group-hover:text-brand-accent transition-colors duration-300">
                          {plan.name}
                        </h3>
                        <div>
                          <span className={`inline-block text-xs font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${styles.text} bg-brand-bg border border-brand-border/40`}>
                            {styles.label}
                          </span>
                        </div>
                      </div>
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${styles.gradient} flex items-center justify-center shadow-lg shrink-0`}>
                        <Award size={28} className="text-brand-bg" />
                      </div>
                    </div>

                    <p className="text-brand-text-secondary text-xs mb-6">
                      {plan.description}
                    </p>

                    <div className="mb-8">
                      <span className="text-3xl font-black text-brand-text">
                        ₦{plan.price.toLocaleString()}
                      </span>
                      <span className="text-[10px] font-mono text-brand-text-secondary block uppercase tracking-wider mt-1">
                        One-Time Payment
                      </span>
                    </div>

                    {/* Features List */}
                    <ul className="space-y-4 mb-8">
                      {plan.features.map((feat, i) => (
                        <li key={i} className="flex items-start gap-3 text-xs font-bold uppercase tracking-wider text-brand-text/90">
                          <CheckCircle2 size={14} className="text-brand-accent shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Actions */}
                  <div className="pt-4 border-t border-brand-border/40">
                    {activeMedal ? (
                      <div className={cn(
                        "w-full py-4 text-center text-xs font-black uppercase tracking-widest rounded-xl border",
                        isActiveUsersMedal 
                          ? "bg-brand-accent/10 text-brand-accent border-brand-accent/30" 
                          : "bg-brand-surface text-brand-text/20 border-brand-border/50"
                      )}>
                        {isActiveUsersMedal ? "License Active" : "One Medal Limit"}
                      </div>
                    ) : (
                      <LiquidGlass
                        button
                        chromaticAberration={1.5}
                        onClick={() => {
                          if (!userId) {
                            toast.error("Please login first to claim a medal.");
                            return;
                          }
                          navigate(`/checkout/confirm?planId=${plan.id}`);
                        }}
                        className="w-full btn-primary !py-4 text-center text-xs font-black uppercase tracking-widest"
                      >
                        <span className="flex items-center justify-center gap-2">
                          Claim License <ArrowRight size={14} />
                        </span>
                      </LiquidGlass>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Benefits FAQ Grid */}
        <section className="bg-brand-card border border-brand-border p-8 rounded-3xl space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-black uppercase tracking-tight text-brand-text flex items-center justify-center gap-2">
              <HelpCircle size={20} className="text-brand-accent" /> Medal Program FAQ
            </h2>
            <p className="text-[10px] font-mono text-brand-text-secondary uppercase tracking-widest">
              Transparent, high-assurance digital products system
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs font-bold uppercase tracking-wider">
            <div className="space-y-2">
              <h4 className="text-brand-text">Is the lifetime discount guaranteed forever?</h4>
              <p className="text-brand-text-secondary font-normal leading-relaxed text-xs lowercase first-letter:uppercase">
                Yes. Your discount percentage (+15%, +30%, or +50%) is bound directly to your user account registry in our database. It is automatically computed and applied at checkout for any Plugsy premium digital products.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-brand-text">How does the commission boost work?</h4>
              <p className="text-brand-text-secondary font-normal leading-relaxed text-xs lowercase first-letter:uppercase">
                Normally, referring a buyer earns you a 10% commission reward. With a Bronze, Silver, or Gold Medal, your commission rate increases to 20%, 25%, or 30% respectively. This is automatically credited to your wallet balance instantly.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-brand-text">Can I transfer my medal license or number?</h4>
              <p className="text-brand-text-secondary font-normal leading-relaxed text-xs lowercase first-letter:uppercase">
                Currently, medal licenses are securely bound to your Clerk user account. However, since they are sequential (#001 - #160), they are highly valuable. We may support verified badge/license trading as the Plugsy network scales.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-brand-text">Are there any loop holes or bypass methods?</h4>
              <p className="text-brand-text-secondary font-normal leading-relaxed text-xs lowercase first-letter:uppercase">
                Our medal licenses are securely validated server-side. No user can fake a registry number or apply lifetime discounts to other medal purchases. All sequential numbers are strictly bound to paid transactions in our central order database.
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
