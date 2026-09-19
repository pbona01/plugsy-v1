import { useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Check, Crown, HardDrive, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { marketplaceAttempt, clearMarketplaceAttempt } from '../../utils/marketplaceAttempt.js';

const naira = (value: number) => `₦${value.toLocaleString('en-NG')}`;

export default function SellerPremiumPlan({ seller, onComplete }: { seller: any; onComplete: () => Promise<void> }) {
  const { userId, getToken } = useAuth();
  const [busy, setBusy] = useState('');
  const [storageGb, setStorageGb] = useState(10);
  const expires = seller?.public_plan_expires_at ? new Date(seller.public_plan_expires_at) : null;
  const active = seller?.public_selling_enabled && expires && expires.getTime() > Date.now();
  const storagePrice = storageGb * (active ? 250 : 350);
  const storageCopy = useMemo(() => active ? 'Premium storage is ₦250 per GB — ₦2,500 for 10GB.' : 'Every seller gets 3GB included. Upgrade up to 10GB at ₦350 per GB — ₦3,500 for 10GB.', [active]);

  const activate = async (planCode: 'monthly' | 'yearly') => {
    if (!userId || busy || !window.confirm(`Pay ${planCode === 'yearly' ? '₦13,500 for one year' : '₦1,500 for one month'} from your Plugsy Wallet?`)) return;
    setBusy(planCode);
    try {
      const key = marketplaceAttempt(localStorage, userId, `seller-premium-${planCode}`);
      const token = await getToken();
      const response = await fetch('/api/marketplace?action=activate-premium', { method: 'POST', headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: key, planCode, acceptedTermsVersion: 'marketplace-premium-v1' }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Plan activation failed.');
      clearMarketplaceAttempt(localStorage, userId, `seller-premium-${planCode}`); toast.success(`${planCode === 'yearly' ? 'Yearly' : 'Monthly'} Premium activated.`); await onComplete();
    } catch (error: any) { toast.error(error.message || 'Plan activation failed.'); } finally { setBusy(''); }
  };

  const activateStorage = async () => {
    if (!userId || busy || !window.confirm(`Upgrade your seller storage to ${storageGb}GB for ${naira(storagePrice)}?`)) return;
    setBusy('storage');
    try {
      const key = marketplaceAttempt(localStorage, userId, `seller-storage-${storageGb}`); const token = await getToken();
      const response = await fetch('/api/marketplace?action=activate-storage', { method: 'POST', headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: key, capacityGb: storageGb }) });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Storage upgrade failed.');
      clearMarketplaceAttempt(localStorage, userId, `seller-storage-${storageGb}`); toast.success(`Storage upgraded to ${result.plan.capacity_gb}GB.`); await onComplete();
    } catch (error: any) { toast.error(error.message || 'Storage upgrade failed.'); } finally { setBusy(''); }
  };

  return <section className="mx-auto mt-6 max-w-7xl overflow-hidden rounded-3xl border border-brand-accent/30 bg-gradient-to-br from-brand-accent/[.16] via-brand-surface to-brand-surface p-6 shadow-[0_20px_70px_rgba(22,119,255,.12)] sm:p-8">
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between"><div className="max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full bg-brand-accent px-3 py-1.5 text-[10px] font-black uppercase tracking-[.16em] text-white"><Crown size={13}/> Go Premium</span><h3 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Put your products in front of more buyers.</h3><p className="mt-2 text-sm leading-6 text-brand-text-secondary">Premium unlocks public marketplace publishing and lowers your marketplace selling fee from 6% to 3%. Private links stay free.</p></div>{active&&<div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-500"><ShieldCheck className="mb-2" size={20}/><p>Premium active</p><p className="mt-1 text-xs font-medium">Until {expires!.toLocaleDateString()}</p></div>}</div>
    {!active && <div className="mt-7 grid gap-3 md:grid-cols-2"><PlanCard title="Monthly" price="₦1,500" note="Billed once every month · no automatic renewal" busy={busy==='monthly'} onClick={()=>void activate('monthly')} /><PlanCard title="Yearly" price="₦13,500" note="12 months · save ₦4,500 compared with monthly" featured busy={busy==='yearly'} onClick={()=>void activate('yearly')} /></div>}
    <div className="mt-7 rounded-2xl border border-brand-border bg-brand-bg/50 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><HardDrive size={18} className="text-brand-accent"/><h4 className="font-black">Seller storage</h4></div><p className="mt-1 text-xs leading-5 text-brand-text-secondary">{storageCopy}</p></div><span className="rounded-full bg-brand-accent/10 px-3 py-1.5 text-xs font-black text-brand-accent">{storageGb}GB · {naira(storagePrice)}</span></div><input aria-label="Storage capacity in gigabytes" type="range" min="1" max="10" step="1" value={storageGb} onChange={event=>setStorageGb(Number(event.target.value))} className="mt-5 w-full accent-brand-accent"/><div className="mt-2 flex justify-between text-[10px] font-bold text-brand-text-secondary"><span>1GB included</span><span>10GB</span></div><button onClick={()=>void activateStorage()} disabled={busy!=='' || storageGb <= 3} className="btn-primary mt-5 h-11 px-5 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50">{busy==='storage'?'Upgrading…':storageGb <= 3?'Included storage covers this':'Upgrade to ' + storageGb + 'GB for ' + naira(storagePrice)}</button></div>
    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-bold text-brand-text-secondary"><span className="inline-flex items-center gap-1"><Check size={13} className="text-emerald-500"/> Courses and comics welcome</span><span className="inline-flex items-center gap-1"><Check size={13} className="text-emerald-500"/> Wallet payment</span><span className="inline-flex items-center gap-1"><Check size={13} className="text-emerald-500"/> No automatic renewal</span></div>
  </section>;
}

function PlanCard({ title, price, note, featured, busy, onClick }: { title: string; price: string; note: string; featured?: boolean; busy: boolean; onClick: () => void }) {
  return <article className={`relative rounded-2xl border p-5 ${featured ? 'border-brand-accent bg-brand-accent/[.08]' : 'border-brand-border bg-brand-bg/40'}`}>{featured&&<span className="absolute right-4 top-4 rounded-full bg-brand-accent px-2 py-1 text-[9px] font-black uppercase text-white">Best value</span>}<p className="text-xs font-black uppercase tracking-wider text-brand-text-secondary">{title}</p><p className="mt-2 text-3xl font-black">{price}<span className="text-sm text-brand-text-secondary">/{title==='Yearly'?'year':'month'}</span></p><p className="mt-2 text-xs text-brand-text-secondary">{note}</p><button onClick={onClick} disabled={busy} className="btn-primary mt-5 h-11 w-full text-xs font-black disabled:opacity-50">{busy?'Activating…':'Choose ' + title}</button></article>;
}
