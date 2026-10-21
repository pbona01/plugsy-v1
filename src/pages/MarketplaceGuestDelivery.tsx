import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { ProductReviewPanel } from "../components/marketplace/ProductReviewPanel";

type DeliveryItem = { id: string; deliveryUrl: string; label: string; description?: string; kind: "file" | "link"; contentType?: string };
type DeliveryPayload = { title?: string; deliveries: DeliveryItem[] };

export default function MarketplaceGuestDelivery() {
  const { token = "" } = useParams<{ token: string }>();
  const [delivery, setDelivery] = useState<DeliveryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/marketplace?action=guest-delivery&token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "This delivery link is unavailable.");
      const items = Array.isArray(payload.deliveries) ? payload.deliveries : payload.deliveryUrl ? [{ id: payload.deliveryUrl, deliveryUrl: payload.deliveryUrl, label: payload.deliveryLabel || "Open product", kind: "link" }] : [];
      if (!items.length) throw new Error("This product delivery is temporarily unavailable.");
      setDelivery({ title: payload.title, deliveries: items });
    } catch (error: any) { toast.error(error.message || "This delivery link is unavailable."); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const productTitle = delivery?.title || delivery?.deliveries[0]?.label || "your purchase";
  const submitReview = async (rating: number, body: string) => {
    const response = await fetch("/api/marketplace?action=submit-guest-review", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ deliveryToken: token, rating, body }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) throw new Error(payload?.error || "Could not post your review.");
    toast.success("Thanks — your verified review has been posted."); setReviewOpen(false);
  };
  return <main className="min-h-screen bg-brand-bg px-5 py-20 text-brand-text"><section className="mx-auto w-full max-w-2xl rounded-3xl border border-brand-border bg-brand-surface p-6 shadow-xl sm:p-8">{loading ? <Loader2 className="mx-auto animate-spin text-brand-accent" size={38} /> : delivery ? <><CheckCircle2 className="text-emerald-500" size={46} /><p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-brand-accent">Payment confirmed · Receipt emailed</p><h1 className="mt-2 text-3xl font-black">Your product is ready</h1><p className="mt-3 text-sm leading-6 text-brand-text-secondary">Your secure access link was also sent to your email. Save that receipt to return here and download the latest seller version anytime.</p><div className="mt-7 space-y-3">{delivery.deliveries.map((item, index) => <a key={item.id || index} href={item.deliveryUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 rounded-2xl border border-brand-border bg-brand-bg p-4 transition hover:border-brand-accent"><span className="min-w-0"><strong className="block text-sm">{item.label || `Product item ${index + 1}`}</strong>{item.description && <span className="mt-1 block whitespace-pre-wrap text-xs leading-5 text-brand-text-secondary">{item.description}</span>}<span className="mt-2 block text-[10px] font-black uppercase tracking-wider text-brand-accent">{item.kind === "file" ? (item.contentType?.startsWith("video/") ? "Watch video" : "Download file") : "Open lesson"}</span></span><ArrowRight className="shrink-0 text-brand-accent" size={17} /></a>)}</div>{reviewOpen ? <div className="mt-6"><ProductReviewPanel productTitle={productTitle} onClose={() => setReviewOpen(false)} onSubmit={submitReview}/></div> : <button onClick={() => setReviewOpen(true)} className="mt-6 flex h-11 w-full items-center justify-center rounded-xl border border-brand-accent/40 text-xs font-black uppercase tracking-wider text-brand-accent transition hover:bg-brand-accent/10">Review this product</button>}<div className="mt-6 rounded-2xl border border-brand-accent/25 bg-brand-accent/[.06] p-4"><div className="flex gap-3"><UserPlus className="shrink-0 text-brand-accent" size={18} /><div><h2 className="font-black">Keep your purchases in one place</h2><p className="mt-1 text-xs leading-5 text-brand-text-secondary">Create a free Plugsy account to keep future products in your library.</p><Link to="/register" className="mt-3 inline-block text-xs font-black uppercase tracking-wider text-brand-accent">Create free account</Link></div></div></div></> : <><h1 className="text-2xl font-black">This delivery link is unavailable</h1><p className="mt-3 text-sm text-brand-text-secondary">Check your receipt email or contact Plugsy support.</p></>}</section></main>;
}
