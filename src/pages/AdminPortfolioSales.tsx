import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { 
  DollarSign, 
  ChevronLeft, 
  Briefcase, 
  ShieldCheck, 
  Clock, 
  ArrowLeft,
  Loader2, 
  Zap, 
  ExternalLink 
} from "lucide-react";

interface PortfolioPurchase {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  category: string | null;
  amount: number;
  paystack_ref: string | null;
  purchase_code_used: string | null;
  purchase_code_owner_id: string | null;
  reward_amount: number | null;
  reward_status: string | null;
  created_at: string;
}

export default function AdminPortfolioSales() {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState<PortfolioPurchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPurchases() {
      try {
        const { data, error } = await supabase
          .from("portfolio_purchases")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setPurchases(data || []);
      } catch (err) {
        console.error("Error fetching purchases:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPurchases();
  }, []);

  const formatCategory = (slug: string) => {
    if (!slug) return "—";
    const mapping: Record<string, string> = {
      graphic_design: "Graphic Design",
      video_editing: "Video Editing",
      web_development: "Web Dev",
      uiux_design: "UI/UX Design",
      copywriting: "Copywriting",
      digital_marketing: "Digital Marketing",
      photography: "Photography",
      ai_automation: "AI Automation",
      cybersecurity: "Cybersecurity",
      three_d_design: "3D Animation & VFX"
    };
    return mapping[slug] || slug;
  };

  const totalRevenue = purchases.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalPurchases = purchases.length;
  const totalReferralPayouts = purchases.reduce((sum, p) => sum + (Number(p.reward_amount) || 0), 0);

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text font-sans flex flex-col">
      {/* Premium Top Navigation bar */}
      <header className="border-b border-brand-border bg-brand-surface/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/admin")}
              className="p-2 rounded-xl bg-brand-text/5 hover:bg-brand-text/10 text-brand-text-secondary hover:text-brand-text transition-all flex items-center justify-center border border-brand-border cursor-pointer"
              title="Back to Control Panel"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-brand-accent">Admin Portal</span>
              <h1 className="text-xl font-black uppercase tracking-tight leading-none text-white mt-1">PORTFOLIO SALES</h1>
            </div>
          </div>
          
          <div className="px-4 py-2 bg-brand-text/5 border border-brand-border rounded-full flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_1.5s_infinite]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">Secured Ledger Connection</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-8">
        <header>
          <p className="text-brand-text-secondary font-bold uppercase tracking-widest text-xs">
            Portfolio purchase history
          </p>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 size={40} className="animate-spin text-brand-accent text-white" />
            <p className="text-[10px] uppercase font-black tracking-widest text-brand-text-secondary">Syncing ledger records...</p>
          </div>
        ) : (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1 */}
              <div 
                className="p-6 bg-[#111] border border-[#222]"
                style={{ borderRadius: "12px" }}
              >
                <div className="text-[28px] font-extrabold text-white leading-tight">
                  ₦{totalRevenue.toLocaleString()}
                </div>
                <div className="text-[10px] font-bold text-[#888] uppercase tracking-wider mt-2">
                  Total Revenue
                </div>
              </div>

              {/* Card 2 */}
              <div 
                className="p-6 bg-[#111] border border-[#222]"
                style={{ borderRadius: "12px" }}
              >
                <div className="text-[28px] font-extrabold text-white leading-tight">
                  {totalPurchases}
                </div>
                <div className="text-[10px] font-bold text-[#888] uppercase tracking-wider mt-2">
                  {totalPurchases} portfolios sold
                </div>
              </div>

              {/* Card 3 */}
              <div 
                className="p-6 bg-[#111] border border-[#222]"
                style={{ borderRadius: "12px" }}
              >
                <div className="text-[28px] font-extrabold text-white leading-tight">
                  ₦{totalReferralPayouts.toLocaleString()}
                </div>
                <div className="text-[10px] font-bold text-[#888] uppercase tracking-wider mt-2">
                  Referral Payouts
                </div>
              </div>
            </div>

            {/* Purchases Table */}
            <div className="overflow-hidden rounded-[20px] border border-brand-border bg-brand-surface shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-brand-border bg-brand-text/5 text-[#555]">
                      <th className="p-4 px-6 text-[11px] font-bold uppercase tracking-widest">User Email</th>
                      <th className="p-4 px-6 text-[11px] font-bold uppercase tracking-widest">Name</th>
                      <th className="p-4 px-6 text-[11px] font-bold uppercase tracking-widest">Category</th>
                      <th className="p-4 px-6 text-[11px] font-bold uppercase tracking-widest">Amount</th>
                      <th className="p-4 px-6 text-[11px] font-bold uppercase tracking-widest">Code Used</th>
                      <th className="p-4 px-6 text-[11px] font-bold uppercase tracking-widest">Referral Paid</th>
                      <th className="p-4 px-6 text-[11px] font-bold uppercase tracking-widest">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-brand-text-secondary font-bold uppercase tracking-widest text-[#555]">
                          No portfolio purchases yet.
                        </td>
                      </tr>
                    ) : (
                      purchases.map((purchase, index) => {
                        const isEven = index % 2 === 0;
                        const rowBg = isEven ? "bg-[#0a0a0a]" : "bg-[#111]";
                        return (
                          <tr 
                            key={purchase.id} 
                            className={`border-b border-brand-border/40 ${rowBg} hover:opacity-90 transition-opacity`}
                          >
                            <td className="p-4 px-6 text-xs text-white break-all font-mono leading-relaxed">
                              {purchase.user_email || "—"}
                            </td>
                            <td className="p-4 px-6 text-xs text-brand-text-secondary uppercase tracking-wider font-extrabold">
                              {purchase.user_name || "—"}
                            </td>
                            <td className="p-4 px-6 text-xs text-white uppercase tracking-widest font-black text-brand-accent">
                              {formatCategory(purchase.category || "")}
                            </td>
                            <td className="p-4 px-6 text-xs font-mono text-white font-bold">
                              ₦{(purchase.amount || 0).toLocaleString()}
                            </td>
                            <td className="p-4 px-6 text-xs text-brand-text-secondary uppercase font-mono tracking-widest">
                              {purchase.purchase_code_used || "—"}
                            </td>
                            <td className="p-4 px-6 text-xs font-mono text-brand-text-secondary leading-normal">
                              {purchase.reward_amount ? `₦${purchase.reward_amount.toLocaleString()}` : "—"}
                            </td>
                            <td className="p-4 px-6 text-xs text-[#888] font-mono whitespace-nowrap">
                              {purchase.created_at ? new Date(purchase.created_at).toLocaleDateString() : "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
