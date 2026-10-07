import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, BadgePercent, CheckCircle2, Copy, Loader2, LockKeyhole, Mail, MessageCircle, ShieldCheck, Store, UserMinus, UserPlus, UserRound, X } from "lucide-react";
import toast from "react-hot-toast";
import { MarketplaceMark } from "../components/icons/MarketplaceMark";
import { marketplaceAttempt, clearMarketplaceAttempt } from "../utils/marketplaceAttempt.js";
import { loadSavedPurchaseCode } from "../lib/purchaseCodeProfile";
import { TrustScoreMeter } from "../components/marketplace/TrustScoreMeter";
import MarketplaceCookieConsent from "../components/marketplace/MarketplaceCookieConsent";
import { marketplaceMarketingConsent, trackMarketplaceCheckout, trackMarketplaceProductView, trackMarketplacePurchase } from "../utils/marketplaceAds";

type Product = {
  id: string; title: string; summary: string; description: string; category: string; price: number; currency: string;
  coverImageUrl?: string | null; deliveryLabel: string; privateAccessToken?: string;
  resalePolicy: "not_allowed" | "fixed_percent" | "approval_required";
  resaleCommissionPercent: number | null;
  seller: { id?: string; name?: string; username?: string | null; avatar?: string | null; trustScore: number | null; verified: boolean; completedOrders: number; adPixels?: { metaPixelId?: string | null; tiktokPixelId?: string | null } | null };
  fee?: { percent: number; paidBy: "buyer" | "seller"; amount: number; total: number } | null;
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
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [referralInput, setReferralInput] = useState("");
  const [referral, setReferral] = useState<{ code: string; name: string; commissionPercent: number } | null>(null);
  const [referralError, setReferralError] = useState("");
  const [referralBusy, setReferralBusy] = useState(false);
  const [referralOptOut, setReferralOptOut] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [requestedCommission, setRequestedCommission] = useState("15");
  const referralInitialized = useRef<string | null>(null);

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

  useEffect(() => {
    if (!product) return;
    trackMarketplaceProductView(product.seller.adPixels, product);
    const onConsent = (event: Event) => { if ((event as CustomEvent).detail?.marketing === true) trackMarketplaceProductView(product.seller.adPixels, product); };
    window.addEventListener("plugsy-cookie-consent", onConsent);
    return () => window.removeEventListener("plugsy-cookie-consent", onConsent);
  }, [product]);

  const loadComments = useCallback(async () => {
    if (!product?.id) return;
    const response = await fetch(`/api/marketplace?action=comments&listingId=${encodeURIComponent(product.id)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.success) setComments(payload.comments || []);
  }, [product?.id]);

  useEffect(() => { void loadComments(); }, [loadComments]);

  useEffect(() => {
    if (!userId || !product?.seller.id) { setFollowing(false); return; }
    void (async () => {
      const token = await getToken();
      const response = await fetch("/api/marketplace?action=followed-sellers", { headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" } });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.success) setFollowing((payload.sellerIds || []).includes(product.seller.id));
    })();
  }, [getToken, product?.seller.id, userId]);

  const toggleFollow = async () => {
    if (!product?.seller.id) return;
    if (!userId) { navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    if (product.seller.id === userId) return;
    setFollowBusy(true);
    try {
      const token = await getToken();
      const response = await fetch("/api/marketplace?action=follow-seller", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" }, body: JSON.stringify({ sellerId: product.seller.id, follow: !following }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Could not update creator follow.");
      setFollowing(Boolean(payload.following));
      toast.success(payload.following ? "Following creator." : "Creator unfollowed.");
    } catch (error: any) { toast.error(error.message || "Could not update creator follow."); }
    finally { setFollowBusy(false); }
  };

  const postComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!product || !commentText.trim()) return;
    if (!userId) { navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    setCommentBusy(true);
    try {
      const token = await getToken();
      const response = await fetch(`/api/marketplace?action=comments&listingId=${encodeURIComponent(product.id)}`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" }, body: JSON.stringify({ body: commentText.trim() }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Could not post comment.");
      setComments((current) => [payload.comment, ...current]); setCommentText("");
    } catch (error: any) { toast.error(error.message || "Could not post comment."); }
    finally { setCommentBusy(false); }
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: product?.title || "Plugsy product", text: product?.description || product?.summary || "View this digital product on Plugsy.", url });
      else { await navigator.clipboard.writeText(url); toast.success("Product link copied."); }
    } catch { /* The person intentionally closed sharing. */ }
  };

  const validateReferral = useCallback(async (code: string, silent = false) => {
    if (!product?.id || !userId || !code.trim()) return false;
    setReferralBusy(true);
    setReferralError("");
    try {
      const token = await getToken();
      const response = await fetch("/api/marketplace?action=validate-referral", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ listingId: product.id, code: code.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "That purchase code cannot be used for this product.");
      setReferral(payload.referral);
      setReferralInput(payload.referral.code);
      setReferralOptOut(false);
      return true;
    } catch (error: any) {
      setReferral(null);
      if (!silent) setReferralError(error.message || "That purchase code cannot be used for this product.");
      return false;
    } finally { setReferralBusy(false); }
  }, [getToken, product?.id, userId]);

  useEffect(() => {
    if (!product?.id || !userId || product.resalePolicy === "not_allowed" || referralInitialized.current === product.id) return;
    referralInitialized.current = product.id;
    setReferral(null); setReferralInput(""); setReferralError(""); setReferralOptOut(false);
    void (async () => {
      const linkedCode = new URLSearchParams(window.location.search).get("ref") || "";
      if (linkedCode) { setReferralInput(linkedCode); await validateReferral(linkedCode); return; }
      try {
        const saved = await loadSavedPurchaseCode(getToken);
        const code = saved?.savedCode || "";
        if (code) { setReferralInput(code); await validateReferral(code, true); }
      } catch { /* A saved code is optional at checkout. */ }
    })();
  }, [getToken, product?.id, product?.resalePolicy, userId, validateReferral]);

  const removeReferral = () => {
    setReferral(null); setReferralInput(""); setReferralError(""); setReferralOptOut(true);
  };

  const shareReferralLink = async () => {
    if (!product || !userId) { navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    setReferralBusy(true);
    try {
      const token = await getToken();
      const response = await fetch("/api/marketplace?action=referral-link", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" }, body: JSON.stringify({ listingId: product.id }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        if (product.resalePolicy === "approval_required" && payload?.code === "REFERRER_NOT_APPROVED") { setApprovalOpen(true); return; }
        throw new Error(payload?.error || "Your referral link is not available yet.");
      }
      const url = new URL(payload.referral.path, window.location.origin).toString();
      if (navigator.share) await navigator.share({ title: product.title, text: `Buy ${product.title} on Plugsy`, url });
      else { await navigator.clipboard.writeText(url); toast.success("Your tracked referral link was copied."); }
    } catch (error: any) { if (error?.name !== "AbortError") toast.error(error.message || "Your referral link is not available yet."); }
    finally { setReferralBusy(false); }
  };

  const requestReferralApproval = async () => {
    if (!product || !userId) return;
    const percent = Number(requestedCommission);
    if (!Number.isFinite(percent) || percent < 1 || percent > 80) { toast.error("Choose a commission between 1% and 80%."); return; }
    setReferralBusy(true);
    try {
      const token = await getToken();
      const response = await fetch("/api/marketplace?action=request-resale", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" }, body: JSON.stringify({ listingId: product.id, percent, privateAccessToken: product.privateAccessToken || null }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Your approval request could not be sent.");
      if (["rejected", "revoked"].includes(payload?.result?.status)) throw new Error("This creator has not approved your referral access for this product.");
      setApprovalOpen(false);
      toast.success(payload?.result?.status === "pending" ? "Approval request sent. Track it from Sell → Affiliate." : "Your referral access is ready in Sell → Affiliate.");
    } catch (error: any) { toast.error(error.message || "Your approval request could not be sent."); }
    finally { setReferralBusy(false); }
  };

  const buyWithWallet = async () => {
    if (product) trackMarketplaceCheckout(product.seller.adPixels, product);
    if (!product || !userId) { setGuestChoiceOpen(true); return; }
    setBuying(true);
    try {
      const token = await getToken();
      const key = marketplaceAttempt(localStorage, userId, product.id);
      const response = await fetch("/api/marketplace?action=purchase", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": key },
        body: JSON.stringify({ listingId: product.id, idempotencyKey: key, privateAccessToken: product.privateAccessToken || null, acceptedTermsVersion: "marketplace-v1", referralCode: referral?.code || null, referralOptOut, adMarketingConsent: marketplaceMarketingConsent() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Purchase could not be completed.");
      if (payload.purchase?.reference) trackMarketplacePurchase(product.seller.adPixels, product, payload.purchase.reference, Number(payload.purchase.amount || product.price));
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
      <meta name="description" content={description.slice(0, 180)} />
      <meta property="og:type" content="product" />
      <meta property="og:title" content={`${product.title} | Plugsy Marketplace`} />
      <meta property="og:description" content={description.slice(0, 180)} />
      {product.coverImageUrl && <meta property="og:image" content={product.coverImageUrl} />}
    </Helmet>
    <div className="mx-auto max-w-6xl">
      <Link to="/marketplace" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-text-secondary transition hover:text-brand-accent"><ArrowLeft size={16} /> Marketplace</Link>
      <div className="mt-6 grid gap-7 lg:grid-cols-[1.1fr_.9fr]">
        <section className="overflow-hidden rounded-[2rem] border border-brand-border bg-brand-surface"><div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-brand-accent/30 via-brand-surface to-cyan-400/20">{product.coverImageUrl ? <img src={product.coverImageUrl} alt={product.title} className="h-full w-full object-cover" /> : <MarketplaceMark className="absolute bottom-8 right-8 text-brand-accent/45" size={112} />}<span className="absolute left-5 top-5 rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur">{category}</span></div><div className="p-6 sm:p-8"><div className="flex flex-wrap items-center gap-2">{product.seller.verified && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-500"><CheckCircle2 size={13} /> Verified seller</span>}</div><div className="mt-4 max-w-sm"><TrustScoreMeter score={product.seller.trustScore} compact /></div><h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">{product.title}</h1>{product.summary && <p className="mt-4 text-lg leading-7 text-brand-text-secondary">{product.summary}</p>}<div className="mt-7 whitespace-pre-wrap text-sm leading-7 text-brand-text-secondary">{description}</div></div></section>
        <aside className="h-fit rounded-[2rem] border border-brand-border bg-brand-surface p-6 shadow-xl sm:p-8"><p className="text-[10px] font-black uppercase tracking-[.2em] text-brand-accent">Digital product</p><p className="mt-3 text-4xl font-black tracking-tight">{formatNaira(product.fee?.total ?? product.price)}</p><div className="mt-4 space-y-2 rounded-xl border border-brand-border bg-brand-text/[.025] p-4 text-xs"><div className="flex justify-between gap-3"><span className="text-brand-text-secondary">Product price</span><span className="font-bold">{formatNaira(product.price)}</span></div>{product.fee?.paidBy === 'buyer' && <div className="flex justify-between gap-3"><span className="text-brand-text-secondary">Marketplace fee ({product.fee.percent}%)</span><span className="font-bold">{formatNaira(product.fee.amount)}</span></div>}{product.fee?.paidBy === 'buyer' ? <div className="flex justify-between gap-3 border-t border-brand-border pt-2 font-black"><span>Total today</span><span>{formatNaira(product.fee.total)}</span></div> : <p className="leading-5 text-brand-text-secondary">The seller covers the {product.fee?.percent || 0}% Marketplace fee. You pay the product price shown.</p>}</div><p className="mt-3 text-sm text-brand-text-secondary">One payment · delivered securely after checkout.</p>{product.resalePolicy !== "not_allowed" && <section className="mt-5 rounded-2xl border border-brand-accent/25 bg-brand-accent/[.05] p-4"><div className="flex items-center gap-2"><BadgePercent size={17} className="text-brand-accent"/><h2 className="text-sm font-black">Who referred you?</h2><span className="text-[10px] text-brand-text-secondary">Optional</span></div>{referral ? <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[.06] p-3"><div className="min-w-0"><p className="truncate text-sm font-black">Referred by {referral.name}</p><p className="mt-1 text-[10px] leading-4 text-brand-text-secondary">They earn {referral.commissionPercent}% from the seller. Your total does not change.</p></div><button onClick={removeReferral} aria-label="Remove referral" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-brand-border"><X size={14}/></button></div> : <><div className="mt-3 flex gap-2"><input value={referralInput} onChange={(event)=>{setReferralInput(event.target.value.toUpperCase());setReferralError("");setReferralOptOut(false);}} placeholder="Enter purchase code" className="h-11 min-w-0 flex-1 rounded-xl border border-brand-border bg-brand-bg px-3 text-sm font-bold uppercase outline-none focus:border-brand-accent"/><button disabled={!userId || !referralInput.trim() || referralBusy} onClick={()=>void validateReferral(referralInput)} className="rounded-xl bg-brand-text px-4 text-xs font-black text-brand-bg disabled:opacity-40">{referralBusy?<Loader2 className="animate-spin" size={14}/>:"Apply"}</button></div>{!userId&&<p className="mt-2 text-[10px] text-brand-text-secondary">Sign in to apply a purchase code and credit your referrer.</p>}{referralError&&<p className="mt-2 text-xs font-semibold text-red-500">{referralError}</p>}</>}</section>}<button disabled={buying} onClick={() => void buyWithWallet()} className="btn-primary mt-7 flex h-13 w-full items-center justify-center gap-2 px-5 text-xs font-black uppercase tracking-wider disabled:opacity-60">{buying ? <Loader2 className="animate-spin" size={15} /> : "Buy now"} {!buying && <Store size={15} />}</button><button onClick={() => void share()} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-border text-xs font-black uppercase tracking-wider transition hover:border-brand-accent hover:text-brand-accent"><Copy size={14} /> Share product</button>{product.resalePolicy !== "not_allowed" && product.seller.id !== userId && <button disabled={referralBusy} onClick={()=>void shareReferralLink()} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-accent/40 text-xs font-black uppercase tracking-wider text-brand-accent transition hover:bg-brand-accent/10 disabled:opacity-50"><BadgePercent size={14}/>Refer & Earn{product.resalePolicy === "fixed_percent" && product.resaleCommissionPercent ? ` ${product.resaleCommissionPercent}%` : ""}</button>}<section className="mt-5 rounded-2xl border border-brand-border bg-brand-bg p-4"><div className="flex items-center gap-3"><Link to={`/marketplace/creator/${product.seller.id}`} className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-accent/10 text-brand-accent">{product.seller.avatar ? <img src={product.seller.avatar} alt="" className="h-full w-full object-cover" /> : <UserRound size={19} />}</Link><Link to={`/marketplace/creator/${product.seller.id}`} className="min-w-0 flex-1"><p className="truncate text-sm font-black">{product.seller.name || "Plugsy creator"} {product.seller.verified && <CheckCircle2 className="inline text-brand-accent" size={14} fill="currentColor" />}</p><p className="mt-0.5 truncate text-xs text-brand-text-secondary">{product.seller.username ? `@${product.seller.username}` : product.seller.trustScore === null ? "New creator" : `Trust score ${product.seller.trustScore}/100`}</p></Link></div><div className="mt-3 grid grid-cols-2 gap-2"><Link to={`/marketplace/creator/${product.seller.id}`} className="flex h-11 items-center justify-center rounded-xl border border-brand-border text-xs font-black">View profile</Link>{product.seller.id !== userId && <button disabled={followBusy} onClick={() => void toggleFollow()} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-brand-accent/40 text-xs font-black text-brand-accent disabled:opacity-50">{following ? <UserMinus size={15} /> : <UserPlus size={15} />}{following ? "Following" : "Follow creator"}</button>}</div></section><div className="mt-7 space-y-4 border-t border-brand-border pt-6"><div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-brand-accent" size={18} /><div><h2 className="text-sm font-black">10-hour buyer protection</h2><p className="mt-1 text-xs leading-5 text-brand-text-secondary">Report a genuine problem before seller funds are released.</p></div></div><div className="flex gap-3"><LockKeyhole className="mt-0.5 shrink-0 text-brand-accent" size={18} /><div><h2 className="text-sm font-black">Safe delivery</h2><p className="mt-1 text-xs leading-5 text-brand-text-secondary">Your product is delivered only after a confirmed payment.</p></div></div></div></aside>
      </div>
      <section className="mt-7 max-w-3xl rounded-[2rem] border border-brand-border bg-brand-surface p-6 sm:p-8"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-accent/10 text-brand-accent"><MessageCircle size={18} /></span><div><h2 className="font-black">Product conversation</h2><p className="text-xs text-brand-text-secondary">Ask useful questions and share honest feedback.</p></div></div><form onSubmit={postComment} className="mt-5 flex gap-2"><input value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength={800} placeholder="Write a comment…" className="h-11 min-w-0 flex-1 rounded-xl border border-brand-border bg-brand-bg px-4 text-sm outline-none focus:border-brand-accent"/><button disabled={!commentText.trim() || commentBusy} className="btn-primary h-11 px-4 text-xs font-black disabled:opacity-50">{commentBusy ? <Loader2 className="animate-spin" size={15} /> : "Post"}</button></form><div className="mt-5 space-y-4">{comments.length ? comments.map((comment) => <article key={comment.id} className="flex gap-3 border-t border-brand-border pt-4"><span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-accent/10 text-xs font-black text-brand-accent">{comment.author.avatar ? <img src={comment.author.avatar} alt="" className="h-full w-full object-cover"/> : (comment.author.name || "P").slice(0, 1)}</span><div className="min-w-0"><p className="text-xs font-black">{comment.author.name} <span className="font-medium text-brand-text-secondary">· {new Date(comment.createdAt).toLocaleDateString()}</span></p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-brand-text-secondary">{comment.body}</p></div></article>) : <p className="py-4 text-sm text-brand-text-secondary">No comments yet. Be the first to ask a helpful question.</p>}</div></section>
    </div>
    {approvalOpen && <div className="fixed inset-0 z-[10003] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="affiliate-request-title" className="w-full max-w-md rounded-t-[2rem] border border-brand-border bg-brand-bg p-6 shadow-2xl sm:rounded-[2rem]"><button onClick={()=>setApprovalOpen(false)} className="ml-auto grid h-9 w-9 place-items-center rounded-xl border border-brand-border"><X size={15}/></button><span className="mt-3 grid h-11 w-11 place-items-center rounded-2xl bg-brand-accent/10 text-brand-accent"><BadgePercent size={20}/></span><h2 id="affiliate-request-title" className="mt-5 text-2xl font-black">Request to promote this product</h2><p className="mt-2 text-sm leading-6 text-brand-text-secondary">Suggest the commission you would earn from the seller’s proceeds. The creator must approve it before your tracked link becomes active.</p><label className="mt-5 block"><span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-brand-text-secondary">Requested commission</span><div className="relative"><input value={requestedCommission} onChange={(event)=>setRequestedCommission(event.target.value)} type="number" min="1" max="80" step="0.01" className="h-12 w-full rounded-xl border border-brand-border bg-brand-surface px-4 pr-10 text-sm font-bold outline-none focus:border-brand-accent"/><span className="absolute right-4 top-3.5 text-sm font-black text-brand-text-secondary">%</span></div></label><button disabled={referralBusy} onClick={()=>void requestReferralApproval()} className="btn-primary mt-5 flex h-12 w-full items-center justify-center gap-2 text-xs font-black uppercase tracking-wider disabled:opacity-50">{referralBusy?<Loader2 className="animate-spin" size={16}/>:"Send approval request"}</button><p className="mt-3 text-center text-[10px] leading-5 text-brand-text-secondary">Track requests and earnings from Sell → Affiliate.</p></section></div>}
    {guestChoiceOpen && <GuestChoice product={product} onClose={() => setGuestChoiceOpen(false)} onSignIn={() => navigate(`/login?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`)} />}
    <MarketplaceCookieConsent />
  </main>;
}

function GuestChoice({ product, onClose, onSignIn }: { product: Product; onClose: () => void; onSignIn: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const startGuestCheckout = async () => {
    setBusy(true);
    try {
      trackMarketplaceCheckout(product.seller.adPixels, product);
      const response = await fetch("/api/marketplace?action=guest-checkout", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ listingId: product.id, email, privateAccessToken: product.privateAccessToken || null, adMarketingConsent: marketplaceMarketingConsent() }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Guest checkout is unavailable.");
      window.location.assign(payload.authorizationUrl);
    } catch (error: any) { toast.error(error.message || "Guest checkout is unavailable."); setBusy(false); }
  };
  return <div className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="guest-checkout-title" className="w-full max-w-md rounded-t-[2rem] border border-brand-border bg-brand-bg p-6 shadow-2xl sm:rounded-[2rem]"><button onClick={onClose} className="ml-auto block text-xs font-black uppercase tracking-wider text-brand-text-secondary">Close</button><span className="mt-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-accent/10 text-brand-accent"><Mail size={20} /></span><h2 id="guest-checkout-title" className="mt-5 text-2xl font-black">Choose how you want to pay</h2><p className="mt-2 text-sm leading-6 text-brand-text-secondary">Pay as a guest with Flutterwave and receive your secure product link by email, or sign in to pay with your Plugsy Wallet.</p>{product.resalePolicy !== "not_allowed" && <p className="mt-3 rounded-xl border border-brand-accent/20 bg-brand-accent/[.05] p-3 text-xs leading-5 text-brand-text-secondary">To credit a referrer and save their purchase code to your profile, sign in before paying.</p>}<label className="mt-5 block"><span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-brand-text-secondary">Email for your receipt and delivery</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@example.com" className="h-12 w-full rounded-xl border border-brand-border bg-brand-surface px-4 text-sm outline-none focus:border-brand-accent" /></label><button disabled={!email || busy} onClick={() => void startGuestCheckout()} className="btn-primary mt-4 flex h-12 w-full items-center justify-center gap-2 text-xs font-black uppercase tracking-wider disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={16} /> : `Pay ${formatNaira(product.fee?.total ?? product.price)} with Flutterwave`}</button><button onClick={onSignIn} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-border text-xs font-black uppercase tracking-wider">Sign in and pay with Wallet</button><p className="mt-4 text-center text-[10px] leading-5 text-brand-text-secondary">{product.title} · total {formatNaira(product.fee?.total ?? product.price)} · Flutterwave is only used for guest payments.</p></section></div>;
}
