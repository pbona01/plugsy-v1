import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import { BadgePercent, CheckCircle2, Clock3, Copy, WalletCards } from 'lucide-react';

type Product = { id: string; title: string; resalePolicy: string; resaleCommissionPercent: number | null; privateAccessToken?: string };
type Deal = { id: string; requested_commission_percent: number; status: string; listing_id: string; listing?: { title: string } };
type Earning = { id: string; order_reference: string; reseller_amount: number; funds_status: string; hold_expires_at?: string | null; payout_available_at?: string | null; created_at: string; listing?: { title?: string } };
const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default function ResaleWorkspace({ products }: { products: Product[] }) {
  const { getToken, userId } = useAuth();
  const [deals, setDeals] = useState<{ incoming: Deal[]; outgoing: Deal[]; earnings: Earning[] }>({ incoming: [], outgoing: [], earnings: [] });
  const [selected, setSelected] = useState('');
  const [percent, setPercent] = useState('15');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useCallback(async (action: string, body?: unknown) => {
    const token = await getToken();
    const response = await fetch(`/api/marketplace?action=${action}`, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Refer & Earn is temporarily unavailable.');
    return payload;
  }, [getToken]);
  const refresh = useCallback(async () => {
    if (!userId) return;
    try { const payload = await request('resale-workspace'); setDeals({ incoming: payload.incoming || [], outgoing: payload.outgoing || [], earnings: payload.earnings || [] }); setError(''); }
    catch (err: any) { setError(err.message); }
  }, [request, userId]);
  useEffect(() => { void refresh(); }, [refresh]);
  const product = products.find((entry) => entry.id === selected);
  const totals = useMemo(() => ({
    pending: deals.earnings.filter((item) => item.funds_status === 'held').reduce((sum, item) => sum + Number(item.reseller_amount || 0), 0),
    released: deals.earnings.filter((item) => item.funds_status === 'released').reduce((sum, item) => sum + Number(item.reseller_amount || 0), 0),
  }), [deals.earnings]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!product) return; setBusy(true);
    try { await request('request-resale', { listingId: product.id, percent: product.resalePolicy === 'fixed_percent' ? product.resaleCommissionPercent : Number(percent), privateAccessToken: product.privateAccessToken }); toast.success(product.resalePolicy === 'fixed_percent' ? 'Your tracked referral link is ready.' : 'Approval request sent to the creator.'); await refresh(); }
    catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  };
  const decide = async (deal: Deal, status: string) => {
    setBusy(true); try { await request('decide-resale', { requestId: deal.id, status }); toast.success('Referral decision saved.'); await refresh(); }
    catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  };
  const copy = async (listingId: string) => {
    setBusy(true);
    try { const payload = await request('referral-link', { listingId }); const url = new URL(payload.referral.path, window.location.origin).toString(); await navigator.clipboard.writeText(url); toast.success('Your tracked referral link was copied.'); }
    catch (err: any) { toast.error(err.message || 'Your referral link is unavailable.'); } finally { setBusy(false); }
  };
  if (!userId) return null;
  return <section className="mx-auto mt-8 max-w-7xl rounded-3xl border border-brand-border bg-brand-surface p-5 sm:p-7">
    <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-brand-accent">Refer & Earn</p><h2 className="mt-2 flex items-center gap-2 text-2xl font-black"><BadgePercent size={23}/> Earn when friends buy</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-brand-text-secondary">Share a tracked product link. Your commission stays protected with the order for 10 hours, then moves to your Withdrawable Balance.</p></div>
    {error && <p role="alert" className="mt-4 text-sm text-red-500">{error}</p>}
    <div className="mt-6 grid gap-3 sm:grid-cols-2"><Metric icon={Clock3} label="Protected earnings" value={money(totals.pending)} detail="Releases after buyer protection"/><Metric icon={WalletCards} label="Released to wallet" value={money(totals.released)} detail="Available in Withdrawable Balance"/></div>
    <form onSubmit={submit} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-brand-border bg-brand-bg p-4"><label className="min-w-0 flex-1 text-xs font-bold">Choose a product<select required value={selected} onChange={(event) => setSelected(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-sm"><option value="">Products with referrals enabled</option>{products.filter((entry) => entry.resalePolicy !== 'not_allowed').map((entry) => <option key={entry.id} value={entry.id}>{entry.title}{entry.resalePolicy === 'fixed_percent' ? ` · ${entry.resaleCommissionPercent}%` : ' · approval required'}</option>)}</select></label>{product?.resalePolicy === 'approval_required' && <label className="text-xs font-bold">Requested %<input required type="number" min="1" max="80" step="0.01" value={percent} onChange={(event) => setPercent(event.target.value)} className="mt-2 block h-11 w-28 rounded-xl border border-brand-border bg-brand-surface px-3 text-sm"/></label>}<button disabled={busy || !product} className="btn-primary h-11 px-5 text-sm font-black disabled:opacity-50">{product?.resalePolicy === 'fixed_percent' ? 'Get referral link' : 'Request approval'}</button></form>
    <div className="mt-7 grid gap-6 lg:grid-cols-2"><div><h3 className="font-black">Your referral products</h3>{!deals.outgoing.length && <p className="mt-3 text-sm text-brand-text-secondary">Choose a product above to get started.</p>}{deals.outgoing.map((deal) => <article key={deal.id} className="mt-3 rounded-2xl border border-brand-border p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{deal.listing?.title}</p><p className="mt-1 text-xs text-brand-text-secondary">{deal.requested_commission_percent}% commission · {deal.status}</p></div>{deal.status === 'approved' && <CheckCircle2 size={17} className="text-emerald-500"/>}</div>{deal.status === 'approved' && <button disabled={busy} onClick={() => void copy(deal.listing_id)} className="mt-3 inline-flex items-center gap-2 text-xs font-black text-brand-accent"><Copy size={14}/> Copy tracked link</button>}</article>)}</div><div><h3 className="font-black">Requests for your products</h3>{!deals.incoming.length && <p className="mt-3 text-sm text-brand-text-secondary">No approval requests yet.</p>}{deals.incoming.map((deal) => <article key={deal.id} className="mt-3 rounded-2xl border border-brand-border p-4"><p className="text-sm font-bold">{deal.listing?.title}</p><p className="mt-1 text-xs text-brand-text-secondary">{deal.requested_commission_percent}% requested · {deal.status}</p><div className="mt-3 flex gap-3">{deal.status === 'pending' && <><button disabled={busy} onClick={() => void decide(deal, 'approved')} className="text-xs font-bold text-brand-accent">Approve {deal.requested_commission_percent}%</button><button disabled={busy} onClick={() => void decide(deal, 'rejected')} className="text-xs font-bold text-red-500">Reject</button></>}{deal.status === 'approved' && <button disabled={busy} onClick={() => void decide(deal, 'revoked')} className="text-xs font-bold text-red-500">Stop future commissions</button>}</div></article>)}</div></div>
    <div className="mt-8"><h3 className="font-black">Commission history</h3>{!deals.earnings.length ? <p className="mt-3 text-sm text-brand-text-secondary">Your referred purchases will appear here.</p> : <div className="mt-3 divide-y divide-brand-border overflow-hidden rounded-2xl border border-brand-border">{deals.earnings.map((earning) => <div key={earning.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold">{earning.listing?.title || 'Marketplace product'}</p><p className="mt-1 text-[10px] text-brand-text-secondary">{earning.order_reference} · {new Date(earning.created_at).toLocaleDateString()}</p></div><div className="sm:text-right"><p className="font-black">{money(earning.reseller_amount)}</p><p className={`mt-1 text-[10px] font-black uppercase tracking-wider ${earning.funds_status === 'released' ? 'text-emerald-500' : 'text-brand-accent'}`}>{earning.funds_status === 'released' ? 'Released to wallet' : earning.funds_status === 'held' ? `Protected until ${new Date(earning.hold_expires_at || earning.payout_available_at || earning.created_at).toLocaleString()}` : earning.funds_status}</p></div></div>)}</div>}</div>
  </section>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: any; label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-brand-border bg-brand-bg p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-accent/10 text-brand-accent"><Icon size={18}/></span><p className="mt-4 text-[10px] font-black uppercase tracking-wider text-brand-text-secondary">{label}</p><p className="mt-1 text-2xl font-black">{value}</p><p className="mt-1 text-xs text-brand-text-secondary">{detail}</p></div>;
}
