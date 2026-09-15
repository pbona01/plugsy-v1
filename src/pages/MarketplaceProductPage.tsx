import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, CheckCircle2, Copy, Loader2, LockKeyhole, Mail, ShieldCheck, Store } from "lucide-react";
import toast from "react-hot-toast";
import { MarketplaceMark } from "../components/icons/MarketplaceMark";
import { marketplaceAttempt, clearMarketplaceAttempt } from "../utils/marketplaceAttempt.js";

type Product = {
  id: string; title: string; summary: string; description: string; category: string; price: number; currency: string;
  coverImageUrl?: string | null; deliveryLabel: string; privateAccessToken?: string;
  seller: { trustScore: number | null; verified: boolean; completedOrders: number };
};

const formatNaira = (value: number) => `₦${Number(value || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

export default function MarketplaceProductPage() {
  const { id, accessToken } = useParams<{ id?: string; accessToken?: string }>();
  const { userId, getToken } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestChoiceOpen, setGuestChoiceOpen] = useState(false);
  const [buying, setBuying] = useState(false);

  const loadProduct = useCallback(async () => {
    if (!id && !accessToken) return;
    setLoading(true);
    try {
      const endpoint = accessToken
        ? `/api/marketplace?action=private-listing&accessToken=${encodeURIComponent(accessToken)}`
        : `/api/marketplace?action=product&id=${encodeURIComponent(id || "")}`;
      const response = await fetch(endpoint, { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "This product is unavailable.");
      setProduct(payload.listing);
    } catch (error: any) {
      toast.error(error.message || "This product is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, id]);

  useEffect(() => { void loadProduct(); }, [loadProduct]);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: product?.title || "Plugsy product", text: product?.summary || "", url });
      else { await navigator.clipboard.writeText(url); toast.success("Product link copied."); }
    } catch { /* The person intentionally closed sharing. */ }
  };

  const buyWithWallet = async () => {
    if (!product || !userId) { setGuestChoiceOpen(true); return; }
    setBuying(true);
    try {
      const token = await getToken();
      const key = marketplaceAttempt(localStorage, userId, product.id);
      const response = await fetch("/api/marketplace?action=purchase", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": key },
        body: JSON.stringify({ listingId: product.id, idempotencyKey: key, privateAccessToken: product.privateAccessToken || null, acceptedTermsVersion: "marketplace-v1" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Purchase could not be completed.");
      clearMarketplaceAttempt(localStorage, userId, product.id);
      toast.success("Purchase complete. Your product is now in My library.");
      navigate("/marketplace/buyer");
    } catch (error: any) {
      toast.error(error.message || "Purchase could not be completed.");
    } finally {
      setBuying(false);
    }
  };

  if (loading) return <main className="grid min-h-screen place-items-center bg-brand-bg text-brand-text"><Loader2 className="animate-spin text-brand-accent" size={32} /></main>;
  if (!product) return <main className="grid min-h-screen place-items-center bg-brand-bg px-6 text-center text-brand-text"><div><MarketplaceMark className="mx-auto text-brand-accent" size={44} /><h1 className="mt-5 text-2xl font-black">This product is unavailable</h1><Link className="mt-4 inline-block text-sm font-bold text-brand-accent" to="/marketplace">Explore Marketplace</Link></div></main>;

  const description = product.description || product.summary || "This creator has not added a description yet.";
  const category = product.category.replace(/[_-]/g, " ");
  return <main className="min-h-screen bg-brand-bg px-4 pb-20 pt-24 text-brand-text sm:px-6 lg:px-8">
    <Helmet>
      <title>{product.title} | Plugsy Marketplace</title>
      <meta name="description" content={product.summary || description.slice(0, 180)} />
      <meta property="og:type" content="product" />
      <meta property="og:title" content={`${product.title} | Plugsy Marketplace`} />
      <meta property="og:description" content={product.summary || description.slice(0, 180)} />
      {product.coverImageUrl && <meta property="og:image" content={product.coverImageUrl} />}
    </Helmet>
    <div className="mx-auto max-w-6xl">
      <Link to="/marketplace" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-text-secondary transition hover:text-brand-accent"><ArrowLeft size={16} /> Marketplace</Link>
      <div className="mt-6 grid gap-7 lg:grid-cols-[1.1fr_.9fr]">
        <section className="overflow-hidden rounded-[2rem] border border-brand-border bg-brand-surface"><div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-brand-accent/30 via-brand-surface to-cyan-400/20">{product.coverImageUrl ? <img src={product.coverImageUrl} alt={product.title} className="h-full w-full object-cover" /> : <MarketplaceMark className="absolute bottom-8 right-8 text-brand-accent/45" size={112} />}<span className="absolute left-5 top-5 rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur">{category}</span></div><div className="p-6 sm:p-8"><div className="flex flex-wrap items-center gap-2">{product.seller.verified && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-500"><CheckCircle2 size={13} /> Verified seller</span>}<span className="inline-flex items-center gap-1.5 rounded-full bg-brand-accent/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-brand-accent"><ShieldCheck size={13} /> {product.seller.trustScore === null ? "New seller" : `Trust ${product.seller.trustScore}/100`}</span></div><h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">{product.title}</h1>{product.summary && <p className="mt-4 text-lg leading-7 text-brand-text-secondary">{product.summary}</p>}<div className="mt-7 whitespace-pre-wrap text-sm leading-7 text-brand-text-secondary">{description}</div></div></section>
        <aside className="h-fit rounded-[2rem] border border-brand-border bg-brand-surface p-6 shadow-xl sm:p-8"><p className="text-[10px] font-black uppercase tracking-[.2em] text-brand-accent">Digital product</p><p className="mt-3 text-4xl font-black tracking-tight">{formatNaira(product.price)}</p><p className="mt-2 text-sm text-brand-text-secondary">One payment · delivered securely after checkout.</p><button disabled={buying} onClick={() => void buyWithWallet()} className="btn-primary mt-7 flex h-13 w-full items-center justify-center gap-2 px-5 text-xs font-black uppercase tracking-wider disabled:opacity-60">{buying ? <Loader2 className="animate-spin" size={15} /> : "Buy now"} {!buying && <Store size={15} />}</button><button onClick={() => void share()} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-border text-xs font-black uppercase tracking-wider transition hover:border-brand-accent hover:text-brand-accent"><Copy size={14} /> Share product</button><div className="mt-7 space-y-4 border-t border-brand-border pt-6"><div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-brand-accent" size={18} /><div><h2 className="text-sm font-black">10-hour buyer protection</h2><p className="mt-1 text-xs leading-5 text-brand-text-secondary">Report a genuine problem before seller funds are released.</p></div></div><div className="flex gap-3"><LockKeyhole className="mt-0.5 shrink-0 text-brand-accent" size={18} /><div><h2 className="text-sm font-black">Safe delivery</h2><p className="mt-1 text-xs leading-5 text-brand-text-secondary">Your product is delivered only after a confirmed payment.</p></div></div></div></aside>
      </div>
    </div>
    {guestChoiceOpen && <AccountChoice product={product} onClose={() => setGuestChoiceOpen(false)} onSignIn={() => navigate(`/login?redirect=${encodeURIComponent(`/marketplace/product/${product.id}`)}`)} />}
  </main>;
}

function AccountChoice({ product, onClose, onSignIn }: { product: Product; onClose: () => void; onSignIn: () => void }) {
  return <div className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="wallet-checkout-title" className="w-full max-w-md rounded-t-[2rem] border border-brand-border bg-brand-bg p-6 shadow-2xl sm:rounded-[2rem]"><button onClick={onClose} className="ml-auto block text-xs font-black uppercase tracking-wider text-brand-text-secondary">Close</button><span className="mt-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-accent/10 text-brand-accent"><Mail size={20} /></span><h2 id="wallet-checkout-title" className="mt-5 text-2xl font-black">Create your free Plugsy account</h2><p className="mt-2 text-sm leading-6 text-brand-text-secondary">Marketplace purchases use your Plugsy Wallet. Create an account, fund your wallet, then your product and receipt will be saved and sent to your email.</p><button onClick={onSignIn} className="btn-primary mt-6 flex h-12 w-full items-center justify-center gap-2 text-xs font-black uppercase tracking-wider">Create account to continue</button><div className="mt-3 rounded-xl border border-brand-border bg-brand-surface p-4"><p className="text-sm font-black">Why a Plugsy Wallet?</p><p className="mt-1 text-xs leading-5 text-brand-text-secondary">It keeps your purchase protected, prevents duplicate charges and gives you one secure place to access every product you own. Flutterwave is only used to fund your wallet.</p></div><p className="mt-5 text-center text-[10px] font-bold uppercase tracking-wider text-brand-text-secondary">{product.title} · {formatNaira(product.price)}</p></section></div>;
}
