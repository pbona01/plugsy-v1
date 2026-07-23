import React from 'react';
import { THEMES } from '../../utils/verification';

export function ThemePicker({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  return (
    <div className="mb-8">
      <label className="block text-sm font-bold text-gray-900 mb-4">Choose Your Theme</label>
      <div className="flex flex-wrap gap-4">
        {Object.entries(THEMES).map(([key, theme]) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`w-12 h-12 rounded-full border-2 transition-all group relative ${value === key ? 'border-black scale-110 shadow-md' : 'border-transparent hover:scale-105 shadow-sm'}`}
            style={{ backgroundColor: theme.bg }}
          >
            <div className="absolute inset-0 rounded-full flex items-center justify-center">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.accent }}></div>
            </div>
            
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-gray-900 text-brand-bg text-[10px] uppercase font-bold px-2 py-1 rounded whitespace-nowrap pointer-events-none transition">
              {key}
            </div>
          </button>
        ))}
      </div>
      
      {/* Live Preview Box */}
      <div className="mt-6 p-6 rounded-xl border border-gray-100 shadow-sm transition-colors duration-300" 
           style={{ backgroundColor: THEMES[value as keyof typeof THEMES]?.bg, color: THEMES[value as keyof typeof THEMES]?.text }}>
        <h4 className="text-xl mb-2">Sample Heading Appearance</h4>
        <div className="w-12 h-0.5 mb-4" style={{ backgroundColor: THEMES[value as keyof typeof THEMES]?.accent }}></div>
        <p className="opacity-90 leading-relaxed text-sm">
          This is exactly how your background, text, and accent colors will look together. 
          Each theme is crafted to provide maximum contrast and a distinct personality.
        </p>
      </div>
    </div>
  );
}
