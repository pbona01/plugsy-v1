import React from 'react';
import { Search } from 'lucide-react';

interface SearchChatProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchChat({ value, onChange, placeholder = "Search...", className }: SearchChatProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-2.5 text-white/30" size={14} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 bg-white/[0.02] border border-white/5 text-white rounded-xl text-xs focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-white/30"
      />
    </div>
  );
}

export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={index} className="bg-blue-500/30 text-white rounded-sm px-0.5">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}
