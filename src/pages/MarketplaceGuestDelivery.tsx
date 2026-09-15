import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Download, Loader2, UserPlus } from "lucide-react";
import toast from "react-hot-toast";

export default function MarketplaceGuestDelivery() {
  const { token = "" } = useParams<{ token: string }>();
  const [delivery, setDelivery] = useState<{ deliveryUrl: string; deliveryLabel: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountPrompt, setAccountPrompt] = useState(false);
  const load = useCallback(async () => { try { const response = await fetch(`/api/marketplace?action=guest-delivery&token=${encodeURIComponent(token)}`, { cache: "no-store" }); const payload = await response.json().catch(() => null); if (!response.ok || !payload?.success) throw new Error(payload?.error || "This delivery link is unavailable."); setDelivery(payload); } catch (error: any) { toast.error(error.message || "This delivery link is unavailable."); } finally { setLoading(false); } }, [token]);
  useEffect(() => { void load(); }, [load]);
  const openProduct = () => { if (!delivery) return; window.location.assign(delivery.deliveryUrl); setAccountPrompt(true); };
  return <main className="grid min-h-screen place-items-center bg-brand-bg px-5 text-brand-text"><section className="w-full max-w-md rounded-3xl border border-brand-border bg-brand-surface p-8 text-center shadow-xl">{loading ? <Loader2 className="mx-auto animate-spin text-brand-accent" size={38} /> : delivery ? <><CheckCircle2 className="mx-auto text-emerald-500" size={46} /><p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-brand-accent">Payment confirmed</p><h1 className="mt-2 text-3xl font-black">Your product is ready</h1><p className="mt-3 text-sm leading-6 text-brand-text-secondary">We also sent this secure access link to your email.</p><button onClick={openProduct} className="btn-primary mt-7 flex h-12 w-full items-center justify-center gap-2 text-xs font-black uppercase tracking-wider"><Download size={16} /> {delivery.deliveryLabel}</button>{accountPrompt && <div className="mt-5 rounded-2xl border border-brand-accent/25 bg-brand-accent/[.06] p-4 text-left"><div className="flex gap-3"><UserPlus className="shrink-0 text-brand-accent" size={18} /><div><h2 className="font-black">Keep your purchases in one place</h2><p className="mt-1 text-xs leading-5 text-brand-text-secondary">Create a free Plugsy account to keep future products in your library.</p><Link to="/register" className="mt-3 inline-block text-xs font-black uppercase tracking-wider text-brand-accent">Create free account</Link></div></div></div>}</> : <><h1 className="text-2xl font-black">This delivery link is unavailable</h1><p className="mt-3 text-sm text-brand-text-secondary">Check your receipt email or contact Plugsy support.</p></>}</section></main>;
}
