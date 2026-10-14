import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import toast from "react-hot-toast";

type DeliveryItem = { id: string; deliveryUrl: string; label: string; description?: string; kind: "file" | "link"; contentType?: string };

export default function MarketplaceGuestDelivery() {
  const { token = "" } = useParams<{ token: string }>();
  const [deliveries, setDeliveries] = useState<DeliveryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/marketplace?action=guest-delivery&token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "This delivery link is unavailable.");
      const items = Array.isArray(payload.deliveries) ? payload.deliveries : payload.deliveryUrl ? [{ id: payload.deliveryUrl, deliveryUrl: payload.deliveryUrl, label: payload.deliveryLabel || "Open product", kind: "link" }] : [];
      if (!items.length) throw new Error("This product delivery is temporarily unavailable.");
      setDeliveries(items);
    } catch (error: any) { toast.error(error.message || "This delivery link is unavailable."); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  return <main className="min-h-screen bg-brand-bg px-5 py-20 text-brand-text"><section className="mx-auto w-full max-w-2xl rounded-3xl border border-brand-border bg-brand-surface p-6 shadow-xl sm:p-8">{loading ? <Loader2 className="mx-auto animate-spin text-brand-accent" size={38} /> : deliveries ? <><CheckCircle2 className="text-emerald-500" size={46} /><p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-brand-accent">Payment confirmed</p><h1 className="mt-2 text-3xl font-black">Your course is ready</h1><p className="mt-3 text-sm leading-6 text-brand-text-secondary">This page always shows the seller&apos;s latest version. New lessons and updates appear here automatically.</p><div className="mt-7 space-y-3">{deliveries.map((delivery, index) => <a key={delivery.id || index} href={delivery.deliveryUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 rounded-2xl border border-brand-border bg-brand-bg p-4 transition hover:border-brand-accent"><span className="min-w-0"><strong className="block text-sm">{delivery.label || `Course item ${index + 1}`}</strong>{delivery.description && <span className="mt-1 block whitespace-pre-wrap text-xs leading-5 text-brand-text-secondary">{delivery.description}</span>}<span className="mt-2 block text-[10px] font-black uppercase tracking-wider text-brand-accent">{delivery.kind === "file" ? (delivery.contentType?.startsWith("video/") ? "Watch video" : "Download file") : "Open lesson"}</span></span><ArrowRight className="shrink-0 text-brand-accent" size={17} /></a>)}</div><div className="mt-6 rounded-2xl border border-brand-accent/25 bg-brand-accent/[.06] p-4"><div className="flex gap-3"><UserPlus className="shrink-0 text-brand-accent" size={18} /><div><h2 className="font-black">Keep your purchases in one place</h2><p className="mt-1 text-xs leading-5 text-brand-text-secondary">Create a free Plugsy account to keep future products in your library.</p><Link to="/register" className="mt-3 inline-block text-xs font-black uppercase tracking-wider text-brand-accent">Create free account</Link></div></div></div></> : <><h1 className="text-2xl font-black">This delivery link is unavailable</h1><p className="mt-3 text-sm text-brand-text-secondary">Check your receipt email or contact Plugsy support.</p></>}</section></main>;
}
