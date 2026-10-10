import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Copy, Eye, Loader2, LockKeyhole, MessageCircle, RefreshCw, Save, ShieldCheck, Unplug, Users } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "../../lib/utils";

type Range = "7d" | "30d" | "90d";
type Settings = { tiktokPixelId: string; tiktokTokenConnected: boolean; enabled: boolean; updatedAt: string | null };
type Analytics = {
  views: number;
  uniqueVisitors: number;
  buttonClicks: number;
  contacts: number;
  registrations: number;
  purchases: number;
  conversionRate: number;
  tiktokSent: number;
  tiktokFailed: number;
  daily: Array<{ date: string; views: number; contacts: number }>;
  campaigns: Array<{ source: string; medium: string; campaign: string; content: string; views: number; contacts: number; registrations: number; purchases: number }>;
  portfolios: Array<{ id: string; slug: string; name: string; views: number; contacts: number }>;
};
type Payload = { analytics: Analytics; settings: Settings; publishedPortfolios: Array<{ id: string; slug: string; name: string }>; updatedAt: string };

const emptyAnalytics: Analytics = { views: 0, uniqueVisitors: 0, buttonClicks: 0, contacts: 0, registrations: 0, purchases: 0, conversionRate: 0, tiktokSent: 0, tiktokFailed: 0, daily: [], campaigns: [], portfolios: [] };

export function TikTokAdsPanel({ getToken }: { getToken: () => Promise<string | null> }) {
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [selectedPortfolio, setSelectedPortfolio] = useState("plugsy-portfolio-builder");
  const [campaign, setCampaign] = useState("portfolio_launch");
  const [content, setContent] = useState("video_01");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Admin sign-in is required.");
      const response = await fetch(`/api/admin?action=portfolio-ads&range=${range}`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success !== true) throw new Error(payload?.error || "Could not load TikTok Ads analytics.");
      setData(payload);
      setPixelId(payload.settings?.tiktokPixelId || "");
      setEnabled(payload.settings?.enabled === true);
      setSelectedPortfolio((current) => current || "plugsy-portfolio-builder");
    } catch (reason: any) {
      setError(reason?.message || "Could not load TikTok Ads analytics.");
    } finally {
      setLoading(false);
    }
  }, [getToken, range]);

  useEffect(() => { void load(); }, [load]);

  const save = async (removeTiktokToken = false) => {
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Admin sign-in is required.");
      const response = await fetch("/api/admin?action=portfolio-ads", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tiktokPixelId: pixelId.trim(), tiktokAccessToken: accessToken.trim(), enabled: removeTiktokToken ? false : enabled, removeTiktokToken }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success !== true) throw new Error(payload?.error || "Could not save TikTok connection.");
      setData((current) => current ? { ...current, settings: payload.settings } : current);
      setAccessToken("");
      setEnabled(payload.settings.enabled);
      toast.success(removeTiktokToken ? "TikTok token removed." : "TikTok Ads connection saved securely.");
    } catch (reason: any) {
      toast.error(reason?.message || "Could not save TikTok connection.");
    } finally {
      setSaving(false);
    }
  };

  const trackingUrl = useMemo(() => {
    if (!selectedPortfolio) return "";
    const origin = typeof window === "undefined" ? "https://www.plugsy.ng" : window.location.origin;
    const isBuilderCampaign = selectedPortfolio === "plugsy-portfolio-builder";
    const url = new URL(isBuilderCampaign ? "/products" : `/vp/${selectedPortfolio}`, origin);
    if (isBuilderCampaign) url.searchParams.set("portfolio_campaign", "builder");
    url.searchParams.set("utm_source", "tiktok");
    url.searchParams.set("utm_medium", "paid_social");
    url.searchParams.set("utm_campaign", campaign.trim() || "portfolio_launch");
    if (content.trim()) url.searchParams.set("utm_content", content.trim());
    return url.toString();
  }, [campaign, content, selectedPortfolio]);

  const analytics = data?.analytics || emptyAnalytics;
  const maxDaily = Math.max(1, ...analytics.daily.map((item) => item.views));
  const metricCards = [
    { label: "Portfolio views", value: analytics.views, icon: Eye, color: "text-blue-400" },
    { label: "Unique visitors", value: analytics.uniqueVisitors, icon: Users, color: "text-violet-400" },
    { label: "Contact actions", value: analytics.contacts, icon: MessageCircle, color: "text-emerald-400" },
    { label: "Conversion rate", value: `${analytics.conversionRate.toFixed(1)}%`, icon: BarChart3, color: "text-amber-400" },
  ];

  if (loading && !data) return <div className="card-premium flex min-h-[420px] items-center justify-center gap-3 p-10"><Loader2 className="animate-spin text-brand-accent"/><span className="text-xs font-black uppercase tracking-widest text-brand-text-secondary">Loading TikTok Ads</span></div>;

  return <div className="space-y-8">
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-[10px] font-black uppercase tracking-[.24em] text-brand-accent">Portfolio growth</p><h2 className="mt-2 text-4xl font-black tracking-tighter md:text-6xl">TikTok Ads</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-brand-text-secondary">See which TikTok campaigns bring portfolio visits and genuine contact actions. Personal chats, wallet details and verification data are never shown here.</p></div>
      <div className="flex items-center gap-2 rounded-2xl border border-brand-border bg-brand-surface p-1">{([['7d','7 days'],['30d','30 days'],['90d','90 days']] as Array<[Range,string]>).map(([value,label])=><button key={value} onClick={()=>setRange(value)} className={cn("rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-wider",range===value?"bg-brand-accent text-white":"text-brand-text-secondary")}>{label}</button>)}</div>
    </header>

    {error && <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-500"><strong>Setup required:</strong> {error}<button onClick={()=>void load()} className="ml-3 font-black underline">Retry</button></div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(({label,value,icon:Icon,color})=><article key={label} className="card-premium p-6"><div className={cn("mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-text/[.04]",color)}><Icon size={20}/></div><p className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">{label}</p><p className="mt-2 text-3xl font-black tracking-tight">{typeof value==='number'?value.toLocaleString():value}</p></article>)}</section>

    <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <section className="card-premium p-6 md:p-8"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-brand-accent">Daily traffic</p><h3 className="mt-2 text-xl font-black">Portfolio views</h3></div><button onClick={()=>void load()} className="rounded-xl border border-brand-border p-3 text-brand-text-secondary" aria-label="Refresh TikTok analytics"><RefreshCw size={16} className={loading?'animate-spin':''}/></button></div><div className="mt-8 flex h-56 items-end gap-1.5 sm:gap-3">{analytics.daily.map((item)=><div key={item.date} className="group flex h-full flex-1 flex-col justify-end"><div title={`${item.date}: ${item.views} views`} style={{height:`${Math.max(item.views?8:2,(item.views/maxDaily)*100)}%`}} className="min-h-0 rounded-t-lg bg-gradient-to-t from-brand-accent to-cyan-300 transition-opacity group-hover:opacity-80"/><span className="mt-2 hidden truncate text-center text-[8px] text-brand-text-secondary sm:block">{new Date(`${item.date}T00:00:00Z`).toLocaleDateString('en-NG',{day:'numeric',month:'short'})}</span></div>)}</div></section>
      <section className="card-premium p-6 md:p-8"><p className="text-[10px] font-black uppercase tracking-widest text-brand-accent">Funnel</p><h3 className="mt-2 text-xl font-black">What visitors did</h3><div className="mt-7 space-y-5">{[
        ['Viewed portfolio',analytics.views],['Clicked a button',analytics.buttonClicks],['Contacted creator',analytics.contacts],['Registered',analytics.registrations],['Purchased',analytics.purchases]
      ].map(([label,value],index)=>{const numeric=Number(value);const width=analytics.views?Math.max(numeric?5:0,(numeric/analytics.views)*100):0;return <div key={String(label)}><div className="mb-2 flex justify-between text-xs"><span className="font-bold">{label}</span><span className="font-black">{numeric.toLocaleString()}</span></div><div className="h-2 overflow-hidden rounded-full bg-brand-text/[.05]"><div style={{width:`${width}%`}} className={cn("h-full rounded-full",index===0?'bg-brand-accent':index===2?'bg-emerald-400':'bg-violet-400')}/></div></div>})}</div></section>
    </div>

    <section className="card-premium overflow-hidden"><div className="border-b border-brand-border p-6 md:p-8"><p className="text-[10px] font-black uppercase tracking-widest text-brand-accent">Campaign attribution</p><h3 className="mt-2 text-xl font-black">What is actually working</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="border-b border-brand-border bg-brand-text/[.025] text-[9px] font-black uppercase tracking-widest text-brand-text-secondary"><tr><th className="p-5">Campaign</th><th className="p-5">Creative</th><th className="p-5">Source</th><th className="p-5 text-right">Views</th><th className="p-5 text-right">Contacts</th><th className="p-5 text-right">Rate</th></tr></thead><tbody className="divide-y divide-brand-border">{analytics.campaigns.length?analytics.campaigns.map((item,index)=><tr key={`${item.source}-${item.campaign}-${item.content}-${index}`}><td className="p-5 font-bold">{item.campaign}</td><td className="p-5 text-sm text-brand-text-secondary">{item.content||'—'}</td><td className="p-5 text-sm">{item.source} / {item.medium}</td><td className="p-5 text-right font-black">{item.views.toLocaleString()}</td><td className="p-5 text-right font-black text-emerald-400">{item.contacts.toLocaleString()}</td><td className="p-5 text-right font-black">{item.views?((item.contacts/item.views)*100).toFixed(1):'0.0'}%</td></tr>):<tr><td colSpan={6} className="p-12 text-center text-sm text-brand-text-secondary">No campaign visits recorded yet. Generate a link below and use it in TikTok Ads.</td></tr>}</tbody></table></div></section>

    <div className="grid gap-6 xl:grid-cols-2">
      <section className="card-premium p-6 md:p-8"><div className="flex items-center justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-brand-accent">Connection</p><h3 className="mt-2 text-xl font-black">TikTok Events API</h3></div><span className={cn("rounded-full px-3 py-1 text-[10px] font-black",data?.settings.enabled&&data.settings.tiktokTokenConnected?'bg-emerald-500/10 text-emerald-500':'bg-amber-500/10 text-amber-500')}>{data?.settings.enabled&&data.settings.tiktokTokenConnected?'Connected':'Not connected'}</span></div><div className="mt-6 space-y-4"><label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">TikTok Pixel ID</span><input value={pixelId} onChange={(event)=>setPixelId(event.target.value)} className="h-12 w-full rounded-xl border border-brand-border bg-brand-bg px-4 text-sm" placeholder="Enter Pixel ID"/></label><label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">Events API access token</span><input value={accessToken} onChange={(event)=>setAccessToken(event.target.value)} type="password" autoComplete="new-password" className="h-12 w-full rounded-xl border border-brand-border bg-brand-bg px-4 text-sm" placeholder={data?.settings.tiktokTokenConnected?'Saved securely — leave blank to keep it':'Paste token securely'}/></label><label className="flex items-center justify-between rounded-xl border border-brand-border p-4"><span><strong className="block text-sm">Send consented events to TikTok</strong><small className="mt-1 block text-brand-text-secondary">First-party dashboard tracking works independently.</small></span><input type="checkbox" checked={enabled} onChange={(event)=>setEnabled(event.target.checked)} className="h-5 w-5 accent-brand-accent"/></label><button onClick={()=>void save()} disabled={saving} className="btn-primary flex h-12 w-full items-center justify-center gap-2 text-xs font-black">{saving?<Loader2 className="animate-spin" size={16}/>:<Save size={16}/>}Save connection</button>{data?.settings.tiktokTokenConnected&&<button onClick={()=>void save(true)} disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 text-xs font-black text-red-500"><Unplug size={15}/>Remove token</button>}<p className="flex gap-2 text-[11px] leading-5 text-brand-text-secondary"><LockKeyhole className="mt-0.5 shrink-0" size={14}/>The token is encrypted before storage and is never returned to the browser.</p></div></section>

      <section className="card-premium p-6 md:p-8"><p className="text-[10px] font-black uppercase tracking-widest text-brand-accent">Campaign link</p><h3 className="mt-2 text-xl font-black">Create a trackable Plugsy URL</h3><div className="mt-6 space-y-4"><label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">Destination</span><select value={selectedPortfolio} onChange={(event)=>setSelectedPortfolio(event.target.value)} className="h-12 w-full rounded-xl border border-brand-border bg-brand-bg px-4 text-sm"><option value="plugsy-portfolio-builder">Plugsy Portfolio Builder — use for Plugsy ads</option>{data?.publishedPortfolios?.length?<optgroup label="Individual public profiles — only use when advertising that person">{data.publishedPortfolios.map((portfolio)=><option key={portfolio.id} value={portfolio.slug}>Public profile: {portfolio.name}</option>)}</optgroup>:null}</select></label>{selectedPortfolio!=="plugsy-portfolio-builder"&&<p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-5 text-amber-500">This option opens an individual user&apos;s public profile. Select Plugsy Portfolio Builder for general Plugsy advertising.</p>}<div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">Campaign</span><input value={campaign} onChange={(event)=>setCampaign(event.target.value)} className="h-12 w-full rounded-xl border border-brand-border bg-brand-bg px-4 text-sm"/></label><label><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">Creative</span><input value={content} onChange={(event)=>setContent(event.target.value)} className="h-12 w-full rounded-xl border border-brand-border bg-brand-bg px-4 text-sm"/></label></div><div className="rounded-xl border border-brand-border bg-brand-bg p-4 text-xs leading-5 break-all">{trackingUrl}</div><button onClick={async()=>{if(!trackingUrl)return;await navigator.clipboard.writeText(trackingUrl);toast.success('TikTok tracking link copied.');}} disabled={!trackingUrl} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand-border text-xs font-black disabled:opacity-40"><Copy size={16}/>Copy tracking link</button><p className="text-[11px] leading-5 text-brand-text-secondary">For normal Plugsy portfolio ads, keep Plugsy Portfolio Builder selected and paste this exact link into TikTok&apos;s Destination URL. Change the creative name for every video.</p></div></section>
    </div>

    <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[.06] p-6"><div className="flex gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500"><ShieldCheck size={21}/></span><div><h3 className="font-black">Privacy-safe by design</h3><p className="mt-2 max-w-4xl text-xs leading-6 text-brand-text-secondary">This dashboard stores campaign labels, event type, broad device/country and a one-way session hash. It does not store raw IP addresses, full browser signatures, TikTok click IDs, chats, wallet information, bank details, BVN, NIN or biometric data. TikTok delivery happens only after the visitor chooses ad measurement.</p><p className="mt-2 text-xs font-bold text-emerald-500">TikTok delivery: {analytics.tiktokSent.toLocaleString()} sent · {analytics.tiktokFailed.toLocaleString()} failed</p></div></div></section>
  </div>;
}
