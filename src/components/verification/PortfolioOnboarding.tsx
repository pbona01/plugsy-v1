import { LiquidGlass } from "../ui/LiquidGlass";
import React, { useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { ThemePicker } from "./ThemePicker";
import { FontPicker } from "./FontPicker";

export function PortfolioOnboarding({ 
  categoryId, 
  onComplete, 
  onBack 
}: { 
  categoryId: string, 
  onComplete: (portfolioId: string) => void,
  onBack: () => void 
}) {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    full_name: user?.fullName || "",
    tagline: "",
    color_theme: "classic",
    font_pairing: "A",
    bio_type: "text" as "text" | "video" | "graphic",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const baseSlug = (formData.full_name || 'user').toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + categoryId.split("_")[0];
      let slug = baseSlug;
      let counter = 1;
      while (true) {
        const { data: s } = await supabase.from('vp_portfolios').select('id').eq('slug', slug).maybeSingle();
        if (!s) break;
        slug = baseSlug + "-" + counter;
        counter++;
      }

      const { data: portfolio, error: insertError } = await supabase
        .from("vp_portfolios")
        .insert({
          user_id: user.id,
          user_email: user.primaryEmailAddress?.emailAddress,
          full_name: formData.full_name.trim(),
          tagline: formData.tagline.trim(),
          category: categoryId,
          status: "draft",
          is_paid: true,
          color_theme: formData.color_theme,
          font_pairing: formData.font_pairing,
          bio_type: formData.bio_type,
          slug: slug
        })
        .select()
        .single();

      if (insertError) throw insertError;
      
      onComplete(portfolio.id);
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('security policy') || err.code === '42501') {
        setError("Database Permission Error. Please execute the SQL script to bypass Row Level Security in your Supabase dashboard.");
      } else {
        setError(err.message || "Something went wrong.");
      }
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto shadow-sm rounded-2xl overflow-hidden border border-gray-200" style={{ backgroundColor: "#FAFAFA" }}>
      <div className="p-6 border-b border-gray-200 flex items-center justify-between bg-white">
        <button onClick={onBack} className="text-gray-500 hover:text-black flex items-center gap-2 font-medium transition">
          <ArrowLeft size={18} /> Back to Categories
        </button>
        <span className="text-sm font-bold tracking-widest text-gray-400 uppercase">Step 2 of 2</span>
      </div>

      <form onSubmit={handleSubmit} className="p-8 md:p-12">
        <h2 className="text-4xl font-serif text-gray-900 mb-6">Initialize Portfolio</h2>
        <div className="w-16 h-0.5 bg-[#EF4444] mb-10"></div>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 mb-8 text-sm font-bold">
            {error}
          </div>
        )}

        <div className="space-y-8">
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-3 tracking-wide">FULL NAME</label>
            <input 
              required
              type="text" 
              value={formData.full_name}
              onChange={(e) => setFormData(p => ({ ...p, full_name: e.target.value }))}
              placeholder="e.g. Jane Doe"
              className="w-full bg-white border-2 border-gray-200 rounded-xl p-4 focus:border-[#EF4444] focus:ring-0 outline-none transition text-gray-900 font-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-900 mb-3 tracking-wide">TAGLINE (Optional)</label>
            <input 
              type="text" 
              value={formData.tagline}
              onChange={(e) => setFormData(p => ({ ...p, tagline: e.target.value }))}
              placeholder="e.g. Crafting cinematic stories for tech brands"
              className="w-full bg-white border-2 border-gray-200 rounded-xl p-4 focus:border-[#EF4444] focus:ring-0 outline-none transition text-gray-900 font-medium"
            />
          </div>

          <div className="h-px bg-gray-200 w-full"></div>

          <ThemePicker 
            value={formData.color_theme} 
            onChange={(v) => setFormData(p => ({ ...p, color_theme: v }))} 
          />

          <div className="h-px bg-gray-200 w-full"></div>

          <FontPicker 
            value={formData.font_pairing} 
            onChange={(v) => setFormData(p => ({ ...p, font_pairing: v }))} 
          />

          <div className="h-px bg-gray-200 w-full"></div>

          <div>
             <label className="block text-sm font-bold text-gray-900 mb-4 tracking-wide">PREFERRED BIO FORMAT</label>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { value: 'text', label: 'Written Text', desc: 'A classic professional summary' },
                  { value: 'video', label: 'Intro Video', desc: 'A short YouTube embed' },
                  { value: 'graphic', label: 'Custom Graphic', desc: 'A high-res image or resume' }
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, bio_type: opt.value as any }))}
                    className={`p-4 border-2 rounded-xl text-left transition ${formData.bio_type === opt.value ? 'border-[#EF4444] bg-white shadow-sm' : 'border-gray-200 bg-transparent hover:border-gray-300'}`}
                  >
                     <div className={`font-bold mb-1 ${formData.bio_type === opt.value ? 'text-[#EF4444]' : 'text-gray-900'}`}>{opt.label}</div>
                     <div className="text-xs text-gray-500 font-medium">{opt.desc}</div>
                  </button>
                ))}
             </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 flex justify-end">
          <LiquidGlass 
            button chromaticAberration={2}
            type="submit"
            disabled={loading}
            className="bg-black text-white px-8 py-4 rounded-xl font-bold tracking-wide hover:bg-gray-800 transition shadow-lg flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : null}
            {loading ? 'INITIALIZING...' : 'CREATE PORTFOLIO'}
          </LiquidGlass>
        </div>
      </form>
    </div>
  );
}
