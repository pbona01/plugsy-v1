import React, { useState, useEffect } from 'react';
import { VPPortfolio } from '../../../types/verification';
import { ScaleButton } from '../../PageTransition';
import { supabase } from '../../../lib/supabase';
import { showToast } from '../../Toast';

export function TabPublish({ portfolio, updatePortfolio }: { portfolio: VPPortfolio, updatePortfolio: (u: any) => void }) {
  const [slugInput, setSlugInput] = useState(portfolio.slug);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

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
    navigator.clipboard.writeText(`${window.location.origin}/vp/${portfolio.slug}`);
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
              {window.location.origin}/vp/{portfolio.slug}
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
            <a href={`https://wa.me/?text=Check out my portfolio: ${window.location.origin}/vp/${portfolio.slug}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-[#25D366] text-white border border-brand-border px-4 py-3 rounded-lg font-bold hover:bg-[#128C7E] transition text-center whitespace-nowrap shadow-md">
              💬 Share on WhatsApp
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
