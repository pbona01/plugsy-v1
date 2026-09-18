import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@clerk/clerk-react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, ArrowRight, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Copy, FileKey2, Library, Loader2, LockKeyhole, Plus, Search, ShieldCheck, Sparkles, Store, UserPlus, X } from "lucide-react";
import toast from "react-hot-toast";
import { MarketplaceMark } from "../components/icons/MarketplaceMark";
import ResaleWorkspace from "../components/marketplace/ResaleWorkspace";
import ListingFileUploader from '../components/marketplace/ListingFileUploader';
import SellerPremiumPlan from '../components/marketplace/SellerPremiumPlan';
import SellerVerification from '../components/marketplace/SellerVerification';
import { marketplaceAttempt, clearMarketplaceAttempt } from '../utils/marketplaceAttempt.js';
import MarketplaceCookieConsent from '../components/marketplace/MarketplaceCookieConsent';

type Listing = {
  id: string;
  sellerId: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  coverImageUrl?: string | null;
  deliveryLabel: string;
  resalePolicy: "not_allowed" | "fixed_percent" | "approval_required";
  resaleCommissionPercent: number | null;
  seller: { id?: string; name?: string; username?: string | null; avatar?: string | null; trustScore: number | null; verified: boolean; completedOrders: number };
  privateAccessToken?: string;
};

type WorkspaceListing = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  cover_image_url?: string | null;
  category: string;
  price: number;
  visibility: "private" | "public";
  status: "draft" | "published" | "paused" | "archived";
  private_access_token: string;
  delivery_url?: string | null;
  delivery_label: string;
  resale_policy: "not_allowed" | "fixed_percent" | "approval_required";
  resale_commission_percent: number | null;
};

const categories = ["All", "Courses", "Templates", "Design", "Video", "Social media", "Business", "Creator tools"];
const categoryValue = (category: string) => category.toLowerCase().replace(/\s+/g, "_");
const formatNaira = (value: number) => `₦${Number(value || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
const host = typeof window !== "undefined" ? window.location.origin : "https://www.plugsy.ng";

const emptyForm = {
  title: "",
  summary: "",
  description: "",
  category: "templates",
  price: "",
  coverImageUrl: "",
  deliveryUrl: "",
  deliveryLabel: "Open product",
  visibility: "private",
  resalePolicy: "not_allowed",
  resaleCommissionPercent: "",
};

export default function Marketplace() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const sharedProductId = searchParams.get('product');
  const { accessToken } = useParams<{ accessToken?: string }>();
  const { userId, getToken } = useAuth();
  const [mode, setMode] = useState<"buy" | "sell" | "library" | "following">("buy");
  const [listings, setListings] = useState<Listing[]>([]);
  const [privateListing, setPrivateListing] = useState<Listing | null>(null);
  const [loadingListings, setLoadingListings] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [workspace, setWorkspace] = useState<{ seller: any; listings: WorkspaceListing[]; sales: any[] } | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [libraryItems, setLibraryItems] = useState<any[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [followedSellerIds, setFollowedSellerIds] = useState<Set<string>>(new Set());
  const [followingSellerId, setFollowingSellerId] = useState<string | null>(null);
  const [followingListings, setFollowingListings] = useState<Listing[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [isListingOpen, setIsListingOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [savingFeePolicy, setSavingFeePolicy] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reportOrderId, setReportOrderId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("not_as_described");
  const [reportDescription, setReportDescription] = useState("");
  const [onboardingState, setOnboardingState] = useState<"checking" | "required" | "accepted" | "unavailable">("checking");
  const [rulesChecked, setRulesChecked] = useState(false);
  const [acceptingRules, setAcceptingRules] = useState(false);

  useEffect(() => {
    if (location.pathname.endsWith('/buyer')) setMode('library');
    else if (location.pathname.endsWith('/seller')) setMode('sell');
  }, [location.pathname]);

  useEffect(() => { if (!isListingOpen) { setEditingId(null); setForm(emptyForm); } }, [isListingOpen]);

  const editListing = (listing: WorkspaceListing) => {
    setEditingId(listing.id);
    setForm({ title: listing.title, summary: listing.summary || "", description: listing.description || "", category: listing.category,
      price: String(listing.price), coverImageUrl: listing.cover_image_url || "", deliveryUrl: listing.delivery_url || "",
      deliveryLabel: listing.delivery_label, visibility: listing.visibility, resalePolicy: listing.resale_policy,
      resaleCommissionPercent: listing.resale_commission_percent == null ? "" : String(listing.resale_commission_percent) });
    setIsListingOpen(true);
  };

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...options, headers });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true) throw new Error(payload?.error || "Marketplace request failed.");
    return payload;
  }, [getToken]);

  useEffect(() => {
    if (!userId) { setOnboardingState("accepted"); return; }
    let active = true;
    setOnboardingState("checking");
    void request("/api/marketplace?action=onboarding")
      .then((payload) => { if (active) setOnboardingState(payload.accepted ? "accepted" : "required"); })
      .catch(() => { if (active) setOnboardingState("unavailable"); });
    return () => { active = false; };
  }, [request, userId]);

  const acceptMarketplaceRules = async () => {
    if (!rulesChecked) return;
    setAcceptingRules(true);
    try {
      await request("/api/marketplace?action=accept-onboarding", { method: "POST", body: JSON.stringify({ rulesAccepted: true }) });
      setOnboardingState("accepted");
      toast.success("Welcome to Marketplace. You’re ready to explore.");
    } catch (error: any) {
      toast.error(error.message || "We could not save your acknowledgement.");
    } finally {
      setAcceptingRules(false);
    }
  };

  const loadListings = useCallback(async () => {
    setLoadingListings(true);
    try {
      const params = new URLSearchParams();
      if (activeCategory !== "All") params.set("category", categoryValue(activeCategory));
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch(`/api/marketplace?action=browse&${params.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success !== true) throw new Error(payload?.error || "Marketplace is unavailable.");
      setListings(payload.listings || []);
    } catch (error: any) {
      toast.error(error?.message || "Marketplace is unavailable.");
      setListings([]);
    } finally {
      setLoadingListings(false);
    }
  }, [activeCategory, search]);

  const loadWorkspace = useCallback(async () => {
    if (!userId) return;
    setWorkspaceLoading(true);
    try {
      const payload = await request("/api/marketplace?action=workspace");
      setWorkspace({ seller: payload.seller, listings: payload.listings || [], sales: payload.sales || [] });
    } catch (error: any) {
      toast.error(error.message || "Could not load seller workspace.");
    } finally {
      setWorkspaceLoading(false);
    }
  }, [request, userId]);

  const loadLibrary = useCallback(async () => {
    if (!userId) return;
    setLibraryLoading(true);
    try {
      const payload = await request("/api/marketplace?action=library");
      setLibraryItems(payload.entitlements || []);
    } catch (error: any) {
      toast.error(error.message || "Could not load your library.");
    } finally {
      setLibraryLoading(false);
    }
  }, [request, userId]);

  const loadFollowedSellers = useCallback(async () => {
    if (!userId) { setFollowedSellerIds(new Set()); return; }
    try {
      const payload = await request('/api/marketplace?action=followed-sellers');
      setFollowedSellerIds(new Set(payload.sellerIds || []));
    } catch {
      // Following is an enhancement; browsing must still work when it is unavailable.
    }
  }, [request, userId]);

  useEffect(() => { void loadListings(); }, [loadListings]);
  useEffect(() => {
    if (!accessToken && !sharedProductId) { setPrivateListing(null); return; }
    setLoadingListings(true);
    fetch(accessToken ? `/api/marketplace?action=private-listing&accessToken=${encodeURIComponent(accessToken)}` : `/api/marketplace?action=product&id=${encodeURIComponent(sharedProductId || '')}`, { headers: { Accept: "application/json" }, cache: "no-store" })
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (!response.ok || payload?.success !== true) throw new Error(payload?.error || "This private product link is unavailable.");
        setPrivateListing(payload.listing);
        setMode("buy");
      })
      .catch((error) => { setPrivateListing(null); toast.error(error.message || "This private product link is unavailable."); })
      .finally(() => setLoadingListings(false));
  }, [accessToken, sharedProductId]);
  useEffect(() => { if (mode === "sell") void loadWorkspace(); }, [loadWorkspace, mode]);
  useEffect(() => { if (mode === "library") void loadLibrary(); }, [loadLibrary, mode]);

  const loadFollowing = useCallback(async () => {
    if (!userId) return;
    setFollowingLoading(true);
    try {
      const payload = await request("/api/marketplace?action=following");
      setFollowingListings(payload.listings || []);
    } catch (error: any) { toast.error(error.message || "Could not load creators you follow."); }
    finally { setFollowingLoading(false); }
  }, [request, userId]);
  useEffect(() => { if (mode === "following") void loadFollowing(); }, [loadFollowing, mode]);
  useEffect(() => { void loadFollowedSellers(); }, [loadFollowedSellers]);

  const shownListings = useMemo(() => privateListing ? [privateListing] : mode === "following" ? followingListings : listings, [followingListings, listings, mode, privateListing]);

  const openSeller = () => {
    if (!userId) return navigate("/login?redirect=/marketplace");
    navigate("/marketplace/seller");
  };

  const setSellerFollowing = async (sellerId: string, follow: boolean) => {
    if (!userId) return navigate('/login?redirect=/marketplace');
    setFollowingSellerId(sellerId);
    try {
      await request('/api/marketplace?action=follow-seller', { method: 'POST', body: JSON.stringify({ sellerId, follow }) });
      setFollowedSellerIds((current) => {
        const next = new Set(current);
        if (follow) next.add(sellerId); else next.delete(sellerId);
        return next;
      });
      toast.success(follow ? 'Seller followed. New products will appear in your updates.' : 'Seller unfollowed.');
    } catch (error: any) {
      toast.error(error.message || 'We could not update that follow.');
    } finally {
      setFollowingSellerId(null);
    }
  };

  const createListing = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await request(`/api/marketplace?action=${editingId ? 'update-listing' : 'create-listing'}`, { method: editingId ? "PATCH" : "POST", body: JSON.stringify({ ...form, listingId: editingId }) });
      toast.success(editingId ? "Changes saved as a draft. Publish when ready." : "Draft created. Publish when ready.");
      setForm(emptyForm);
      setIsListingOpen(false);
      await loadWorkspace();
    } catch (error: any) {
      toast.error(error.message || "Your draft could not be created.");
    } finally {
      setSaving(false);
    }
  };

  const changeListingStatus = async (listing: WorkspaceListing, status: "published" | "paused" | "archived") => {
    setPendingAction(listing.id);
    try {
      const payload = await request("/api/marketplace?action=publish", { method: "POST", body: JSON.stringify({ listingId: listing.id, status }) });
      setWorkspace((current) => current ? { ...current, listings: current.listings.map((item) => item.id === listing.id ? payload.listing : item) } : current);
      toast.success(status === "published" ? "Listing published." : `Listing ${status}.`);
      await loadListings();
    } catch (error: any) {
      toast.error(error.message || "Listing status could not be updated.");
    } finally {
      setPendingAction(null);
    }
  };

  const setFeePolicy = async (feePaidBy: "buyer" | "seller") => {
    setSavingFeePolicy(true);
    try {
      await request("/api/marketplace?action=update-fee-policy", { method: "POST", body: JSON.stringify({ feePaidBy }) });
      setWorkspace((current) => current ? { ...current, seller: { ...current.seller, marketplace_fee_paid_by: feePaidBy } } : current);
      toast.success(feePaidBy === "buyer" ? "Marketplace fee will be shown to buyers at checkout." : "Marketplace fee will be deducted from your earnings.");
    } catch (error: any) {
      toast.error(error.message || "Your fee preference could not be saved.");
    } finally {
      setSavingFeePolicy(false);
    }
  };

  const buyListing = async (listing: Listing) => {
    if (!userId) return navigate(`/login?redirect=/marketplace`);
    if (!window.confirm(`Buy ${listing.title} for ${formatNaira(listing.price)} from your Plugsy Wallet? You will have 10 hours to report a genuine issue.`)) return;
    setPendingAction(listing.id);
    try {
      const key = marketplaceAttempt(localStorage, userId, listing.id);
      const payload = await request("/api/marketplace?action=purchase", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ listingId: listing.id, idempotencyKey: key, privateAccessToken: listing.privateAccessToken || null, acceptedTermsVersion: "marketplace-v1", resellerCode: searchParams.get('product') === listing.id ? searchParams.get('ref') : null }),
      });
      toast.success(`Purchase complete. Your product is now in My library. Seller funds are protected for 10 hours, then processed for the next business-day payout.`);
      clearMarketplaceAttempt(localStorage, userId, listing.id);
      setMode("library");
    } catch (error: any) {
      const message = error.message || "Purchase could not be completed.";
      toast.error(message);
      if (/wallet|funds/i.test(message)) navigate("/wallet");
    } finally {
      setPendingAction(null);
    }
  };

  const openDelivery = async (orderId: string) => {
    setPendingAction(orderId);
    try {
      const payload = await request(`/api/marketplace?action=delivery&orderId=${encodeURIComponent(orderId)}`);
      window.location.assign(payload.deliveryUrl);
    } catch (error: any) {
      toast.error(error.message || "Your product link is unavailable.");
    } finally {
      setPendingAction(null);
    }
  };

  const submitReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reportOrderId) return;
    setPendingAction(reportOrderId);
    try {
      await request("/api/marketplace?action=open-dispute", { method: "POST", body: JSON.stringify({ orderId: reportOrderId, reasonCode: reportReason, description: reportDescription }) });
      toast.success("Issue reported. Seller funds are frozen for review.");
      setReportOrderId(null); setReportDescription(""); await loadLibrary();
    } catch (error: any) { toast.error(error.message || "Could not report this issue."); }
    finally { setPendingAction(null); }
  };

  return (
    <>
    <main className="min-h-screen bg-brand-bg px-4 pb-28 pt-20 text-brand-text sm:px-6 sm:pt-10 lg:px-8">
      <Helmet><title>Plugsy Marketplace | Digital products, protected</title><meta name="description" content="Buy and sell digital products with Plugsy buyer protection." /></Helmet>
      <div className="mx-auto max-w-7xl">
        <header className="flex items-center justify-between gap-4 py-2"><div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-accent text-white"><MarketplaceMark size={18} /></span><div><p className="text-[9px] font-black uppercase tracking-[.18em] text-brand-accent">Plugsy Marketplace</p><h1 className="mt-0.5 text-lg font-black tracking-tight sm:text-xl">Digital products</h1></div></div><div className="flex items-center gap-3"><Link to="/marketplace/policy" className="text-[10px] font-black uppercase tracking-wider text-brand-text-secondary transition hover:text-brand-accent">Rules</Link>{userId && <><button onClick={() => navigate('/marketplace/buyer')} aria-label="Open my purchases" className={`grid h-10 w-10 place-items-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent ${mode === 'library' ? 'border-brand-accent bg-brand-accent/10 text-brand-accent' : 'border-brand-border text-brand-text-secondary hover:border-brand-accent/50 hover:text-brand-accent'}`}><Library size={17} /></button><Link to={`/marketplace/creator/${userId}`} aria-label="Open my creator profile" className="grid h-10 w-10 place-items-center rounded-xl border border-brand-border text-brand-text-secondary transition hover:border-brand-accent/50 hover:text-brand-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"><UserPlus size={17}/></Link></>}</div></header>
        <div className="sticky top-0 z-30 -mx-4 border-y border-brand-border bg-brand-bg/95 px-4 py-3 backdrop-blur-xl sm:top-3 sm:mx-0 sm:rounded-2xl sm:border sm:px-3 sm:shadow-sm"><div className="inline-flex max-w-full rounded-2xl border border-brand-border bg-brand-surface p-1"><button onClick={() => navigate("/marketplace")} aria-pressed={mode === "buy"} className={`flex h-10 min-w-20 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent ${mode === "buy" ? "bg-brand-text text-brand-bg shadow-sm" : "text-brand-text-secondary hover:text-brand-text"}`}><Search size={15} /> Buy</button><button onClick={openSeller} className={`flex h-10 min-w-20 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent ${mode === 'sell' ? 'bg-brand-text text-brand-bg shadow-sm' : 'text-brand-text-secondary hover:text-brand-text'}`}><Store size={15} /> Sell</button>{userId && <button onClick={() => setMode("following")} aria-pressed={mode === "following"} className={`flex h-10 min-w-20 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent ${mode === "following" ? "bg-brand-text text-brand-bg shadow-sm" : "text-brand-text-secondary hover:text-brand-text"}`}><UserPlus size={15} /> Following</button>}</div></div>

        {(mode === "buy" || mode === "following") && <section className="mt-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[11px] font-black uppercase tracking-[.2em] text-brand-accent">{privateListing ? "Private product" : mode === "following" ? "Following" : "Buy"}</p><h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{privateListing ? "A product shared with you" : mode === "following" ? "From creators you follow" : "Explore all products"}</h2><p className="mt-1 text-sm text-brand-text-secondary">{mode === "following" ? "New public products from the creators you chose to follow." : "Clear prices, protected checkout and delivery to your library."}</p></div>{mode === "buy" && !privateListing && <div className="relative w-full lg:w-80"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-secondary" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search all products" className="h-12 w-full rounded-xl border border-brand-border bg-brand-surface pl-11 pr-4 text-sm outline-none transition focus:border-brand-accent" /></div>}</div>
          {mode === "buy" && !privateListing && <div className="relative mt-5"><div className="flex gap-2 overflow-x-auto pb-2 pr-10 [scrollbar-width:thin]" aria-label="Product categories. Scroll horizontally to see more.">{categories.map((category) => <button key={category} onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category} className={`min-h-11 shrink-0 rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent ${activeCategory === category ? "border-brand-accent bg-brand-accent text-white" : "border-brand-border bg-brand-surface text-brand-text-secondary hover:border-brand-accent/50"}`}>{category}</button>)}</div><div aria-hidden="true" className="pointer-events-none absolute bottom-2 right-0 top-0 w-12 bg-gradient-to-l from-brand-bg via-brand-bg/85 to-transparent" /></div>}
          <div className="mt-7 space-y-3">{(mode === "following" ? followingLoading : loadingListings) ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-brand-border bg-brand-surface" />) : shownListings.length ? shownListings.map((listing) => <article key={listing.id} className="group overflow-hidden rounded-2xl border border-brand-border bg-brand-surface transition duration-300 hover:border-brand-accent/45 hover:shadow-xl"><div className="flex flex-col sm:flex-row"><div className="relative h-36 shrink-0 overflow-hidden bg-gradient-to-br from-brand-accent/25 via-brand-surface to-cyan-400/20 sm:h-auto sm:w-44">{listing.coverImageUrl ? <img src={listing.coverImageUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <MarketplaceMark className="absolute bottom-5 right-5 text-brand-accent/50" size={62} />}<span className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/30 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white backdrop-blur">{listing.category.replace(/[_-]/g, " ")}</span></div><div className="flex min-w-0 flex-1 flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="text-lg font-black tracking-tight sm:text-xl">{listing.title}</h3>{listing.seller.verified && <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-500"><CheckCircle2 size={12} /> Verified</span>}</div><p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-6 text-brand-text-secondary">{listing.summary || listing.description}</p><div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold text-brand-text-secondary"><Link to={`/marketplace/creator/${listing.sellerId}`} className="hover:text-brand-accent">{listing.seller.name || "View creator"}</Link><span className="text-brand-border">•</span><span className="inline-flex items-center gap-1 text-brand-accent"><ShieldCheck size={12} /> {listing.seller.trustScore === null ? "New seller" : `Trust ${listing.seller.trustScore}/100`}</span><button disabled={followingSellerId === listing.sellerId} onClick={() => void setSellerFollowing(listing.sellerId, !followedSellerIds.has(listing.sellerId))} className={`ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[9px] font-black uppercase tracking-wide transition disabled:opacity-50 ${followedSellerIds.has(listing.sellerId) ? 'border-brand-accent/35 bg-brand-accent/10 text-brand-accent' : 'border-brand-border text-brand-text-secondary hover:border-brand-accent/50 hover:text-brand-accent'}`}><UserPlus size={12} /> {followingSellerId === listing.sellerId ? 'Saving' : followedSellerIds.has(listing.sellerId) ? 'Following' : 'Follow creator'}</button></div></div><div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end"><span className="text-xl font-black text-brand-text">{formatNaira(listing.price)}</span><Link to={`/marketplace/product/${listing.id}`} className="btn-primary flex h-10 items-center gap-2 px-5 text-[10px] font-black uppercase tracking-wider">View<ArrowRight size={14} /></Link></div></div></div></article>) : <div className="rounded-3xl border border-dashed border-brand-border bg-brand-surface p-12 text-center"><MarketplaceMark className="mx-auto text-brand-accent" size={42} /><h3 className="mt-5 text-xl font-black">{mode === "following" ? "Follow creators to fill this feed" : "No products found yet"}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-brand-text-secondary">{mode === "following" ? "Open a product and choose Follow creator to see future products here." : "This marketplace is opening with carefully approved sellers. Try another category, or be one of the first sellers."}</p><button onClick={mode === "following" ? () => setMode("buy") : openSeller} className="mt-6 text-xs font-black uppercase tracking-wider text-brand-accent">{mode === "following" ? "Explore creators" : "Create a private listing"} <ChevronRight className="inline" size={14} /></button></div>}</div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">{[[ShieldCheck, "10-hour buyer protection", "Report a genuine issue before seller funds are released."], [LockKeyhole, "Your purchase stays yours", "Your product appears in My library after a successful order."], [CircleDollarSign, "Resale with clear terms", "Creators choose if and how a product can be resold."]].map(([Icon, title, copy]: any) => <div key={title} className="rounded-2xl border border-brand-border bg-brand-surface p-5"><Icon size={19} className="text-brand-accent" /><h3 className="mt-4 font-black">{title}</h3><p className="mt-2 text-xs leading-5 text-brand-text-secondary">{copy}</p></div>)}</div>
        </section>}

        {mode === "sell" && <section className="mt-8">{!userId ? <SignInPrompt onClick={() => navigate("/login?redirect=/marketplace")} /> : workspaceLoading && !workspace ? <LoadingPanel label="Loading seller workspace" /> : <><div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]"><div className="rounded-3xl border border-brand-border bg-brand-surface p-6 sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[11px] font-black uppercase tracking-[.2em] text-brand-accent">Seller workspace</p><h2 className="mt-2 text-3xl font-black tracking-tight">Sell on your terms</h2><p className="mt-3 max-w-xl text-sm leading-6 text-brand-text-secondary">Start private and share your product link with anyone. Public marketplace listings unlock after seller verification and the Premium seller plan are approved.</p></div><button onClick={() => setIsListingOpen(true)} className="btn-primary flex h-11 shrink-0 items-center gap-2 px-5 text-[10px] font-black uppercase tracking-wider"><Plus size={15} /> New listing</button></div><div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Trust score", workspace?.seller?.trust_score == null ? 'New seller' : `${workspace.seller.trust_score}/100`], ["Total sales", workspace?.seller?.total_sales_count ?? 0], ["Completed", workspace?.seller?.completed_orders_count ?? 0], ["Held sales", (workspace?.sales || []).filter((sale) => sale.funds_status === "held").length]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-brand-border bg-brand-text/[.025] p-4"><p className="text-[9px] font-black uppercase tracking-wider text-brand-text-secondary">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}</div></div><div className="rounded-3xl border border-brand-accent/25 bg-gradient-to-br from-brand-accent/15 to-cyan-400/5 p-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-accent text-white"><Sparkles size={18} /></div><h3 className="mt-5 text-xl font-black">Public seller access</h3><p className="mt-2 text-sm leading-6 text-brand-text-secondary">{workspace?.seller?.public_selling_enabled ? "Your account can publish products publicly." : "Private listings are ready now. Public publishing is a controlled launch feature."}</p><div className="mt-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-brand-accent"><ShieldCheck size={14} /> {workspace?.seller?.verification_status === "verified" ? "Identity verified" : "Verification not started"}</div></div></div>
          <div className="mt-8"><div className="flex items-end justify-between gap-4"><div><p className="text-[11px] font-black uppercase tracking-[.2em] text-brand-accent">Your listings</p><h3 className="mt-2 text-2xl font-black">Build, publish, share</h3></div><button onClick={() => void loadWorkspace()} className="text-[10px] font-black uppercase tracking-wider text-brand-accent">Refresh</button></div><div className="mt-5 grid gap-4">{workspace?.listings?.length ? workspace.listings.map((listing) => <div key={listing.id} className="rounded-2xl border border-brand-border bg-brand-surface p-5"><div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="truncate text-lg font-black">{listing.title}</h4><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${listing.status === "published" ? "bg-emerald-500/10 text-emerald-500" : listing.status === "paused" ? "bg-amber-500/10 text-amber-500" : "bg-brand-text/10 text-brand-text-secondary"}`}>{listing.status}</span><span className="rounded-full bg-brand-accent/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-brand-accent">{listing.visibility}</span></div><p className="mt-2 text-sm text-brand-text-secondary">{listing.category.replace(/[_-]/g, " ")} · {formatNaira(listing.price)} · {listing.delivery_url ? "delivery ready" : "delivery needed"}</p>{listing.visibility === "private" && <button onClick={() => { navigator.clipboard.writeText(`${host}/marketplace/private/${listing.private_access_token}`); toast.success("Private link copied."); }} className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-brand-accent"><Copy size={12} /> Copy private link</button>}</div><div className="flex flex-wrap gap-2">{listing.status !== "published" && <button disabled={pendingAction === listing.id} onClick={() => void changeListingStatus(listing, "published")} className="btn-primary h-10 px-4 text-[10px] font-black uppercase tracking-wider disabled:opacity-60">Publish</button>}{listing.status === "published" && <button disabled={pendingAction === listing.id} onClick={() => void changeListingStatus(listing, "paused")} className="h-10 rounded-xl border border-brand-border px-4 text-[10px] font-black uppercase tracking-wider">Pause</button>}</div></div></div>) : <div className="rounded-3xl border border-dashed border-brand-border bg-brand-surface p-12 text-center"><Store className="mx-auto text-brand-accent" size={36} /><h4 className="mt-4 text-xl font-black">Your shop starts here</h4><p className="mt-2 text-sm text-brand-text-secondary">Create a private listing and share it directly. You control the product, price and resale terms.</p><button onClick={() => setIsListingOpen(true)} className="mt-6 text-xs font-black uppercase tracking-wider text-brand-accent">Create first listing</button></div>}</div></div></>}</section>}

        {mode === "library" && <section className="mt-8">{!userId ? <SignInPrompt onClick={() => navigate("/login?redirect=/marketplace")} /> : libraryLoading ? <LoadingPanel label="Loading your library" /> : <><div><p className="text-[11px] font-black uppercase tracking-[.2em] text-brand-accent">My library</p><h2 className="mt-2 text-3xl font-black tracking-tight">Everything you own</h2><p className="mt-2 text-sm text-brand-text-secondary">Your Plugsy account is the record of ownership. Product links are available here after purchase.</p></div><div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{libraryItems.length ? libraryItems.map((item) => <article key={item.id} className="rounded-3xl border border-brand-border bg-brand-surface p-6"><div className="flex items-start justify-between gap-4"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-accent/10 text-brand-accent"><FileKey2 size={20} /></span><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-500">Owned</span></div><h3 className="mt-6 text-xl font-black">{item.listing?.title || "Marketplace product"}</h3><p className="mt-2 text-sm text-brand-text-secondary">{item.listing?.summary || item.listing?.category}</p><p className="mt-5 text-[10px] font-bold uppercase tracking-wider text-brand-text-secondary">Purchased {item.order?.created_at ? new Date(item.order.created_at).toLocaleDateString() : "recently"}</p><button disabled={pendingAction === item.order?.id} onClick={() => void openDelivery(item.order?.id)} className="btn-primary mt-5 flex h-10 w-full items-center justify-center gap-2 text-[10px] font-black uppercase tracking-wider">{pendingAction === item.order?.id ? <Loader2 className="animate-spin" size={14} /> : item.listing?.delivery_label || "Open product"}<ArrowRight size={14} /></button></article>) : <div className="col-span-full rounded-3xl border border-dashed border-brand-border bg-brand-surface p-14 text-center"><Library className="mx-auto text-brand-accent" size={40} /><h3 className="mt-5 text-xl font-black">Your library is ready</h3><p className="mt-2 text-sm text-brand-text-secondary">When you buy a digital product, it will live here.</p><button onClick={() => setMode("buy")} className="mt-6 text-xs font-black uppercase tracking-wider text-brand-accent">Explore products</button></div>}</div></>}</section>}
      </div>

      <ResaleWorkspace products={shownListings} />
      {mode === 'sell' && workspace && <ListingFileUploader listings={workspace.listings} onComplete={loadWorkspace} />}
      {mode === 'sell' && workspace && <SellerPremiumPlan seller={workspace.seller} onComplete={loadWorkspace} />}
      {mode === 'sell' && workspace && <SellerVerification seller={workspace.seller} onComplete={loadWorkspace} />}

      {mode === 'sell' && workspace && <section className="mx-auto mt-6 max-w-7xl rounded-2xl border border-brand-border bg-brand-surface p-5 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[.2em] text-brand-accent">Marketplace fees</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h3 className="text-lg font-black">Choose who pays the platform fee</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-brand-text-secondary">Your base product price stays yours. Active Premium sellers pay 3%; other sellers pay 6%. Choose whether it is added clearly at checkout or taken from your earnings.</p></div><div className="grid gap-2 sm:grid-cols-2">{([['buyer','Pass fee to buyer'],['seller','I will cover the fee']] as const).map(([value,label]) => <button key={value} disabled={savingFeePolicy} onClick={() => void setFeePolicy(value)} className={`min-w-44 rounded-xl border px-4 py-3 text-left text-xs font-black transition disabled:opacity-50 ${((workspace.seller?.marketplace_fee_paid_by || 'buyer') === value) ? 'border-brand-accent bg-brand-accent/10 text-brand-accent' : 'border-brand-border text-brand-text-secondary hover:border-brand-accent/50'}`}><span className="block">{label}</span><span className="mt-1 block text-[10px] font-medium text-brand-text-secondary">{value === 'buyer' ? 'Shown before payment' : 'Deducted from your payout'}</span></button>)}</div></div>
      </section>}

      {mode === "sell" && workspace && <section className="mx-auto mt-6 max-w-7xl rounded-2xl border border-brand-border bg-brand-surface p-5">
        <h3 className="text-lg font-bold">Manage product details</h3>
        <p className="mt-1 text-xs text-brand-text-secondary">Editing returns a product to draft. Existing buyers keep their original delivery link.</p>
        <div className="mt-4 space-y-3">{workspace.listings.map((listing) => <div key={listing.id} className="flex items-center justify-between gap-4 border-t border-brand-border pt-3"><span className="min-w-0 break-words text-sm">{listing.title}</span><button onClick={() => editListing(listing)} className="shrink-0 rounded-xl border border-brand-border px-4 py-2 text-xs font-bold">Edit details</button></div>)}</div>
        {editingId && <p className="mt-3 text-xs text-brand-accent">Editing an existing listing</p>}
      </section>}

      {mode === "library" && libraryItems.length > 0 && <section className="mx-auto mt-6 max-w-7xl rounded-2xl border border-brand-border bg-brand-surface p-5">
        <h3 className="text-lg font-bold">Order protection</h3>
        {libraryItems.map((item) => <div key={item.id} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-brand-border pt-4"><div><p className="text-sm font-bold">{item.listing?.title}</p><p className="mt-1 text-xs text-brand-text-secondary">{item.order?.funds_status === 'disputed' ? 'Reported — funds frozen for review' : item.order?.funds_status === 'held' ? `Report a problem before ${new Date(item.order.hold_expires_at).toLocaleString()}` : `Order ${item.order?.funds_status || 'processed'}`}</p></div>{item.access_status === 'active' && item.order?.funds_status === 'held' && new Date(item.order.hold_expires_at).getTime() > Date.now() && <button onClick={() => setReportOrderId(item.order.id)} className="rounded-xl border border-brand-border px-4 py-2 text-xs font-bold">Report a problem</button>}</div>)}
      </section>}

      {reportOrderId && <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 p-4"><form onSubmit={submitReport} role="dialog" aria-modal="true" aria-label="Report a product issue" className="w-full max-w-lg rounded-2xl border border-brand-border bg-brand-bg p-6"><h2 className="text-xl font-bold">Report a product issue</h2><p className="mt-2 text-sm text-brand-text-secondary">Tell us what went wrong. Funds stay frozen while the issue is reviewed.</p><select aria-label="Issue type" value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="market-input mt-5"><option value="not_as_described">Not as described</option><option value="unavailable">Cannot access product</option><option value="misleading">Misleading listing</option><option value="duplicate_charge">Duplicate charge</option><option value="other">Other issue</option></select><textarea aria-label="Describe the issue" required minLength={10} maxLength={3000} value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} className="market-input mt-4" placeholder="Explain the problem in detail" /><div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setReportOrderId(null)} className="rounded-xl border border-brand-border px-4 py-3 text-sm">Cancel</button><button disabled={pendingAction === reportOrderId} className="btn-primary px-4 py-3 text-sm disabled:opacity-50">Submit report</button></div></form></div>}

      <AnimatePresence>{isListingOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-6"><motion.form initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} onSubmit={createListing} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[2rem] border border-brand-border bg-brand-bg p-6 shadow-2xl sm:rounded-[2rem] sm:p-8"><div className="flex items-start justify-between gap-5"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-brand-accent">New listing</p><h2 className="mt-2 text-2xl font-black">Create your digital product</h2></div><button type="button" onClick={() => setIsListingOpen(false)} className="rounded-xl border border-brand-border p-2 text-brand-text-secondary"><X size={18} /></button></div><p className="mt-3 text-sm leading-6 text-brand-text-secondary">Your delivery link stays private. Buyers get access immediately after a successful purchase, while funds stay protected for 10 hours.</p><div className="mt-7 grid gap-5 sm:grid-cols-2"><Field label="Product title"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Social media content kit" className="market-input" /></Field><Field label="Price (₦)"><input required min="100" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="5000" className="market-input" /></Field><Field label="Category"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="market-input"><option value="templates">Templates</option><option value="courses">Courses</option><option value="design">Design</option><option value="video">Video</option><option value="social_media">Social media</option><option value="business">Business</option><option value="creator_tools">Creator tools</option></select></Field><Field label="Visibility"><select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })} className="market-input"><option value="private">Private — shared link only</option><option value="public">Public — seller approval required</option></select></Field><Field label="Cover image URL (optional)"><input value={form.coverImageUrl} onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })} placeholder="https://..." className="market-input" /></Field><Field label="Delivery button label"><input required value={form.deliveryLabel} onChange={(e) => setForm({ ...form, deliveryLabel: e.target.value })} placeholder="Open product" className="market-input" /></Field><div className="sm:col-span-2"><Field label="Short summary"><input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="Tell buyers what they get in one clear sentence." className="market-input" /></Field></div><div className="sm:col-span-2"><Field label="Full description"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is included, who is it for and what result can buyers expect?" rows={4} className="market-input resize-y" /></Field></div><div className="sm:col-span-2"><Field label="Secure delivery URL"><input required value={form.deliveryUrl} onChange={(e) => setForm({ ...form, deliveryUrl: e.target.value })} placeholder="https://drive.google.com/... or your secure delivery page" className="market-input" /><p className="mt-2 text-[10px] leading-5 text-brand-text-secondary">This is only returned to entitled buyers. Use a delivery system you control; expiring links can be connected next.</p></Field></div><Field label="Resale terms"><select value={form.resalePolicy} onChange={(e) => setForm({ ...form, resalePolicy: e.target.value })} className="market-input"><option value="not_allowed">Resale not allowed</option><option value="fixed_percent">Fixed reseller percentage</option><option value="approval_required">Seller approval required</option></select></Field>{form.resalePolicy === "fixed_percent" && <Field label="Reseller commission (%)"><input required type="number" min="1" max="80" value={form.resaleCommissionPercent} onChange={(e) => setForm({ ...form, resaleCommissionPercent: e.target.value })} className="market-input" /></Field>}</div><div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={() => setIsListingOpen(false)} className="h-11 rounded-xl border border-brand-border px-5 text-xs font-black uppercase tracking-wider">Cancel</button><button disabled={saving} className="btn-primary flex h-11 items-center justify-center gap-2 px-5 text-xs font-black uppercase tracking-wider disabled:opacity-60">{saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}Create draft</button></div></motion.form></motion.div>}</AnimatePresence>
      <style>{`.market-input { width: 100%; height: 46px; border-radius: 12px; border: 1px solid var(--brand-border, rgba(128,128,128,.25)); background: var(--brand-surface, transparent); padding: 0 14px; font-size: 14px; outline: none; } .market-input:focus { border-color: var(--brand-accent, #1677ff); box-shadow: 0 0 0 3px rgba(22,119,255,.1); } textarea.market-input { height: auto; min-height: 96px; padding-top: 12px; }`}</style>
      <MarketplaceCookieConsent />
    </main>
    {userId && onboardingState === "required" && <MarketplaceOnboarding rulesChecked={rulesChecked} setRulesChecked={setRulesChecked} accepting={acceptingRules} onAccept={acceptMarketplaceRules} onLeave={() => navigate("/dashboard")} />}
    {userId && onboardingState === "unavailable" && <div className="fixed inset-x-4 bottom-6 z-[10002] mx-auto max-w-lg rounded-2xl border border-amber-500/30 bg-brand-bg p-4 text-sm shadow-2xl"><p className="font-bold">Marketplace setup is still being updated.</p><p className="mt-1 text-brand-text-secondary">Please refresh in a moment. Your account rules acknowledgement cannot be saved yet.</p></div>}
    </>
  );
}

function MarketplaceOnboarding({ rulesChecked, setRulesChecked, accepting, onAccept, onLeave }: { rulesChecked: boolean; setRulesChecked: (value: boolean) => void; accepting: boolean; onAccept: () => void; onLeave: () => void }) {
  const steps = [
    [Search, "Explore", "Use search and categories to find a product that fits your work."],
    [ShieldCheck, "Buy safely", "After purchase, you have 10 hours to report a genuine issue."],
    [Store, "Sell when ready", "Private product links are free. Public selling needs verification."],
  ];
  return <div className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/70 p-0 backdrop-blur-md sm:items-center sm:p-6"><motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] border border-brand-border bg-brand-bg p-6 shadow-2xl sm:rounded-[2rem] sm:p-8" role="dialog" aria-modal="true" aria-labelledby="marketplace-welcome-title"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-accent text-white"><MarketplaceMark size={24} /></div><p className="mt-5 text-[10px] font-black uppercase tracking-[.22em] text-brand-accent">Welcome to Plugsy Marketplace</p><h2 id="marketplace-welcome-title" className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Everything you need, in three simple steps.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-brand-text-secondary">A quick guide before you buy or sell. It keeps the marketplace straightforward and fair for everyone.</p><div className="mt-7 grid gap-3 sm:grid-cols-3">{steps.map(([Icon, title, copy]: any, index) => <div key={title} className="rounded-2xl border border-brand-border bg-brand-surface p-4"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-accent/10 text-[11px] font-black text-brand-accent">0{index + 1}</span><Icon className="mt-4 text-brand-accent" size={20} /><h3 className="mt-3 font-black">{title}</h3><p className="mt-2 text-xs leading-5 text-brand-text-secondary">{copy}</p></div>)}</div><div className="mt-6 rounded-2xl border border-brand-accent/25 bg-brand-accent/[.06] p-5"><div className="flex items-center gap-2 font-black"><ShieldCheck size={18} className="text-brand-accent" /> Marketplace rules</div><ul className="mt-3 space-y-2 text-xs leading-5 text-brand-text-secondary"><li>Only sell work you own or have permission to sell.</li><li>Describe products honestly and keep purchases on Plugsy.</li><li>No scams, harmful files, copyright abuse or illegal content.</li></ul><label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-brand-border bg-brand-surface p-4 text-sm font-semibold"><input type="checkbox" checked={rulesChecked} onChange={(event) => setRulesChecked(event.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-accent" /><span>I have read and agree to the Marketplace rules and buyer-protection terms. <Link to="/marketplace/policy" target="_blank" className="text-brand-accent underline underline-offset-2">Read the full policy</Link>.</span></label></div><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={onLeave} className="text-xs font-black uppercase tracking-wider text-brand-text-secondary">Not now</button><button type="button" disabled={!rulesChecked || accepting} onClick={onAccept} className="btn-primary flex h-12 items-center justify-center gap-2 px-6 text-xs font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-45">{accepting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}I understand — enter Marketplace</button></div></motion.section></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-[.16em] text-brand-text-secondary">{label}</span>{children}</label>;
}

function LoadingPanel({ label }: { label: string }) {
  return <div className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-brand-border bg-brand-surface"><Loader2 className="animate-spin text-brand-accent" size={30} /><p className="mt-4 text-xs font-black uppercase tracking-wider text-brand-text-secondary">{label}</p></div>;
}

function SignInPrompt({ onClick }: { onClick: () => void }) {
  return <div className="rounded-3xl border border-brand-border bg-brand-surface p-12 text-center"><LockKeyhole className="mx-auto text-brand-accent" size={38} /><h2 className="mt-5 text-2xl font-black">Your marketplace account is waiting</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-brand-text-secondary">Sign in to sell products, access your product library, or purchase with your Plugsy Wallet.</p><button onClick={onClick} className="btn-primary mt-6 h-11 px-5 text-xs font-black uppercase tracking-wider">Sign in to continue</button></div>;
}
