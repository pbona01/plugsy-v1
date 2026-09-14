import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, RefreshCw, Loader2, Scale } from 'lucide-react';
import toast from 'react-hot-toast';

type Dispute = { id: string; order_id: string; buyer_id: string; seller_id: string; reason_code: string; description: string; status: string; resolution_note?: string; created_at: string };
type Seller = { user_id: string; verification_status: string; verification_reference?: string; public_selling_enabled: boolean; public_plan_expires_at?: string; total_sales_count: number };
type AuditEvent = { id: string; action: string; actor_id: string; entity_id: string; created_at: string };

export default function AdminMarketplace() {
  const { getToken } = useAuth();
  const [data, setData] = useState<{ disputes: Dispute[]; sellers: Seller[]; events: AuditEvent[] }>({ disputes: [], sellers: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [decision, setDecision] = useState<{ dispute: Dispute; outcome: 'buyer' | 'seller' } | null>(null);
  const [note, setNote] = useState('');
  const [seller, setSeller] = useState<Seller | null>(null);
  const [reference, setReference] = useState('');
  const [expiry, setExpiry] = useState('');
  const [verified, setVerified] = useState(false);

  const request = useCallback(async (action: string, body?: unknown) => {
    const token = await getToken();
    const response = await fetch(`/api/marketplace?action=${action}`, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error || 'Marketplace review unavailable.');
    return payload;
  }, [getToken]);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await request('admin-workspace'); setData(result); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => { void refresh(); }, [refresh]);

  const resolve = async (event: React.FormEvent) => {
    event.preventDefault(); if (!decision) return;
    setBusy(true);
    try { await request('resolve-dispute', { disputeId: decision.dispute.id, outcome: decision.outcome, note }); toast.success(decision.outcome === 'buyer' ? 'Refunded to buyer wallet; product access revoked.' : 'Decision saved. Funds return to the release queue.'); setDecision(null); setNote(''); await refresh(); }
    catch (err: any) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const review = async (event: React.FormEvent) => {
    event.preventDefault(); if (!seller) return;
    setBusy(true);
    try { await request('review-seller', { sellerId: seller.user_id, verified, reference, planExpiresAt: expiry ? new Date(expiry).toISOString() : null }); toast.success('Seller review recorded.'); setSeller(null); await refresh(); }
    catch (err: any) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const open = data.disputes.filter((entry) => ['open','seller_response'].includes(entry.status));
  const inputClass = 'w-full rounded-xl border border-brand-border bg-brand-bg p-3 text-sm';
  return <main className="min-h-screen bg-brand-bg p-4 text-brand-text sm:p-8"><div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><Link to="/admin" className="inline-flex items-center gap-2 text-sm text-brand-text-secondary"><ArrowLeft size={16} /> Admin dashboard</Link><h1 className="mt-5 text-3xl font-bold tracking-tight">Marketplace operations</h1><p className="mt-2 text-sm text-brand-text-secondary">Review genuine issues, protect buyers and approve sellers. All decisions are recorded.</p></div><button onClick={() => void refresh()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-brand-border px-4 py-3 text-sm"><RefreshCw size={16} /> Refresh</button></header>
    <div className="mt-8 grid gap-4 sm:grid-cols-3">{[['Open disputes',open.length],['Verified sellers',data.sellers.filter((entry) => entry.verification_status === 'verified').length],['Recent audit events',data.events.length]].map(([label,value]) => <div key={String(label)} className="rounded-2xl border border-brand-border bg-brand-surface p-6"><p className="text-sm text-brand-text-secondary">{label}</p><p className="mt-3 text-3xl font-bold">{value}</p><p className="mt-2 text-xs text-brand-text-secondary">Within the loaded review window</p></div>)}</div>
    {error && <p role="alert" className="mt-6 rounded-xl border border-red-500/30 p-4 text-red-500">{error}</p>}
    {loading ? <Loader2 className="mx-auto mt-12 animate-spin" /> : <>
      <section className="mt-8 rounded-2xl border border-brand-border bg-brand-surface p-6"><h2 className="flex items-center gap-2 text-xl font-bold"><Scale size={20} /> Buyer reports</h2><div className="mt-5 space-y-4">{data.disputes.length ? data.disputes.map((entry) => <article key={entry.id} className="rounded-xl border border-brand-border p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-bold">{entry.reason_code.replaceAll('_',' ')}</p><p className="mt-1 break-all text-xs text-brand-text-secondary">Order {entry.order_id} · {new Date(entry.created_at).toLocaleString()}</p></div><span className="text-xs font-bold text-brand-accent">{entry.status.replaceAll('_',' ')}</span></div><p className="mt-4 whitespace-pre-wrap break-words text-sm">{entry.description}</p>{entry.resolution_note && <p className="mt-3 text-sm text-brand-text-secondary">Decision: {entry.resolution_note}</p>}{['open','seller_response'].includes(entry.status) && <div className="mt-4 flex flex-wrap gap-3"><button onClick={() => { setNote(''); setDecision({ dispute: entry, outcome: 'buyer' }); }} className="rounded-lg bg-red-500/10 px-4 py-2 text-sm font-bold text-red-500">Refund buyer</button><button onClick={() => { setNote(''); setDecision({ dispute: entry, outcome: 'seller' }); }} className="rounded-lg border border-brand-border px-4 py-2 text-sm font-bold">Resolve for seller</button></div>}</article>) : <p className="text-sm text-brand-text-secondary">No reports in the loaded window.</p>}</div></section>
      <section className="mt-8 rounded-2xl border border-brand-border bg-brand-surface p-6"><h2 className="flex items-center gap-2 text-xl font-bold"><ShieldCheck size={20} /> Seller reviews</h2><input aria-label="Search loaded sellers" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search seller account ID" className={`${inputClass} mt-5`} /><div className="mt-4 space-y-3">{data.sellers.filter((entry) => entry.user_id.toLowerCase().includes(search.toLowerCase())).map((entry) => <div key={entry.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-border p-4"><div><p className="break-all text-sm font-bold">{entry.user_id}</p><p className="mt-1 text-xs text-brand-text-secondary">{entry.verification_status} · {entry.total_sales_count} orders · public access {entry.public_plan_expires_at ? `expires ${new Date(entry.public_plan_expires_at).toLocaleDateString()}` : 'not granted'}</p></div><button onClick={() => { setSeller(entry); setReference(entry.verification_reference || ''); setVerified(entry.verification_status === 'verified'); setExpiry(''); }} className="rounded-lg border border-brand-border px-4 py-2 text-sm">Review access</button></div>)}</div><p className="mt-4 text-xs text-brand-text-secondary">Manual review is not automated NIN/passport verification. Enter a genuine review reference, not an invented approval.</p></section>
      <section className="mt-8 rounded-2xl border border-brand-border bg-brand-surface p-6"><h2 className="text-xl font-bold">Recent audit trail</h2>{data.events.map((entry) => <p key={entry.id} className="mt-4 break-all border-t border-brand-border pt-3 text-xs text-brand-text-secondary">{new Date(entry.created_at).toLocaleString()} · {entry.action} · {entry.entity_id} · by {entry.actor_id}</p>)}</section>
    </>}
    {(decision || seller) && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4"><form onSubmit={decision ? resolve : review} role="dialog" aria-modal="true" aria-label={decision ? 'Resolve buyer report' : 'Review seller access'} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-brand-border bg-brand-bg p-6"><h2 className="text-xl font-bold">{decision ? decision.outcome === 'buyer' ? 'Confirm buyer refund' : 'Confirm seller decision' : 'Review seller access'}</h2>{decision ? <><p className="mt-3 text-sm text-brand-text-secondary">{decision.outcome === 'buyer' ? 'This refunds the full order to the buyer’s Plugsy wallet and revokes access. Review the evidence before confirming.' : 'The order goes back to its release queue. Only confirm after reviewing the buyer’s report.'}</p><textarea required minLength={10} maxLength={3000} aria-label="Decision explanation" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain the evidence and your decision" className={`${inputClass} mt-5 min-h-32`} /></> : <><label className="mt-5 flex gap-3 text-sm"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /> Identity review completed successfully</label><label className="mt-5 block text-sm">Review reference<input required={verified} minLength={verified ? 10 : undefined} maxLength={500} value={reference} onChange={(event) => setReference(event.target.value)} className={`${inputClass} mt-2`} /></label><label className="mt-5 block text-sm">Public access expiry (leave blank to revoke)<input type="datetime-local" value={expiry} onChange={(event) => setExpiry(event.target.value)} className={`${inputClass} mt-2`} /></label><p className="mt-3 text-xs text-brand-text-secondary">This grants manually reviewed access. It does not charge or create a Premium subscription.</p></>}<div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={() => { setDecision(null); setSeller(null); }} className="rounded-xl border border-brand-border px-4 py-3 text-sm">Cancel</button><button disabled={busy} className="btn-primary px-4 py-3 text-sm">{busy ? 'Saving…' : 'Confirm decision'}</button></div></form></div>}
  </div></main>;
}
