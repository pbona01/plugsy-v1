import React, { useEffect, useState } from 'react';
import { Cookie, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';

const key = 'plugsy:marketplace:cookie-consent:v1';

export default function MarketplaceCookieConsent() {
  const [open, setOpen] = useState(false);
  useEffect(() => { try { const saved=JSON.parse(localStorage.getItem(key)||"null");setOpen(!saved||typeof saved.marketing!=="boolean"); } catch { setOpen(true); } }, []);
  const save = (analytics: boolean, marketing = false) => {
    try { localStorage.setItem(key, JSON.stringify({ essential: true, analytics, marketing, savedAt: new Date().toISOString() })); } catch {}
    window.dispatchEvent(new CustomEvent('plugsy-cookie-consent', { detail: { analytics, marketing } }));
    setOpen(false);
    toast.success(marketing ? 'Ad measurement enabled for Plugsy visits and purchases.' : analytics ? 'Plugsy analytics enabled.' : 'Only essential cookies will be used.');
  };
  if (!open) return <button type="button" onClick={()=>setOpen(true)} className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 z-[10000] flex items-center gap-2 rounded-full border border-brand-border bg-brand-surface/95 px-3 py-2 text-[10px] font-bold text-brand-text-secondary shadow-lg backdrop-blur-xl md:bottom-4" aria-label="Open cookie and ad measurement settings"><Cookie size={14}/>Cookie settings</button>;
  return <aside className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[10001] mx-auto max-w-2xl rounded-2xl border border-brand-border bg-brand-surface/95 p-5 text-brand-text shadow-2xl backdrop-blur-xl md:bottom-4" aria-label="Cookie choices">
    <button onClick={() => save(false)} className="absolute right-3 top-3 rounded-lg p-2 text-brand-text-secondary" aria-label="Use essential cookies only"><X size={16}/></button>
    <div className="flex gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-accent/10 text-brand-accent"><Cookie size={18}/></span><div><h2 className="font-black">Your cookie choice</h2><p className="mt-1 pr-6 text-xs leading-5 text-brand-text-secondary">Plugsy uses essential storage for secure sign-in, checkout retries and your preferences. Optional analytics helps us understand portfolio and marketplace visits. If you allow ad measurement, TikTok or Meta may receive consented campaign events such as a portfolio view, contact action or confirmed purchase.</p><Link to="/privacy" className="mt-2 inline-block text-xs font-bold text-brand-accent">Read privacy policy</Link></div></div>
    <div className="mt-4 flex flex-wrap justify-end gap-2"><button onClick={() => save(false)} className="rounded-xl border border-brand-border px-4 py-2 text-xs font-black">Essential only</button><button onClick={() => save(true)} className="rounded-xl border border-brand-border px-4 py-2 text-xs font-black">Allow analytics</button><button onClick={() => save(true,true)} className="btn-primary px-4 py-2 text-xs font-black">Allow ad measurement</button></div>
  </aside>;
}
