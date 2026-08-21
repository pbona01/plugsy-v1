import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { ArrowLeft, Send, Loader2, Briefcase, UserRound } from "lucide-react";
import { toast } from "react-hot-toast";

type Portfolio = { id: string; slug: string; full_name: string | null; category: string | null; status: string };
type Recipient = { clerk_id: string; email: string | null; full_name: string | null; username: string | null };

export default function AdminPortfolioShare() {
  const { getToken } = useAuth();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [portfolioId, setPortfolioId] = useState("");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

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
    if (!portfolioId || !recipientUserId) return toast.error("Select a portfolio and user first.");
    setSending(true);
    try {
      await request({ method: "POST", body: JSON.stringify({ portfolioId, recipientUserId }) });
      toast.success("Portfolio sent successfully.");
      setPortfolioId("");
      setRecipientUserId("");
    } catch (error: any) {
      toast.error(error.message || "Portfolio could not be sent.");
    } finally {
      setSending(false);
    }
  };

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
              <p className="text-sm text-brand-text-secondary mt-1">Choose a portfolio and send it directly to a user’s Plugsy chat.</p>
            </div>
          </div>
          {loading ? <div className="py-12 flex justify-center"><Loader2 className="animate-spin" /></div> : (
            <form onSubmit={sendPortfolio} className="space-y-6">
              <label className="block">
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-text-secondary mb-2"><Briefcase size={14} /> Portfolio</span>
                <select value={portfolioId} onChange={(event) => setPortfolioId(event.target.value)} className="w-full rounded-xl border border-brand-border bg-brand-bg px-4 py-3 text-sm outline-none focus:border-brand-accent">
                  <option value="">Select a portfolio</option>
                  {portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.full_name || "Untitled portfolio"} — {portfolio.slug}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-text-secondary mb-2"><UserRound size={14} /> Send to user</span>
                <select value={recipientUserId} onChange={(event) => setRecipientUserId(event.target.value)} className="w-full rounded-xl border border-brand-border bg-brand-bg px-4 py-3 text-sm outline-none focus:border-brand-accent">
                  <option value="">Select a user</option>
                  {recipients.map((recipient) => <option key={recipient.clerk_id} value={recipient.clerk_id}>{recipient.full_name || recipient.username || "Unnamed user"}{recipient.email ? ` — ${recipient.email}` : ""}</option>)}
                </select>
              </label>
              <button disabled={sending || !portfolioId || !recipientUserId} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-accent px-5 py-3.5 text-sm font-black uppercase tracking-widest text-white disabled:opacity-50">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send Portfolio
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
