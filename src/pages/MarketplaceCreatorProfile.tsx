import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, CheckCircle2, Loader2, Store, UserMinus, UserPlus, UserRound } from "lucide-react";
import toast from "react-hot-toast";
import { MarketplaceMark } from "../components/icons/MarketplaceMark";

const money = (value: number) => `₦${Number(value || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

export default function MarketplaceCreatorProfile() {
  const { sellerId = "" } = useParams<{ sellerId: string }>();
  const { userId, getToken } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/marketplace?action=creator&sellerId=${encodeURIComponent(sellerId)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Creator profile is unavailable.");
      setData(payload);
      if (userId) {
        const token = await getToken();
        const follows = await fetch("/api/marketplace?action=followed-sellers", { headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" } });
        const followPayload = await follows.json().catch(() => null);
        setFollowing(Boolean(followPayload?.sellerIds?.includes(sellerId)));
      }
    } catch (error: any) { toast.error(error.message || "Creator profile is unavailable."); }
    finally { setLoading(false); }
  }, [getToken, sellerId, userId]);

  useEffect(() => { void load(); }, [load]);

  const toggleFollow = async () => {
    if (!userId) { navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    if (sellerId === userId) return;
    setBusy(true);
    try {
      const token = await getToken();
      const response = await fetch("/api/marketplace?action=follow-seller", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" }, body: JSON.stringify({ sellerId, follow: !following }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Could not update creator follow.");
      setFollowing(Boolean(payload.following));
      setData((current: any) => current ? { ...current, creator: { ...current.creator, followers: Math.max(0, Number(current.creator.followers || 0) + (payload.following ? 1 : -1)) } } : current);
    } catch (error: any) { toast.error(error.message || "Could not update creator follow."); }
    finally { setBusy(false); }
  };

  if (loading) return <main className="grid min-h-screen place-items-center bg-brand-bg text-brand-text"><Loader2 className="animate-spin text-brand-accent" size={32} /></main>;
  if (!data?.creator) return <main className="grid min-h-screen place-items-center bg-brand-bg px-6 text-center text-brand-text"><div><MarketplaceMark className="mx-auto text-brand-accent" size={44}/><h1 className="mt-5 text-2xl font-black">Creator unavailable</h1><Link to="/marketplace" className="mt-4 inline-block text-sm font-bold text-brand-accent">Explore Marketplace</Link></div></main>;
  const creator = data.creator;
  return <main className="min-h-screen bg-brand-bg px-4 pb-24 pt-20 text-brand-text sm:px-6 lg:px-8"><Helmet><title>{creator.name} | Plugsy Marketplace</title><meta name="description" content={`Browse ${creator.name}'s digital products on Plugsy Marketplace.`}/></Helmet><div className="mx-auto max-w-6xl"><Link to="/marketplace" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand-text-secondary transition hover:text-brand-accent"><ArrowLeft size={16}/>Marketplace</Link><section className="mt-5 overflow-hidden rounded-[2rem] border border-brand-border bg-brand-surface"><div className="h-28 bg-gradient-to-r from-brand-accent/25 via-brand-surface to-cyan-400/20"/><div className="relative px-6 pb-7 sm:px-8"><span className="absolute -top-12 grid h-24 w-24 place-items-center overflow-hidden rounded-[1.75rem] border-4 border-brand-surface bg-brand-accent/10 text-brand-accent">{creator.avatar ? <img src={creator.avatar} alt="" className="h-full w-full object-cover"/> : <UserRound size={36}/>}</span><div className="flex flex-col gap-5 pt-16 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">{creator.name} {creator.verified && <CheckCircle2 className="inline text-brand-accent" size={21} fill="currentColor"/>}</h1><p className="mt-1 text-sm text-brand-text-secondary">{creator.username ? `@${creator.username}` : "Plugsy creator"}</p></div>{sellerId !== userId && <button disabled={busy} onClick={() => void toggleFollow()} className="btn-primary flex h-11 items-center justify-center gap-2 px-5 text-xs font-black disabled:opacity-50">{following ? <UserMinus size={15}/> : <UserPlus size={15}/>} {following ? "Following" : "Follow creator"}</button>}</div><div className="mt-6 grid max-w-xl grid-cols-4 divide-x divide-brand-border rounded-2xl border border-brand-border bg-brand-bg"><div className="p-4 text-center"><p className="text-lg font-black">{data.listings.length}</p><p className="text-[9px] font-black uppercase tracking-wider text-brand-text-secondary">Products</p></div><div className="p-4 text-center"><p className="text-lg font-black">{creator.followers}</p><p className="text-[9px] font-black uppercase tracking-wider text-brand-text-secondary">Followers</p></div><div className="p-4 text-center"><p className="text-lg font-black">{creator.following}</p><p className="text-[9px] font-black uppercase tracking-wider text-brand-text-secondary">Following</p></div><div className="p-4 text-center"><p className="text-lg font-black">{creator.trustScore === null ? "New" : creator.trustScore}</p><p className="text-[9px] font-black uppercase tracking-wider text-brand-text-secondary">Trust</p></div></div></div></section>{data.followingCreators?.length > 0 && <section className="mt-7 rounded-3xl border border-brand-border bg-brand-surface p-6"><h2 className="text-sm font-black">Following</h2><div className="mt-4 flex flex-wrap gap-3">{data.followingCreators.map((followed: any) => <Link key={followed.id} to={`/marketplace/creator/${followed.id}`} className="flex items-center gap-2 rounded-full border border-brand-border bg-brand-bg py-1.5 pl-1.5 pr-3 text-xs font-bold transition hover:border-brand-accent/50"><span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-brand-accent/10 text-brand-accent">{followed.avatar ? <img src={followed.avatar} alt="" className="h-full w-full object-cover"/> : <UserRound size={14}/>}</span>{followed.name}{followed.verified && <CheckCircle2 className="text-brand-accent" size={13} fill="currentColor"/>}</Link>)}</div></section>}<section className="mt-9"><div className="flex items-center gap-3"><Store className="text-brand-accent" size={19}/><div><h2 className="text-xl font-black">Products</h2><p className="text-xs text-brand-text-secondary">Everything this creator has published publicly.</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.listings.length ? data.listings.map((product: any) => <Link key={product.id} to={`/marketplace/product/${product.id}`} className="group overflow-hidden rounded-2xl border border-brand-border bg-brand-surface transition hover:-translate-y-0.5 hover:border-brand-accent/50 hover:shadow-lg"><div className="aspect-[16/9] bg-brand-bg">{product.coverImageUrl ? <img src={product.coverImageUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"/> : <MarketplaceMark className="m-6 text-brand-accent/40" size={52}/>}</div><div className="p-5"><p className="text-[9px] font-black uppercase tracking-wider text-brand-accent">{product.category.replace(/[_-]/g," ")}</p><h3 className="mt-2 truncate font-black">{product.title}</h3><p className="mt-2 line-clamp-2 text-xs leading-5 text-brand-text-secondary">{product.summary || product.description}</p><p className="mt-4 font-black">{money(product.fee?.total ?? product.price)}</p></div></Link>) : <p className="rounded-2xl border border-dashed border-brand-border p-8 text-sm text-brand-text-secondary sm:col-span-2 lg:col-span-3">This creator has no public products yet.</p>}</div></section></div></main>;
}
