import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth, useUser } from "@clerk/clerk-react";
import {
  Shield,
  ChevronRight,
  Loader2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Wallet,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { toast } from "react-hot-toast";
import { LiquidGlass } from "../components/ui/LiquidGlass";
import { getStableIdempotencyKey, clearStableIdempotencyKey } from "../utils/idempotency";

export default function CheckoutConfirm() {
  const [searchParams] = useSearchParams();
  const planId = searchParams.get("planId");
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { user } = useUser();
  const userId = user?.id;

  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [purchaseCode, setPurchaseCode] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    status: "none" | "valid" | "invalid" | "self";
    ownerName?: string;
    ownerId?: string;
  }>({ status: "none" });
  const [processing, setProcessing] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [useWallet, setUseWallet] = useState(true);
  const [activeMedal, setActiveMedal] = useState<any>(null);

  useEffect(() => {
    if (userId) {
      fetch(`/api/payments?action=get-medal-status&userId=${userId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.success && data?.medal) {
            setActiveMedal(data.medal);
          }
        })
        .catch((err) => console.error("Error fetching medal status:", err));
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      supabase.from("profiles").select("*").eq("clerk_id", userId).single().then(({ data }) => {
        if (data) setProfile(data);
      });
    }
  }, [userId]);

  useEffect(() => {
    if (!planId) {
      navigate("/products");
      return;
    }

    async function fetchPlan() {
      try {
        const { data, error } = await supabase
          .from("plans")
          .select("*")
          .eq("id", planId)
          .single();
        if (error) throw error;
        setPlan(data);
      } catch (err) {
        console.error("Plan fetch error:", err);
        toast.error("Failed to load plan details.");
        navigate("/products");
      } finally {
        setLoading(false);
      }
    }

    fetchPlan();
  }, [planId, navigate]);

  // Real-time scanner logic
  useEffect(() => {
    const code = purchaseCode.trim();
    if (code.length < 4) {
      setScanResult({ status: "none" });
      return;
    }

    const timer = setTimeout(() => {
      handleScan(code);
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [purchaseCode]);

  const handleScan = async (code: string) => {
    if (!code || code.length < 4) return;
    setIsScanning(true);
    try {
      // Step 1: Validate against the API
      const res = await fetch("/api/purchase-code?action=validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await getToken()}`,
        },
        body: JSON.stringify({ code: code.toUpperCase() }),
      });

      // If code in state has changed since request started, ignore results
      if (purchaseCode.trim().toUpperCase() !== code.toUpperCase()) return;

      const text = await res.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        throw new Error("Invalid response from server");
      }

      if (!res.ok) {
        if (result.message === "You cannot use your own purchase code") {
          setScanResult({ status: "self" });
        } else {
          setScanResult({ status: "invalid" });
        }
        return;
      }

      if (!result.valid) {
        setScanResult({ status: "invalid" });
      } else {
        const { data: profileQuery } = await supabase
          .from("profiles")
          .select("clerk_id")
          .eq("id", result.owner_id || result.ownerId)
          .maybeSingle();
        const finalOwnerClerkId = profileQuery?.clerk_id || result.owner_clerk_id || result.owner_id || result.ownerId;

        setScanResult({
          status: "valid",
          ownerName: result.owner_name || result.ownerName,
          ownerId: finalOwnerClerkId,
        });
        toast.success(
          `Purchase code applied: ${result.owner_name || result.ownerName || "Success"}! ✨`,
          { id: "code-success" },
        );
      }
    } catch (err: any) {
      console.error("Code scanning error");
      // Fallback to RPC if API route fails
      try {
        const { data, error } = await supabase.rpc("get_code_owner", {
          lookup_code: code.trim().toUpperCase(),
        });
        if (purchaseCode.trim().toUpperCase() !== code.toUpperCase()) return;
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : data;
        if (!result || !result.valid) {
          setScanResult({ status: "invalid" });
        } else if (result.owner_id === userId) {
          setScanResult({ status: "self" });
        } else {
          const { data: profileQueryFallback } = await supabase
            .from("profiles")
            .select("clerk_id")
            .eq("id", result.owner_id)
            .maybeSingle();
          const finalOwnerClerkId = profileQueryFallback?.clerk_id || result.owner_clerk_id || result.owner_id;

          setScanResult({
            status: "valid",
            ownerName: result.owner_name,
            ownerId: finalOwnerClerkId,
          });
        }
      } catch (innerErr) {
        setScanResult({ status: "invalid" });
      }
    } finally {
      setIsScanning(false);
    }
  };

  if (loading || !plan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-surface">
        <Loader2 className="animate-spin text-brand-accent w-12 h-12" />
      </div>
    );
  }

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

  const handleContinue = async () => {
    if (!userId) {
      toast.error("Please login first.");
      return;
    }

    setProcessing(true);
    const loadingToast = toast.loading("Checking out...");

    try {
      const token = await getToken();
      const key = getStableIdempotencyKey(`product:${plan.id}`);
      const res = await fetch("/api/payments?action=purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          planId: plan.id,
          purchaseCode: scanResult.status === "valid" ? purchaseCode.trim() : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Wallet purchase failed.");
      }
      clearStableIdempotencyKey(`product:${plan.id}`);
      toast.success(
        data.pending
          ? "Purchase recorded. Login is required to deliver this product."
          : "Purchase successful.",
        { id: loadingToast },
      );
      if (data.pending) {
        navigate("/chat");
        return;
      }
      if (data.medal?.number) {
        navigate("/medals?success=medal");
        return;
      }
      navigate(`/payment/callback?reference=${encodeURIComponent(data.reference)}`);
    } catch (err: any) {
      console.error("Checkout Error:", err);
      toast.error(err.message || "Failed to proceed to checkout.", {
        id: loadingToast,
      });
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen pt-12 pb-20 px-4 bg-brand-bg font-serif">
      <div className="max-w-xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <header className="text-center space-y-2">
            <div className="h-[2px] w-12 bg-brand-accent mx-auto mb-6" />
            <h1 className="text-3xl font-black uppercase tracking-tight text-brand-text">
              Checkout <span className="text-brand-accent">Confirm</span>
            </h1>
            <p className="text-brand-text/40 font-mono text-[9px] uppercase tracking-[0.3em]">
              Minimalist Verification Block
            </p>
          </header>

          <motion.div
            layoutId={`product-card-${plan.id}`}
            className="bg-brand-card border-brand-border border p-8 shadow-sm relative text-brand-text rounded-sm"
          >
            <div className="flex flex-col gap-8">
              <div className="flex justify-between items-baseline">
                <div className="space-y-1">
                  <motion.h3
                    layoutId={`product-title-${plan.id}`}
                    className="text-xl font-bold uppercase tracking-tighter text-brand-text"
                  >
                    {plan.name || plan.product_name}
                  </motion.h3>
                  <p className="text-[10px] font-mono text-brand-text-secondary uppercase tracking-widest">
                    {plan.duration_label || plan.plan_duration}
                  </p>
                </div>
                <div className="text-right">
                  <motion.div
                    layoutId={`product-price-${plan.id}`}
                    className="flex flex-col items-end"
                  >
                    {getDisplayPrice(plan).hasDiscount ? (
                      <>
                        <div className="text-2xl font-bold text-green-600 overflow-hidden relative">
                          ₦{getDisplayPrice(plan).displayPrice.toLocaleString()}
                        </div>
                        <div className="text-sm line-through text-brand-text/50">
                          ₦
                          {getDisplayPrice(plan).originalPrice.toLocaleString()}
                        </div>
                        {getDisplayPrice(plan).isMedalDiscount && (
                          <div className="text-[10px] bg-brand-accent/10 text-brand-accent font-black uppercase tracking-widest px-2 py-0.5 mt-1 rounded border border-brand-accent/20">
                            -{getDisplayPrice(plan).medalDiscountPercent}% MEDAL BOOSTED
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-2xl font-bold text-brand-text overflow-hidden relative">
                        ₦{getDisplayPrice(plan).displayPrice.toLocaleString()}
                      </div>
                    )}
                  </motion.div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-brand-border">
                <label className="block text-[10px] font-mono uppercase tracking-[0.2em] text-brand-text-secondary">
                  Affiliate Code (Optional)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ENTER CODE"
                    value={purchaseCode}
                    onChange={(e) =>
                      setPurchaseCode(e.target.value.toUpperCase())
                    }
                    className={`w-full bg-transparent border-b-2 ${scanResult.status === "valid" ? "border-brand-accent text-brand-accent" : scanResult.status === "invalid" || scanResult.status === "self" ? "border-red-500 text-red-500" : "border-brand-border text-brand-text focus:border-brand-text/30"} px-0 py-3 text-sm font-bold focus:outline-none transition-all uppercase tracking-[0.2em] font-mono placeholder:text-brand-text/30`}
                    disabled={isScanning || processing}
                  />
                  {isScanning && (
                    <div className="absolute right-0 top-1/2 -translate-y-1/2">
                      <Loader2
                        size={16}
                        className="animate-spin text-brand-accent"
                      />
                    </div>
                  )}
                </div>

                {scanResult.status !== "none" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[10px] font-mono uppercase tracking-widest pt-2"
                  >
                    {scanResult.status === "valid" ? (
                      <span className="text-brand-accent">
                        Purchase code applied: {scanResult.ownerName}
                      </span>
                    ) : scanResult.status === "self" ? (
                      <span className="text-red-500 underline decoration-dotted">
                        You cannot use your own purchase code.
                      </span>
                    ) : (
                      <span className="text-red-500/50 italic">
                        Invalid purchase code.
                      </span>
                    )}
                  </motion.div>
                )}
              </div>

              <div className="pt-6 border-t border-brand-border">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-brand-text/50">
                    Checkout Total
                  </span>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-brand-text">
                      ₦
                      {(
                        getDisplayPrice(plan).displayPrice
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="text-[9px] font-mono text-brand-text/30 text-right uppercase tracking-[0.3em] italic mt-2">
                  @TruthOverComfort
                </div>
              </div>
            </div>
          </motion.div>

          <div className="space-y-4 pt-4">
            <motion.div layoutId={`product-cta-${plan.id}`} className="w-full space-y-4">
              {(() => {
                const walletBalance = profile?.balance || 0;
                const price = getDisplayPrice(plan).displayPrice;
                const canAfford = walletBalance >= price;

                return (
                  <div>
                    {/* Payment Method Selector */}
                    <div className="space-y-2 mb-4">
                      <label className="block text-[10px] font-mono uppercase tracking-[0.2em] text-brand-text-secondary">
                        Payment Method
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Wallet Method */}
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
                              Bal: ₦{walletBalance.toLocaleString()}
                            </div>
                          </div>
                        </button>

                      </div>
                    </div>

                    {useWallet ? (
                      <div>
                        <button
                          disabled={processing || isScanning}
                          onClick={handleContinue}
                          className="w-full py-4 px-6 rounded-xl font-bold text-sm uppercase tracking-wider text-white transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 border-none bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20"
                        >
                          {processing ? "Processing Order..." : (canAfford ? `Pay ₦${price.toLocaleString()} from Wallet` : "Insufficient Wallet Balance")}
                        </button>

                        {!canAfford && (
                          <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                            <p className="text-xs text-red-400 mb-2">
                              Your wallet balance (₦{walletBalance.toLocaleString()}) is lower than the plan price.
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
                          disabled={processing || isScanning}
                          onClick={handleContinue}
                          className="w-full py-4 px-6 rounded-xl font-bold text-sm uppercase tracking-wider text-white transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 border-none bg-brand-accent hover:bg-brand-accent/90 shadow-lg shadow-brand-accent/20"
                        >
                          {processing ? "Initializing Flutterwave..." : `Pay ₦${price.toLocaleString()} via Flutterwave`}
                        </button>
                        <p className="text-[11px] text-center text-brand-text-secondary mt-2">
                          Supports Card, Bank Transfer, USSD, OPay & Mobile Money
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </motion.div>
            <button
              onClick={() => navigate("/products")}
              className="w-full text-center text-[10px] font-mono uppercase tracking-[0.3em] text-brand-text-secondary hover:text-brand-text transition-colors"
            >
              Cancel Order
            </button>
          </div>

          <footer className="pt-12 text-center space-y-4">
            <div className="flex items-center justify-center gap-8 text-brand-text/50">
              <Shield size={14} />
              <CheckCircle2 size={14} />
              <span className="text-[10px] font-mono uppercase tracking-widest">
                Plugsy Wallet Secured
              </span>
            </div>
          </footer>
        </motion.div>
      </div>
    </div>
  );
}
