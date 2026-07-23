import React from 'react';
import { FONT_PAIRINGS } from '../../utils/verification';

export function FontPicker({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  return (
    <div className="mb-8">
      <label className="block text-sm font-bold text-gray-900 mb-4">Typography</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(FONT_PAIRINGS).map(([key, pairing]) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`p-4 text-left border rounded-xl transition ${value === key ? 'border-black bg-gray-50 ring-1 ring-black' : 'border-gray-200 hover:border-gray-300 bg-brand-card'}`}
          >
            <div className="mb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">{pairing.label}</div>
            <div style={{ fontFamily: pairing.heading }} className="text-xl mb-2 text-gray-900">
              The quick brown fox
            </div>
            <div style={{ fontFamily: pairing.body }} className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
              Jumps over the lazy dog. A beautiful pairing for your professional presence.
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
