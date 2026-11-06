import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Check, Crown, Gift, HardDrive, RefreshCw, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { marketplaceAttempt, clearMarketplaceAttempt } from '../../utils/marketplaceAttempt.js';

const naira = (value: number) => `₦${value.toLocaleString('en-NG')}`;

export default function SellerPremiumPlan({ seller, onComplete }: { seller: any; onComplete: (kind: 'plan' | 'storage') => Promise<void> }) {
  const { userId, getToken } = useAuth();
  const [busy, setBusy] = useState('');
  const [storageGb, setStorageGb] = useState(10);
  const [autoRenew, setAutoRenew] = useState(seller?.premium_auto_renew === true);
  const expires = seller?.public_plan_expires_at ? new Date(seller.public_plan_expires_at) : null;
  const active = seller?.public_selling_enabled && expires && expires.getTime() > Date.now();
  const storagePrice = storageGb * (active ? 250 : 350);
  const storageCopy = useMemo(() => active ? 'Premium storage is ₦250 per GB — ₦2,500 for 10GB.' : 'Every seller gets 3GB included. Upgrade up to 10GB at ₦350 per GB — ₦3,500 for 10GB.', [active]);
  const trialAvailable = seller?.premium_features_ready !== false && !seller?.premium_trial_claimed_at;

  useEffect(() => { setAutoRenew(seller?.premium_auto_renew === true); }, [seller?.premium_auto_renew]);

  const activate = async (planCode: 'monthly' | 'yearly') => {
    if (!userId || busy || !window.confirm(`Pay ${planCode === 'yearly' ? '₦13,500 for one year' : '₦1,500 for one month'} from your Plugsy Wallet?${autoRenew ? ' It will renew automatically from your Wallet until you switch renewal off.' : ''}`)) return;
    setBusy(planCode);
    try {
      const key = marketplaceAttempt(localStorage, userId, `seller-premium-${planCode}`);
      const token = await getToken();
      const response = await fetch('/api/marketplace?action=activate-premium', { method: 'POST', headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: key, planCode, autoRenew, acceptedTermsVersion: 'marketplace-premium-v1' }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Plan activation failed.');
      clearMarketplaceAttempt(localStorage, userId, `seller-premium-${planCode}`); toast.success('Premium is active. Verify your identity to publish publicly.'); await onComplete('plan');
    } catch (error: any) { toast.error(error.message || 'Plan activation failed.'); } finally { setBusy(''); }
  };

  const startTrial = async () => {
    if (!userId || busy || !window.confirm('Start your free Premium month? After the free month, ₦1,500 will be deducted monthly from your Plugsy Wallet unless you switch auto-renewal off.')) return;
    setBusy('trial');
    try {
      const token = await getToken();
      const response = await fetch('/api/marketplace?action=start-premium-trial', { method: 'POST', headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ acceptedTermsVersion: 'marketplace-premium-v1', acceptedAutoRenew: true }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'The free month could not be started.');
      setAutoRenew(true);
      toast.success('Your free Premium month is active.');
      await onComplete('plan');
    } catch (error: any) { toast.error(error.message || 'The free month could not be started.'); } finally { setBusy(''); }
  };

  const updateAutoRenew = async (enabled: boolean) => {
    if (!userId || busy) return;
    setBusy('renewal');
    try {
      const token = await getToken();
      const response = await fetch('/api/marketplace?action=set-premium-auto-renew', { method: 'POST', headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, planCode: seller?.premium_plan_code || 'monthly' }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Automatic renewal could not be updated.');
      setAutoRenew(enabled);
      toast.success(enabled ? 'Automatic renewal is on.' : 'Automatic renewal is off. Your current Premium time remains active.');
      await onComplete('plan');
    } catch (error: any) { toast.error(error.message || 'Automatic renewal could not be updated.'); } finally { setBusy(''); }
  };

  const activateStorage = async () => {
    if (!userId || busy || !window.confirm(`Upgrade your seller storage to ${storageGb}GB for ${naira(storagePrice)}?`)) return;
    setBusy('storage');
    try {
      const key = marketplaceAttempt(localStorage, userId, `seller-storage-${storageGb}`); const token = await getToken();
      const response = await fetch('/api/marketplace?action=activate-storage', { method: 'POST', headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: key, capacityGb: storageGb }) });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Storage upgrade failed.');
      clearMarketplaceAttempt(localStorage, userId, `seller-storage-${storageGb}`); toast.success(`Storage upgraded to ${result.plan.capacity_gb}GB.`); await onComplete('storage');
    } catch (error: any) { toast.error(error.message || 'Storage upgrade failed.'); } finally { setBusy(''); }
  };

  return <section className="mx-auto mt-6 max-w-7xl overflow-hidden rounded-3xl border border-brand-accent/30 bg-gradient-to-br from-brand-accent/[.16] via-brand-surface to-brand-surface p-6 shadow-[0_20px_70px_rgba(22,119,255,.12)] sm:p-8">
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between"><div className="max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full bg-brand-accent px-3 py-1.5 text-[10px] font-black uppercase tracking-[.16em] text-white"><Crown size={13}/> Go Premium</span><h3 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Put your products in front of more buyers.</h3><p className="mt-2 text-sm leading-6 text-brand-text-secondary">Premium unlocks public marketplace publishing and lowers your marketplace selling fee from 6% to 3%. Private links stay free.</p></div>{active&&<div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-500"><ShieldCheck className="mb-2" size={20}/><p>Premium active</p><p className="mt-1 text-xs font-medium">Until {expires!.toLocaleDateString()}</p></div>}</div>
    {!active && trialAvailable && <div className="mt-7 rounded-2xl border border-emerald-500/30 bg-emerald-500/[.08] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-500"><Gift size={20}/></span><div><h4 className="font-black">Your first month is free</h4><p className="mt-1 max-w-xl text-xs leading-5 text-brand-text-secondary">For first-time sellers only. Premium renews at ₦1,500 monthly from your Plugsy Wallet after the free month. You can switch renewal off anytime.</p></div></div><button onClick={()=>void startTrial()} disabled={busy!==''} className="btn-primary h-11 shrink-0 px-5 text-xs font-black disabled:opacity-50">{busy==='trial'?'Starting…':'Start free month'}</button></div></div>}
    {!active && <>{seller?.premium_features_ready !== false && <label className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-brand-border bg-brand-bg/40 p-4"><span><strong className="block text-sm">Automatically renew paid plans</strong><small className="mt-1 block text-brand-text-secondary">Deduct the next plan payment from your Plugsy Wallet when it expires.</small></span><input type="checkbox" checked={autoRenew} onChange={event=>setAutoRenew(event.target.checked)} className="h-5 w-5 accent-brand-accent" /></label>}<div className="mt-3 grid gap-3 md:grid-cols-2"><PlanCard title="Monthly" price="₦1,500" note={autoRenew?'Renews monthly from your Wallet':'One month · renewal is off'} busy={busy==='monthly'} onClick={()=>void activate('monthly')} /><PlanCard title="Yearly" price="₦13,500" note={autoRenew?'Renews yearly from your Wallet':'12 months · renewal is off'} featured busy={busy==='yearly'} onClick={()=>void activate('yearly')} /></div></>}
    {active && seller?.premium_features_ready !== false && <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-brand-border bg-brand-bg/50 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><RefreshCw size={18} className="mt-0.5 shrink-0 text-brand-accent"/><div><h4 className="font-black">Automatic renewal</h4><p className="mt-1 text-xs leading-5 text-brand-text-secondary">{autoRenew ? `On · ${seller?.premium_plan_code === 'yearly' ? '₦13,500 yearly' : '₦1,500 monthly'} will be taken from your Wallet when due.` : 'Off · Premium will stop at the expiry date unless you renew manually.'}</p>{seller?.premium_renewal_failure&&<p className="mt-1 text-xs font-bold text-amber-500">Last renewal could not complete because the Wallet balance was too low.</p>}</div></div><button onClick={()=>void updateAutoRenew(!autoRenew)} disabled={busy!==''} className={`h-11 shrink-0 rounded-xl px-5 text-xs font-black ${autoRenew?'border border-brand-border':'bg-brand-accent text-white'}`}>{busy==='renewal'?'Saving…':autoRenew?'Turn off':'Turn on'}</button></div>}
    <div className="mt-7 rounded-2xl border border-brand-border bg-brand-bg/50 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><HardDrive size={18} className="text-brand-accent"/><h4 className="font-black">Seller storage</h4></div><p className="mt-1 text-xs leading-5 text-brand-text-secondary">{storageCopy}</p></div><span className="rounded-full bg-brand-accent/10 px-3 py-1.5 text-xs font-black text-brand-accent">{storageGb}GB · {naira(storagePrice)}</span></div><input aria-label="Storage capacity in gigabytes" type="range" min="1" max="10" step="1" value={storageGb} onChange={event=>setStorageGb(Number(event.target.value))} className="mt-5 w-full accent-brand-accent"/><div className="mt-2 flex justify-between text-[10px] font-bold text-brand-text-secondary"><span>1GB included</span><span>10GB</span></div><button onClick={()=>void activateStorage()} disabled={busy!=='' || storageGb <= 3} className="btn-primary mt-5 h-11 px-5 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50">{busy==='storage'?'Upgrading…':storageGb <= 3?'Included storage covers this':'Upgrade to ' + storageGb + 'GB for ' + naira(storagePrice)}</button></div>
    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-bold text-brand-text-secondary"><span className="inline-flex items-center gap-1"><Check size={13} className="text-emerald-500"/> Courses and comics welcome</span><span className="inline-flex items-center gap-1"><Check size={13} className="text-emerald-500"/> Wallet payment</span><span className="inline-flex items-center gap-1"><Check size={13} className="text-emerald-500"/> Renewal control stays with you</span></div>
  </section>;
}

function PlanCard({ title, price, note, featured, busy, onClick }: { title: string; price: string; note: string; featured?: boolean; busy: boolean; onClick: () => void }) {
  return <article className={`relative rounded-2xl border p-5 ${featured ? 'border-brand-accent bg-brand-accent/[.08]' : 'border-brand-border bg-brand-bg/40'}`}>{featured&&<span className="absolute right-4 top-4 rounded-full bg-brand-accent px-2 py-1 text-[9px] font-black uppercase text-white">Best value</span>}<p className="text-xs font-black uppercase tracking-wider text-brand-text-secondary">{title}</p><p className="mt-2 text-3xl font-black">{price}<span className="text-sm text-brand-text-secondary">/{title==='Yearly'?'year':'month'}</span></p><p className="mt-2 text-xs text-brand-text-secondary">{note}</p><button onClick={onClick} disabled={busy} className="btn-primary mt-5 h-11 w-full text-xs font-black disabled:opacity-50">{busy?'Activating…':'Choose ' + title}</button></article>;
}
