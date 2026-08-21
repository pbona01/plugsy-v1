import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { ArrowLeft, Send, Loader2, Briefcase, UserRound, Search, ChevronDown } from "lucide-react";
import { toast } from "react-hot-toast";

type Portfolio = { id: string; slug: string; full_name: string | null; category: string | null; status: string };
type Recipient = { clerk_id: string; email: string | null; full_name: string | null; username: string | null };

export default function AdminPortfolioShare() {
  const { getToken } = useAuth();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientUserId, setRecipientUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [portfolioCategory, setPortfolioCategory] = useState("all");
  const [userSearch, setUserSearch] = useState("");

  const request = async (options: RequestInit = {}) => {
    const token = await getToken();
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body) headers.set("Content-Type", "application/json");
    const response = await fetch("/api/admin?action=portfolio-share", { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || "Request failed");
    return payload;
  };

  useEffect(() => {
    request()
      .then((payload) => {
        setPortfolios(payload.portfolios || []);
        setRecipients(payload.users || []);
      })
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, []);

  const sendPortfolio = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!portfolioCategory || portfolioCategory === "all" || !recipientUserId) return toast.error("Select a category and user first.");
    setSending(true);
    try {
      await request({ method: "POST", body: JSON.stringify({ category: portfolioCategory, recipientUserId }) });
      toast.success("Portfolio category sent successfully.");
      setPortfolioCategory("all");
      setRecipientUserId("");
    } catch (error: any) {
      toast.error(error.message || "Portfolio could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const categoryLabel = (value: string | null) => {
    const labels: Record<string, string> = {
      graphic_design: "Graphic Design",
      video_editing: "Video Editing",
      web_development: "Web Development",
      uiux_design: "UI/UX Design",
      copywriting: "Copywriting",
      digital_marketing: "Digital Marketing",
      social_media_management: "Social Media Management",
      photography: "Photography",
      ai_automation: "AI Automation",
      cybersecurity: "Cybersecurity",
      three_d_design: "3D Design & Animation",
    };
    return labels[value || ""] || (value || "Other").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  };

  const categories = [...new Set(portfolios.map((portfolio) => portfolio.category).filter(Boolean) as string[])].sort();
  const visibleRecipients = recipients.filter((recipient) => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return true;
    return [recipient.full_name, recipient.username, recipient.email].some((value) => String(value || "").toLowerCase().includes(query));
  });

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <Link to="/admin" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-text-secondary hover:text-brand-text mb-8">
          <ArrowLeft size={16} /> Back to Admin
        </Link>
        <div className="bg-brand-surface border border-brand-border rounded-3xl p-6 md:p-8 shadow-xl">
          <div className="flex items-start gap-4 mb-8">
            <div className="p-3 rounded-2xl bg-brand-accent/10 text-brand-accent"><Send size={22} /></div>
            <div>
              <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight">Send a Portfolio</h1>
              <p className="text-sm text-brand-text-secondary mt-1">Choose a portfolio category and send it directly to a user’s Plugsy chat.</p>
            </div>
          </div>
          {loading ? <div className="py-12 flex justify-center"><Loader2 className="animate-spin" /></div> : (
            <form onSubmit={sendPortfolio} className="space-y-6">
              <label className="block">
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-text-secondary mb-2"><Briefcase size={14} /> Portfolio category</span>
                <select value={portfolioCategory} onChange={(event) => setPortfolioCategory(event.target.value)} className="w-full rounded-xl border border-brand-border bg-brand-bg px-4 py-3 text-sm outline-none focus:border-brand-accent">
                  <option value="all">Select a category</option>
                  {categories.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-text-secondary mb-2"><UserRound size={14} /> Send to user</span>
                <div className="relative mb-2"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary" /><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search name, username, or email" className="w-full rounded-xl border border-brand-border bg-brand-bg pl-9 pr-4 py-3 text-sm outline-none focus:border-brand-accent" /></div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-brand-border bg-brand-bg p-1 space-y-1">
                  {visibleRecipients.length === 0 ? <p className="p-3 text-xs text-brand-text-secondary">No users found.</p> : visibleRecipients.map((recipient) => {
                    const selected = recipientUserId === recipient.clerk_id;
                    return <button type="button" key={recipient.clerk_id} onClick={() => setRecipientUserId(recipient.clerk_id)} className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${selected ? "bg-brand-accent text-white" : "hover:bg-brand-text/5"}`}><span className="min-w-0"><span className="block truncate font-bold">{recipient.full_name || recipient.username || "Unnamed user"}</span><span className={`block truncate text-xs ${selected ? "text-white/75" : "text-brand-text-secondary"}`}>{recipient.email || `@${recipient.username || "user"}`}</span></span>{selected && <ChevronDown size={16} className="rotate-180 shrink-0" />}</button>;
                  })}
                </div>
              </label>
              <button disabled={sending || portfolioCategory === "all" || !recipientUserId} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-accent px-5 py-3.5 text-sm font-black uppercase tracking-widest text-white disabled:opacity-50">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send Portfolio
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
