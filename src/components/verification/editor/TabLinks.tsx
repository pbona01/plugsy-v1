import React from 'react';
import { VPPortfolio } from '../../../types/verification';
import { Instagram, Twitter, Linkedin, Youtube, Github, Mail, Phone, X } from 'lucide-react';

interface LinkInputProps {
  icon: React.ComponentType<any>;
  label: string;
  dbKey: string;
  placeholder: string;
  portfolio: VPPortfolio;
  updatePortfolio: (u: any) => void;
}

function LinkInput({ icon: Icon, label, dbKey, placeholder, portfolio, updatePortfolio }: LinkInputProps) {
  const value = (portfolio as any)[dbKey] || '';
  return (
    <div className="mb-4">
      <label className="block text-brand-text-secondary text-[12px] uppercase tracking-wider mb-1.5 font-bold">{label}</label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#555]">
          <Icon size={18} />
        </div>
        <input 
          type="text" 
          value={value} 
          onChange={e => updatePortfolio({[dbKey]: e.target.value})} 
          placeholder={placeholder}
          className="w-full bg-brand-surface border border-brand-border text-brand-text rounded-lg p-3 pl-10 pr-10 focus:border-[#2563eb] outline-none transition"
        />
        {value && (
          <button onClick={() => updatePortfolio({[dbKey]: ''})} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-secondary hover:text-brand-text transition">
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export function TabLinks({ portfolio, updatePortfolio }: { portfolio: VPPortfolio, updatePortfolio: (u: any) => void }) {
  const isDesign = ['graphic_design', 'uiux_design', 'photography'].includes(portfolio.category);
  const isDev = ['web_development', 'ai_automation', 'cybersecurity'].includes(portfolio.category);
  const isVideo = ['video_editing'].includes(portfolio.category);

  return (
    <div className="space-y-8 fade-in">
      {/* CONTACT */}
      <div>
        <h3 className="text-brand-text text-sm font-semibold mb-4 border-b border-brand-border pb-2">CONTACT</h3>
        <LinkInput icon={Phone} label="WhatsApp Number" dbKey="whatsapp_number" placeholder="2348012345678 (with country code)" portfolio={portfolio} updatePortfolio={updatePortfolio} />
        <LinkInput icon={Mail} label="Email Address" dbKey="email_contact" placeholder="hello@example.com" portfolio={portfolio} updatePortfolio={updatePortfolio} />
      </div>

      {/* SOCIAL MEDIA */}
      <div>
        <h3 className="text-brand-text text-sm font-semibold mb-4 border-b border-brand-border pb-2">SOCIAL MEDIA</h3>
        <LinkInput icon={Instagram} label="Instagram" dbKey="instagram_url" placeholder="https://instagram.com/..." portfolio={portfolio} updatePortfolio={updatePortfolio} />
        <LinkInput icon={Twitter} label="Twitter / X" dbKey="twitter_url" placeholder="https://x.com/..." portfolio={portfolio} updatePortfolio={updatePortfolio} />
        <LinkInput icon={Linkedin} label="LinkedIn" dbKey="linkedin_url" placeholder="https://linkedin.com/in/..." portfolio={portfolio} updatePortfolio={updatePortfolio} />
        {/* TikTok is standard but no strict icon in lucide so we use a generic video or X? X is used for Twitter. We'll skip icon for TikTok or just use Youtube icon for now. Actually let's just make it simple */}
        <LinkInput icon={Youtube} label="TikTok" dbKey="tiktok_url" placeholder="https://tiktok.com/@..." portfolio={portfolio} updatePortfolio={updatePortfolio} />

        {isDesign && (
          <>
            <LinkInput icon={Instagram} label="Behance" dbKey="behance_url" placeholder="https://behance.net/..." portfolio={portfolio} updatePortfolio={updatePortfolio} />
            <LinkInput icon={Instagram} label="Dribbble" dbKey="dribbble_url" placeholder="https://dribbble.com/..." portfolio={portfolio} updatePortfolio={updatePortfolio} />
          </>
        )}

        {isDev && (
          <>
            <LinkInput icon={Github} label="GitHub" dbKey="github_url" placeholder="https://github.com/..." portfolio={portfolio} updatePortfolio={updatePortfolio} />
            <LinkInput icon={Linkedin} label="Website" dbKey="website_url" placeholder="https://yourwebsite.com" portfolio={portfolio} updatePortfolio={updatePortfolio} />
          </>
        )}

        {isVideo && (
          <LinkInput icon={Youtube} label="YouTube Channel" dbKey="youtube_url" placeholder="https://youtube.com/@..." portfolio={portfolio} updatePortfolio={updatePortfolio} />
        )}
      </div>
    </div>
  );
}
