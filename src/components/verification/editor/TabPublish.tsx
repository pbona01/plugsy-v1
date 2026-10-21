import React, { useState, useEffect } from 'react';
import { VPPortfolio } from '../../../types/verification';
import { ScaleButton } from '../../PageTransition';
import { supabase } from '../../../lib/supabase';
import { showToast } from '../../Toast';
import { getSiteUrl } from '../../../lib/siteUrl';

type PublicProduct = NonNullable<VPPortfolio['public_products']>[number];
const cleanProducts = (value: VPPortfolio['public_products']) => Array.isArray(value) ? value : [];

export function TabPublish({ portfolio, updatePortfolio }: { portfolio: VPPortfolio, updatePortfolio: (u: any) => void }) {
  const [slugInput, setSlugInput] = useState(portfolio.slug);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const premiumAccess = portfolio.is_paid || portfolio.admin_granted === true;
  const publicProducts = cleanProducts(portfolio.public_products);
  const updatePublicProducts = (products: PublicProduct[]) => updatePortfolio({ public_products: products });

  useEffect(() => {
    if (slugInput === portfolio.slug) {
      setSlugAvailable(null);
      return;
    }
    const timer = setTimeout(async () => {
      if (!slugInput || slugInput.length < 3) {
        setSlugAvailable(false);
        return;
      }
      const { data } = await supabase.from('vp_portfolios').select('id').eq('slug', slugInput).neq('id', portfolio.id).maybeSingle();
      if (data) {
        setSlugAvailable(false);
      } else {
        setSlugAvailable(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [slugInput, portfolio.slug, portfolio.id]);

  const copyLink = () => {
    navigator.clipboard.writeText(getSiteUrl(`/vp/${portfolio.slug}`));
    showToast("Copied!", "success");
  };

  return (
    <div className="space-y-8 fade-in pb-12">
      {/* YOUR PORTFOLIO URL */}
      <div>
        <h3 className="text-brand-text text-sm font-semibold mb-4 border-b border-brand-border pb-2">YOUR PORTFOLIO URL</h3>
        <div className="bg-brand-surface border border-brand-border rounded-lg p-4 flex items-center justify-between">
          <div className="text-brand-text-secondary truncate flex-1 tracking-wide text-sm font-medium">
            plugsy.ng/vp/<span className="text-brand-text font-bold">{portfolio.slug}</span>
          </div>
          <button onClick={copyLink} className="bg-[#222] hover:bg-[#333] text-brand-text px-3 py-1.5 rounded-lg text-[12px] font-bold uppercase transition ml-4 shrink-0 border border-brand-border dark:border-[#444]">
            Copy Link
          </button>
        </div>
      </div>

      {/* CUSTOM URL SLUG */}
      <div>
        <h3 className="text-brand-text text-sm font-semibold mb-4 border-b border-brand-border pb-2">CUSTOM URL SLUG</h3>
        <div className="relative">
          <input 
            type="text" 
            value={slugInput} 
            onChange={e => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ''))}
            className="w-full bg-brand-surface border border-brand-border text-brand-text rounded-lg p-3 focus:border-[#2563eb] outline-none transition" 
          />
          {slugAvailable === true && <div className="text-[#22c55e] text-xs mt-2 font-bold flex items-center gap-1">✓ Available</div>}
          {slugAvailable === false && <div className="text-[#EF4444] text-xs mt-2 font-bold flex items-center gap-1">✗ Already taken</div>}
        </div>
        {slugAvailable === true && (
          <ScaleButton 
            onClick={() => updatePortfolio({slug: slugInput})} 
            className="mt-4 bg-[#2563eb] text-brand-text px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#1d4ed8]"
          >
            Save Slug
          </ScaleButton>
        )}
      </div>

      {/* PUBLIC PROFILE INTEGRATIONS */}
      <div className="rounded-xl border border-brand-border bg-gray-50 p-5 dark:bg-[#111]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-brand-text text-sm font-semibold">PUBLIC PROFILE INTEGRATIONS</h3>
            <p className="mt-1 text-xs leading-5 text-brand-text-secondary">These are never enabled automatically. Premium owners choose exactly what appears on their public portfolio.</p>
          </div>
          {!premiumAccess && <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-500">Premium only</span>}
        </div>
        <div className={`mt-4 rounded-lg border p-4 ${premiumAccess ? 'border-brand-border bg-brand-surface' : 'border-brand-border/60 opacity-60'}`}>
          <div className="flex items-center justify-between gap-3"><div><strong className="block text-sm text-brand-text">Products</strong><p className="mt-1 text-xs leading-5 text-brand-text-secondary">Add only product links you deliberately want visitors to see. For a private product, paste your private link yourself.</p></div><button type="button" disabled={!premiumAccess || publicProducts.length >= 12} onClick={() => updatePublicProducts([...publicProducts, { id: crypto.randomUUID(), title: '', description: '', url: '', enabled: true }])} className="shrink-0 rounded-lg bg-[#2563eb] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Add product</button></div>
          <div className="mt-4 space-y-3">{publicProducts.length === 0 ? <p className="rounded-lg border border-dashed border-brand-border p-3 text-xs text-brand-text-secondary">No products are visible on this portfolio.</p> : publicProducts.map((product, index) => <div key={product.id} className="space-y-2 rounded-lg border border-brand-border p-3"><div className="flex items-center justify-between"><label className="flex items-center gap-2 text-xs font-bold text-brand-text"><input type="checkbox" disabled={!premiumAccess} checked={product.enabled} onChange={(event) => updatePublicProducts(publicProducts.map((entry, itemIndex) => itemIndex === index ? { ...entry, enabled: event.target.checked } : entry))} className="h-4 w-4 accent-[#2563eb]" />Visible</label><button type="button" disabled={!premiumAccess} onClick={() => updatePublicProducts(publicProducts.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-bold text-red-500 disabled:opacity-40">Remove</button></div><input value={product.title} disabled={!premiumAccess} onChange={(event) => updatePublicProducts(publicProducts.map((entry, itemIndex) => itemIndex === index ? { ...entry, title: event.target.value } : entry))} maxLength={80} placeholder="Product name" className="w-full rounded-md border border-brand-border bg-brand-bg p-2 text-sm text-brand-text outline-none" /><input value={product.url} disabled={!premiumAccess} onChange={(event) => updatePublicProducts(publicProducts.map((entry, itemIndex) => itemIndex === index ? { ...entry, url: event.target.value } : entry))} maxLength={2048} placeholder="Product link" className="w-full rounded-md border border-brand-border bg-brand-bg p-2 text-sm text-brand-text outline-none" /><textarea value={product.description || ''} disabled={!premiumAccess} onChange={(event) => updatePublicProducts(publicProducts.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry))} maxLength={280} rows={2} placeholder="Short description (optional)" className="w-full resize-none rounded-md border border-brand-border bg-brand-bg p-2 text-sm text-brand-text outline-none" /></div>)}</div>
        </div>
      </div>

      {/* PUBLISH SECTION */}
      <div className="bg-gray-50 dark:bg-[#111] border border-brand-border rounded-xl p-6 text-center">
        {portfolio.status === 'draft' ? (
          <>
            <div className="inline-flex items-center gap-1.5 bg-[#333]/50 text-brand-text-secondary px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-4 border border-brand-border dark:border-[#444]">
              <div className="w-2 h-2 rounded-full bg-[#888]"></div> Draft
            </div>
            <p className="text-brand-text mb-6 font-medium">Your portfolio is not visible to the public</p>
            <ScaleButton onClick={() => updatePortfolio({status: 'published'})} className="bg-[#22c55e] text-brand-text px-6 py-3 rounded-lg font-bold hover:bg-[#16a34a] transition">Publish Portfolio</ScaleButton>
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-1.5 bg-[#052e16] text-[#22c55e] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-4 border border-[#22c55e]/30">
              <div className="w-2 h-2 rounded-full bg-[#22c55e]"></div> Live
            </div>
            <p className="text-brand-text mb-6 font-medium">Your portfolio is live and visible to clients</p>
            
            <div className="bg-brand-surface border border-brand-border p-3 rounded-lg mb-6 text-[#60a5fa] font-bold text-sm select-all">
              plugsy.ng/vp/{portfolio.slug}
            </div>

            <button onClick={() => updatePortfolio({status: 'draft'})} className="border border-[#EF4444] text-[#EF4444] px-6 py-3 rounded-lg font-bold hover:bg-[#EF4444]/10 transition">Unpublish</button>
          </>
        )}
      </div>

      {/* SHARE SECTION */}
      {portfolio.status === 'published' && (
        <div className="pt-4">
          <h3 className="text-brand-text text-sm font-semibold mb-4 border-b border-brand-border pb-2">SHARE YOUR PORTFOLIO</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button onClick={copyLink} className="flex items-center justify-center gap-2 bg-brand-surface text-brand-text border border-brand-border px-4 py-3 rounded-lg font-bold hover:bg-[#222] transition text-center whitespace-nowrap">
              📋 Copy Link
            </button>
            <a href={`/vp/${portfolio.slug}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-[#2563eb] text-white border border-brand-border px-4 py-3 rounded-lg font-bold hover:bg-[#1d4ed8] transition text-center whitespace-nowrap shadow-md">
              👁 Preview Live
            </a>
            <a href={`https://wa.me/?text=Check out my portfolio: ${getSiteUrl(`/vp/${portfolio.slug}`)}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-[#25D366] text-white border border-brand-border px-4 py-3 rounded-lg font-bold hover:bg-[#128C7E] transition text-center whitespace-nowrap shadow-md">
              💬 Share on WhatsApp
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
