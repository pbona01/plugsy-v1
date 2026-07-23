import React, { useState } from 'react';
import { THEMES, FONT_PAIRINGS } from '../../../utils/verification';
import { VPPortfolio } from '../../../types/verification';
import { compressAndUpload } from '../../../utils/uploadMedia';
import { showToast } from '../../Toast';
import { SafeImage } from '../../SafeImage';
import { getCategoryConfig } from '../../../utils/categoryConfig';

export function TabIdentity({ portfolio, updatePortfolio }: { portfolio: VPPortfolio, updatePortfolio: (u: any) => void }) {
  const [uploadingGraphic, setUploadingGraphic] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showVideoSoon, setShowVideoSoon] = useState(false);

  const config = getCategoryConfig(portfolio.category);
  const hasVideoSupport = config?.videoEmbedEnabled || (config?.maxVideos && config.maxVideos > 0);

  const bioOptions = [
    { id: 'text', icon: '📝', label: 'Text' },
    ...(hasVideoSupport ? [{ id: 'video', icon: '🎥', label: 'Video' }] : []),
    { id: 'graphic', icon: '🖼', label: 'Graphic' }
  ];

  return (
    <div className="space-y-8 fade-in">
      {/* BASIC INFO */}
      <div>
        <h3 className="text-brand-text text-sm font-semibold mb-4 border-b border-brand-border pb-2">BASIC INFO</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-brand-text-secondary text-[12px] uppercase tracking-wider mb-1.5 font-bold">Full Name</label>
            <input 
              type="text" 
              value={portfolio.full_name} 
              onChange={e => updatePortfolio({full_name: e.target.value})} 
              className="w-full bg-brand-surface border border-brand-border text-brand-text rounded-lg p-3 focus:border-[#2563eb] outline-none transition" 
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-brand-text-secondary text-[12px] uppercase tracking-wider font-bold">Tagline</label>
              <span className="text-gray-400 dark:text-[#555] text-xs">{(portfolio.tagline || '').length}/80</span>
            </div>
            <input 
              type="text" 
              value={portfolio.tagline || ''} 
              onChange={e => updatePortfolio({tagline: e.target.value.substring(0, 80)})} 
              className="w-full bg-brand-surface border border-brand-border text-brand-text rounded-lg p-3 focus:border-[#2563eb] outline-none transition" 
            />
          </div>
          <div>
            <label className="block text-brand-text-secondary text-[12px] uppercase tracking-wider mb-1.5 font-bold">Location</label>
            <input 
              type="text" 
              value={portfolio.location || ''} 
              onChange={e => updatePortfolio({location: e.target.value})} 
              className="w-full bg-brand-surface border border-brand-border text-brand-text rounded-lg p-3 focus:border-[#2563eb] outline-none transition" 
            />
          </div>
          <div>
            <label className="block text-brand-text-secondary text-[12px] uppercase tracking-wider mb-1.5 font-bold">Years Experience</label>
            <input 
              type="number" 
              min="0"
              value={portfolio.years_experience || 0} 
              onChange={e => updatePortfolio({years_experience: parseInt(e.target.value) || 0})} 
              className="w-full bg-brand-surface border border-brand-border text-brand-text rounded-lg p-3 focus:border-[#2563eb] outline-none transition" 
            />
          </div>
          <div>
            <label className="block text-brand-text-secondary text-[12px] uppercase tracking-wider mb-1.5 font-bold">About Me / Long Bio</label>
            <textarea
              value={portfolio.bio_text || portfolio.longBio || ''}
              onChange={e => updatePortfolio({ bio_text: e.target.value, longBio: e.target.value })}
              className="w-full bg-brand-surface border border-brand-border text-brand-text rounded-lg p-3 min-h-[120px] focus:border-[#2563eb] outline-none transition"
              placeholder="A detailed description of your background, experience, and achievements..."
            />
          </div>
          <div className="pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <div className={`relative w-12 h-6 rounded-full transition-colors ${portfolio.available_for_hire ? 'bg-[#22c55e]' : 'bg-[#333]'}`}>
                <div className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-brand-bg transition-transform ${portfolio.available_for_hire ? 'translate-x-6' : 'translate-x-0'}`}></div>
              </div>
              <span className="text-brand-text-secondary text-[12px] uppercase tracking-wider font-bold">Available for hire</span>
              {portfolio.available_for_hire && (
                <span className="bg-[#052e16] text-[#22c55e] px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ml-auto">Open To Work</span>
              )}
            </label>
          </div>
        </div>
      </div>

      {/* YOUR INTRO (BIO) */}
      <div>
        <h3 className="text-brand-text text-sm font-semibold mb-4 border-b border-brand-border pb-2">YOUR INTRO (BIO)</h3>
        <div className="flex items-center gap-2 mb-4">
          {bioOptions.map(opt => {
            const isSelected = (showVideoSoon && opt.id === 'video') || (!showVideoSoon && portfolio.bio_type === opt.id);
            return (
            <button
              key={opt.id}
              onClick={() => {
                if (opt.id === 'video') {
                  setShowVideoSoon(true);
                } else {
                  setShowVideoSoon(false);
                  updatePortfolio({bio_type: opt.id as any});
                }
              }}
              className={`relative flex-1 flex items-center justify-center gap-2 py-2 px-3 border rounded-lg text-sm transition ${
                isSelected 
                  ? 'bg-[#2563eb] border-[#2563eb] text-white' 
                  : (opt as any).soon
                  ? 'bg-brand-surface border-brand-border text-gray-400 dark:text-[#666] opacity-70 cursor-not-allowed'
                  : 'bg-brand-surface border-brand-border text-brand-text-secondary hover:text-brand-text'
              }`}
            >
              <span>{opt.icon}</span> {opt.label}
              {(opt as any).soon && (
                <span className="absolute -top-2 -right-2 bg-gray-200 dark:bg-[#222] text-brand-text-secondary text-[9px] font-bold px-1.5 py-0.5 rounded border border-brand-border uppercase tracking-wider shadow-sm z-10 hidden sm:block">Soon</span>
              )}
            </button>
          )})}
        </div>

        {hasVideoSupport && (showVideoSoon || portfolio.bio_type === 'video') && (
          <div className="mb-6">
            <label className="block text-brand-text-secondary text-[12px] uppercase tracking-wider mb-2 font-bold">BIO INTRO VIDEO</label>
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "0.5px solid rgba(255,255,255,0.08)",
              borderRadius: "12px",
              padding: "32px 24px",
              textAlign: "center"
            }}>
              <div style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.04)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
                fontSize: "18px"
              }}>
                🔒
              </div>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                background: "rgba(255,255,255,0.04)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                borderRadius: "999px",
                padding: "3px 12px",
                marginBottom: "8px"
              }}>
                <span style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.25em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.3)"
                }}>
                  COMING SOON
                </span>
              </div>
              <p style={{
                color: "rgba(255,255,255,0.2)",
                fontSize: "12px",
                margin: 0,
                lineHeight: 1.5
              }}>
                Bio video upload launching soon
              </p>
            </div>
          </div>
        )}

        {(!showVideoSoon && portfolio.bio_type === 'graphic') && (
          <div className="mb-6">
            <label className="block text-brand-text-secondary text-[12px] uppercase tracking-wider mb-1.5 font-bold">Graphic Upload</label>
            <div className="bg-brand-surface border-2 border-dashed border-brand-border rounded-lg p-6 text-center text-brand-text relative hover:border-[#2563eb] transition-colors">
              {portfolio.bio_graphic_url || portfolio.bioImage ? (
                <div className="relative group">
                  <SafeImage src={portfolio.bio_graphic_url || portfolio.bioImage || undefined} className="w-full rounded-lg" alt="Bio graphic" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                    <button onClick={() => updatePortfolio({bio_graphic_url: '', bioImage: ''})} className="bg-red-500 text-brand-text px-4 py-2 rounded-lg text-sm font-bold">Remove</button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer w-full h-full">
                  <div className="text-2xl mb-2">🖼</div>
                  <span className="text-brand-text font-medium hover:text-[#2563eb] transition">
                    Upload Graphic Bio / Cover Photo
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={async e => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadingGraphic(true);
                      try {
                        const url = await compressAndUpload(e.target.files[0]);
                        updatePortfolio({bio_graphic_url: url, bioImage: url, bio_type: 'graphic'});
                      } catch (err: any) { showToast(err.message, "error"); }
                      setUploadingGraphic(false);
                    }
                  }} />
                  <p className="text-gray-400 dark:text-[#555] text-xs mt-1">Images auto-optimized for web</p>
                  {uploadingGraphic && <p className="text-blue-400 text-xs mt-2 animate-pulse">Uploading...</p>}
                </label>
              )}
            </div>
          </div>
        )}

        {/* ABOUT ME TEXT (always visible now) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div>
              <label className="text-brand-text-secondary text-[12px] uppercase tracking-wider font-bold">ABOUT ME TEXT</label>
              <p className="text-gray-400 dark:text-[#555] text-[10px] mt-0.5">Optional text shown below your main bio. Appears on your public portfolio.</p>
            </div>
            <span className="text-gray-400 dark:text-[#555] text-xs">{(portfolio.bio_text || '').length}/400</span>
          </div>
          <textarea
            value={portfolio.bio_text || ''}
            onChange={e => updatePortfolio({bio_text: e.target.value.substring(0, 400)})}
            className="w-full bg-brand-surface border border-brand-border text-brand-text rounded-lg p-3 min-h-[120px] focus:border-[#2563eb] outline-none transition mt-2"
            placeholder="Tell clients about your expertise..."
          />
        </div>
      </div>

      {/* PROFILE IMAGE */}
      <div>
        <h3 className="text-brand-text text-sm font-semibold mb-4 border-b border-brand-border pb-2">PROFILE IMAGE</h3>
        <div className="w-full">
           {portfolio.profile_image_url || portfolio.avatarUrl ? (
             <div className="bg-brand-surface border-2 border-dashed border-brand-border rounded-lg p-6 text-center flex flex-col items-center justify-center relative">
               <div className="relative group rounded-full">
                 <SafeImage 
                   src={portfolio.profile_image_url || portfolio.avatarUrl || undefined} 
                   alt="Profile" 
                   className="w-[80px] h-[80px] rounded-full border-2 border-brand-border object-cover overflow-hidden" 
                   style={{ objectPosition: portfolio.profile_image_position || "center 20%" }}
                 />
                 <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 rounded-full flex items-center justify-center transition">
                   <button onClick={() => updatePortfolio({profile_image_url: '', avatarUrl: ''})} className="text-red-400 text-xs font-bold">Remove</button>
                 </div>
               </div>
             </div>
           ) : (
             <label className="cursor-pointer bg-brand-surface border-2 border-dashed border-brand-border rounded-lg p-6 text-center flex flex-col items-center justify-center hover:border-[#2563eb] transition-colors w-full">
               <div className="text-2xl mb-2">👤</div>
               <span className="text-brand-text font-medium hover:text-[#2563eb] transition">
                 Upload Profile Photo / Avatar
               </span>
               <input type="file" accept="image/*" className="hidden" onChange={async e => {
                 if (e.target.files && e.target.files[0]) {
                   setUploadingAvatar(true);
                   try {
                     const url = await compressAndUpload(e.target.files[0]);
                     updatePortfolio({
                       profile_image_url: url,
                       avatarUrl: url
                     });
                   } catch (err: any) { showToast(err.message, "error"); }
                   setUploadingAvatar(false);
                 }
               }} />
               {uploadingAvatar && <p className="text-blue-400 text-xs mt-2 animate-pulse">Uploading...</p>}
             </label>
           )}
        </div>
        
        {/* IMAGE FOCUS */}
        <div className="mt-4">
          <label className="block text-brand-text-secondary text-[12px] uppercase tracking-wider mb-2 font-bold">IMAGE FOCUS</label>
          <div 
            className="flex p-1 rounded-xl w-fit border"
            style={{
              backgroundColor: "var(--brand-surface)",
              borderColor: "var(--brand-border)"
            }}
          >
            {[
              { label: 'Top', value: 'center 10%' },
              { label: 'Center', value: 'center 50%' },
              { label: 'Face', value: 'center 20%' },
              { label: 'Bottom', value: 'center 80%' }
            ].map(opt => {
              const currentPos = portfolio.profile_image_position || 'center 20%';
              const isActive = currentPos === opt.value;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => updatePortfolio({ profile_image_position: opt.value })}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold transition flex-1 sm:flex-none"
                  style={{
                    backgroundColor: isActive ? "var(--brand-card)" : "transparent",
                    color: isActive ? "var(--brand-text)" : "var(--brand-text-secondary)",
                    boxShadow: isActive ? "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)" : "none"
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* APPEARANCE */}
      <div>
        <h3 className="text-brand-text text-sm font-semibold mb-4 border-b border-brand-border pb-2">APPEARANCE</h3>
        
        <label className="block text-brand-text-secondary text-[12px] uppercase tracking-wider mb-2 font-bold">Public Theme</label>
        <div className="grid grid-cols-5 gap-3 mb-6">
           {Object.keys(THEMES).map(themeKey => {
             const t = THEMES[themeKey];
             const isSelected = portfolio.color_theme === themeKey;
             return (
               <button 
                 key={themeKey}
                 onClick={() => updatePortfolio({color_theme: themeKey})}
                 className={`w-10 h-10 rounded-full flex items-center justify-center transition transform hover:scale-110 relative group ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0a]' : ''}`}
                 style={{ backgroundColor: t.bg }}
                 title={themeKey}
               >
                 <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.accent }}></div>
                 <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-brand-text text-brand-surface text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none z-10 border border-[#333] capitalize">
                   {t.name || themeKey}
                 </div>
               </button>
             );
           })}
        </div>

        <label className="block text-brand-text-secondary text-[12px] uppercase tracking-wider mb-2 font-bold">Font Pairing</label>
        <div className="space-y-3">
           {Object.keys(FONT_PAIRINGS).map(fontKey => {
             const f = FONT_PAIRINGS[fontKey as keyof typeof FONT_PAIRINGS];
             const isSelected = portfolio.font_pairing === fontKey;
             return (
               <button
                 key={fontKey}
                 onClick={() => updatePortfolio({font_pairing: fontKey})}
                 className={`w-full text-left p-3 rounded-lg border transition ${isSelected ? 'bg-brand-surface border-[#2563eb]' : 'bg-brand-surface border-brand-border hover:border-brand-border dark:border-[#444]'}`}
               >
                 <div className="text-brand-text-secondary text-xs mb-1 font-sans">{f.label}</div>
                 <div className="text-brand-text text-lg" style={{ fontFamily: f.heading }}>{f.sample}</div>
               </button>
             );
           })}
        </div>
      </div>

    </div>
  );
}
