import React, { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth, useUser } from "@clerk/clerk-react";
import {
  Video,
  Palette,
  Loader2,
  GraduationCap,
  ArrowRight,
  Shield,
  CheckCircle2,
  Award,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { chatService } from "../services/chatService";
import { setSupabaseAuth } from "../lib/supabase";
import { toast } from "react-hot-toast";
import { LiquidGlass } from "../components/ui/LiquidGlass";
import { cn } from "../lib/utils";
import { ProductCardSkeleton } from "../components/ProductCardSkeleton";
import { PaymentModeBanner } from "../components/PaymentModeBanner";

const CountdownTimer = ({ expiresAt }: { expiresAt?: string }) => {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const getTargetDate = () => {
      if (expiresAt) {
        return new Date(expiresAt);
      }
      // Fallback: End of today (midnight) to create high urgency
      const target = new Date();
      target.setHours(23, 59, 59, 999);
      return target;
    };

    const targetDate = getTargetDate();

    const updateTimer = () => {
      const now = new Date().getTime();
      const distance = targetDate.getTime() - now;

      if (distance < 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const hours = Math.floor(distance / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setTimeLeft({ hours, minutes, seconds });
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const padZero = (n: number) => String(n).padStart(2, '0');

  return (
    <span className="flex min-w-0 items-center gap-1 rounded-md border border-brand-accent/20 bg-brand-accent/10 px-1.5 py-1 text-[8px] font-black uppercase text-brand-accent animate-pulse sm:gap-1.5 sm:px-2.5 sm:text-[10px]">
      <span className="hidden sm:inline">Deal ends:</span><span className="truncate font-mono text-[8px] font-bold text-brand-accent sm:bg-brand-accent sm:px-1.5 sm:py-0.5 sm:text-[10px] sm:text-white">{padZero(timeLeft.hours)}:{padZero(timeLeft.minutes)}:{padZero(timeLeft.seconds)}</span>
    </span>
  );
};

export default function Products() {
  const { userId, getToken } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [activeMedal, setActiveMedal] = useState<any>(null);
  const [loadingMedal, setLoadingMedal] = useState(false);

  useEffect(() => {
    if (userId) {
      setLoadingMedal(true);
      fetch(`/api/payments?action=get-medal-status&userId=${userId}&t=${Date.now()}`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.success && data?.medal) {
            setActiveMedal(data.medal);
          }
        })
        .catch((err) => console.error("Error fetching medal status:", err))
        .finally(() => setLoadingMedal(false));
    }
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function fetchPlans() {
      setLoading(true);
      setErrorMessage(null);

      const timeoutId = setTimeout(() => {
        if (isMounted) {
          setLoading(false);
          setErrorMessage("Fetch timed out. Checking your connection...");
        }
      }, 5000);

      try {
        const { data, error } = await supabase
          .from("plans")
          .select("*")
          .eq("is_active", true)
          .order("price", { ascending: true });

        clearTimeout(timeoutId);

        if (error) {
          console.error("Supabase plans error:", error);
          if (isMounted) setErrorMessage(`Connection issue: ${error.message}`);
        } else if (isMounted) {
          setPlans(data || []);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        console.error("Plans fetch fail:", err);
        if (isMounted)
          setErrorMessage(
            "Failed to load products. Please check your network.",
          );
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchPlans();
    const channel = supabase
      .channel("products-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plans" },
        fetchPlans,
      )
      .subscribe((status) => {
        console.log("Realtime Status:", status);
      });

    return () => {
      isMounted = false;
      controller.abort();
      supabase.removeChannel(channel);
    };
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleContinue = async (plan: any) => {
    if (!userId) {
      navigate(`/login?redirect=${encodeURIComponent(`/checkout/confirm?planId=${plan.id}`)}`);
      return;
    }
    navigate(`/checkout/confirm?planId=${plan.id}`);
  };

  const getDisplayPrice = (plan: any) => {
    const now = new Date();
    const discountPrice =
      plan.discount_price != null
        ? plan.discount_price
        : plan.discountPrice != null
          ? plan.discountPrice
          : null;
    const discountExpiry = plan.discount_expires_at;

    const hasValidDiscount = !!(
      discountPrice !== null &&
      Number(discountPrice) > 0 &&
      Number(discountPrice) < Number(plan.price) &&
      (!discountExpiry || new Date(discountExpiry) > now)
    );

    const basePrice = hasValidDiscount ? Number(discountPrice) : Number(plan.price);
    let finalPrice = basePrice;
    let medalDiscountApplied = false;

    if (activeMedal && !plan.category?.startsWith("medal_")) {
      finalPrice = Math.round(basePrice * (1 - activeMedal.discount));
      medalDiscountApplied = true;
    }

    return {
      hasDiscount: hasValidDiscount || medalDiscountApplied,
      displayPrice: finalPrice,
      originalPrice: Number(plan.price),
      discountPrice: hasValidDiscount || medalDiscountApplied ? finalPrice : null,
      isMedalDiscount: medalDiscountApplied,
      medalDiscountPercent: activeMedal ? Math.round(activeMedal.discount * 100) : 0,
    };
  };

  return (
    <div className="relative min-h-screen bg-brand-bg px-3 py-20 sm:px-4">
      <Helmet>
        <title>Plugsy - Products</title>
        <meta name="description" content="Explore affordable premium digital products including CapCut Pro max, UI/UX courses, and LUTs for creators on Plugsy." />
      </Helmet>
      
      <div className="max-w-7xl mx-auto">
        <PaymentModeBanner />
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3"
          >
            <Shield size={16} />
            <span>{errorMessage}</span>
            <button
              onClick={() => window.location.reload()}
              className="ml-auto underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              Retry
            </button>
          </motion.div>
        )}
        <h1 className="mb-10 text-center font-display font-bold uppercase tracking-tight sm:mb-20">
          All <span className="text-brand-accent">Products</span>
        </h1>

        {loadingMedal ? (
          <div className="mb-12 p-6 bg-brand-surface border border-brand-border rounded-3xl animate-pulse flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-brand-accent/20 rounded-full" />
            <div className="h-4 w-48 bg-brand-border rounded" />
            <div className="h-3 w-64 bg-brand-border/50 rounded" />
          </div>
        ) : activeMedal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-12 p-6 bg-gradient-to-r from-brand-accent/20 via-brand-accent/5 to-brand-accent/20 border border-brand-accent/30 rounded-3xl text-center relative overflow-hidden group shadow-lg shadow-brand-accent/10"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--brand-accent)_0%,_transparent_70%)] opacity-5 group-hover:opacity-10 transition-opacity" />
            <div className="relative z-10 flex flex-col items-center gap-2">
              <div className="flex items-center gap-3 mb-1">
                <Award className="text-brand-accent animate-bounce" size={24} />
                <h2 className="text-xl font-black uppercase tracking-tight text-brand-text">
                  {activeMedal.name} Benefits Active
                </h2>
                <Award className="text-brand-accent animate-bounce" size={24} />
              </div>
              <p className="text-brand-text-secondary text-xs font-bold uppercase tracking-widest">
                A permanent <span className="text-brand-accent">{Math.round(activeMedal.discount * 100)}% Discount</span> has been applied to all eligible products.
              </p>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 lg:gap-8">
          {loading ? (
            <>
              {[1, 2, 3].map((i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </>
          ) : plans.length > 0 ? (
            <>
              {plans.filter(p => !p.name.toLowerCase().includes("medal")).map((plan, index) => (
                <motion.div
                  layoutId={`product-card-${plan.id}`}
                  key={plan.id}
                  className="card-premium group flex min-w-0 flex-col border-brand-accent/50 p-3 ring-1 ring-brand-accent/20 sm:p-6 lg:p-8"
                >
                  {plan.image_url ? (
                    <img
                      src={plan.image_url}
                      alt={plan.name}
                      className="mb-4 aspect-[4/3] h-auto w-full rounded-xl border border-brand-border object-cover sm:mb-6 sm:rounded-2xl"
                      loading="lazy"
                    />
                  ) : (
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-accent/10 sm:mb-6 sm:h-14 sm:w-14 sm:rounded-2xl">
                      <Video size={24} className="text-brand-accent" />
                    </div>
                  )}

                  <motion.h3
                    layoutId={`product-title-${plan.id}`}
                    className="mb-2 line-clamp-2 text-sm font-black uppercase leading-tight tracking-tighter sm:text-xl"
                  >
                    {plan.name || plan.product_name || "Premium Plan"}
                  </motion.h3>
                  {plan.description && (
                    <p className="mb-4 line-clamp-3 text-[10px] leading-4 text-brand-text-secondary sm:mb-6 sm:text-sm sm:leading-5">
                      {plan.description}
                    </p>
                  )}

                  <motion.div
                    layoutId={`product-price-${plan.id}`}
                    className="mb-4 flex flex-col sm:mb-6"
                  >
                    {(() => {
                      const priceInfo = getDisplayPrice(plan);
                      return priceInfo.hasDiscount ? (
                        <div className="flex flex-col gap-1 items-start">
                          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                            <span className="rounded-full bg-brand-accent px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white sm:px-2 sm:text-xs sm:tracking-widest">
                              -
                              {Math.round(
                                (1 -
                                  priceInfo.displayPrice /
                                    priceInfo.originalPrice) *
                                  100,
                              )}
                              % OFF
                            </span>
                            <CountdownTimer expiresAt={plan.discount_expires_at} />
                            {priceInfo.isMedalDiscount && (
                              <span className={cn(
                                "flex items-center gap-1 rounded-full border px-1.5 py-1 text-[8px] font-black uppercase tracking-wider shadow-sm sm:gap-1.5 sm:px-2.5 sm:text-[10px] sm:tracking-widest",
                                activeMedal.name.includes("Gold") ? "bg-amber-400/20 text-amber-500 border-amber-400/30" :
                                activeMedal.name.includes("Silver") ? "bg-slate-400/20 text-slate-400 border-slate-400/30" :
                                "bg-orange-500/20 text-orange-500 border-orange-500/30"
                              )}>
                                <Award size={10} className="animate-bounce" />
                                {activeMedal.name.includes("Gold") ? "Gold" : activeMedal.name.includes("Silver") ? "Silver" : "Bronze"}<span className="hidden sm:inline"> Holder Reward</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span
                              style={{ color: "#22c55e", fontWeight: "bold" }}
                              className="text-lg font-black text-brand-accent sm:text-3xl"
                            >
                              ₦
                              {priceInfo.displayPrice.toLocaleString(
                                undefined,
                                {
                                  maximumFractionDigits: 0,
                                },
                              )}
                            </span>
                            <span
                              style={{
                                textDecoration: "line-through",
                                color: "#888",
                              }}
                              className="text-[9px] line-through opacity-50 sm:text-sm"
                            >
                              ₦
                              {priceInfo.originalPrice.toLocaleString(
                                undefined,
                                {
                                  maximumFractionDigits: 0,
                                },
                              )}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-lg font-black sm:text-3xl">
                          ₦
                          {priceInfo.displayPrice.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      );
                    })()}
                  </motion.div>

                  {Array.isArray(plan.features) && plan.features.length > 0 && (
                    <ul className="mb-4 flex-1 space-y-2 sm:mb-8 sm:space-y-3">
                      {plan.features.map((feature: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5 text-[9px] sm:gap-3 sm:text-sm">
                          <CheckCircle2
                            size={16}
                            className="mt-0.5 shrink-0 text-brand-accent"
                          />
                          <span className="text-brand-text/90 leading-tight">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <motion.div
                    layoutId={`product-cta-${plan.id}`}
                    className="mt-auto w-full"
                  >
                    <LiquidGlass
                      button
                      chromaticAberration={2}
                      onClick={() => handleContinue(plan)}
                      className="btn-primary w-full !px-2 !py-3 text-center text-[9px] font-black uppercase tracking-wider sm:!py-4 sm:text-xs sm:tracking-widest"
                    >
                      <span className="flex items-center justify-center gap-2">
                        {userId ? "Pay Now" : "Login to Pay"}{" "}
                        <ArrowRight size={16} />
                      </span>
                    </LiquidGlass>
                  </motion.div>
                </motion.div>
              ))}
              {/* Portfolio Product Card placeholder */}
              <motion.div
                layoutId="product-card-portfolio"
                className="card-premium group flex min-w-0 flex-col border-brand-accent/50 p-3 ring-1 ring-brand-accent/20 sm:p-6 lg:p-8"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-accent/10 sm:mb-6 sm:h-14 sm:w-14 sm:rounded-2xl">
                  <Video size={24} className="text-brand-accent" />
                </div>

                <motion.h3
                  layoutId="product-title-portfolio"
                  className="mb-2 line-clamp-2 text-sm font-black uppercase leading-tight tracking-tighter sm:text-xl"
                >
                  Professional Portfolio
                </motion.h3>
                <p className="mb-4 line-clamp-3 text-[10px] leading-4 text-brand-text-secondary sm:mb-6 sm:text-sm sm:leading-5">
                  Create a stunning public portfolio to showcase your edits and
                  connect with clients instantly.
                </p>

                <ul className="mb-4 mt-2 flex-1 space-y-2 sm:mb-8 sm:mt-4 sm:space-y-3">
                  <li className="flex items-start gap-1.5 text-[9px] sm:gap-3 sm:text-sm">
                    <CheckCircle2
                      size={16}
                      className="text-brand-accent shrink-0 mt-0.5"
                    />
                    <span className="text-brand-text/90 leading-tight">
                      Custom Public URL Profile
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5 text-[9px] sm:gap-3 sm:text-sm">
                    <CheckCircle2
                      size={16}
                      className="text-brand-accent shrink-0 mt-0.5"
                    />
                    <span className="text-brand-text/90 leading-tight">
                      Video & Image Showcase
                    </span>
                  </li>
                </ul>

                <motion.div
                  layoutId="product-cta-portfolio"
                  className="mt-auto w-full"
                >
                  <LiquidGlass
                    button
                    chromaticAberration={2}
                    className="btn-primary w-full !px-2 !py-3 sm:!py-4"
                    onClick={() => navigate("/portfolio")}
                  >
                    <span className="flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-wider sm:gap-2 sm:text-xs sm:tracking-widest">
                      Build Portfolio <ArrowRight size={16} />
                    </span>
                  </LiquidGlass>
                </motion.div>
              </motion.div>
            </>
          ) : (
            <div className="col-span-full text-center py-20">
              <p className="text-brand-text-secondary text-xs uppercase tracking-widest mb-4">
                No products available
              </p>
              <button
                onClick={() => window.location.reload()}
                className="text-brand-accent text-xs font-bold underline underline-offset-4 hover:opacity-80 transition-opacity"
              >
                Reload Page
              </button>
            </div>
          )}

          {/* Blur cards */}
          {[
            {
              name: "Learn with Plugsy",
              icon: GraduationCap,
              desc: "Master digital skills with expert-led courses.",
            },
            {
              name: "Color Grading LUTs",
              icon: Palette,
              desc: "Cinematic presets for professional video creators.",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="card-premium relative flex min-w-0 flex-col border-brand-border p-3 opacity-60 grayscale transition-all duration-300 hover:scale-[1.02] hover:opacity-80 sm:p-6 lg:p-8"
            >
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-brand-surface/80 backdrop-blur-sm rounded-[2rem]">
                <span className="rounded-full border border-brand-border px-2 py-2 text-center text-[9px] font-black uppercase tracking-wider text-brand-text sm:px-6 sm:text-sm sm:tracking-widest">
                  Coming Soon
                </span>
              </div>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-brand-border bg-brand-surface sm:mb-6 sm:h-14 sm:w-14 sm:rounded-2xl">
                <item.icon size={24} className="text-brand-text-secondary" />
              </div>
              <h3 className="mb-3 text-sm font-black uppercase leading-tight tracking-tighter sm:text-xl">
                {item.name}
              </h3>
              <p className="mb-4 text-[10px] leading-4 text-brand-text-secondary sm:text-sm">{item.desc}</p>
              <div className="btn-secondary !px-2 !py-3 text-center text-[9px] font-black uppercase tracking-wider opacity-50 sm:!py-4 sm:text-xs sm:tracking-widest">
                Coming Soon
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
