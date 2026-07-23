import { LiquidGlass } from "../components/ui/LiquidGlass";
import React from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { motion } from 'motion/react';
import { optimizeCloudinaryUrl } from '../lib/cloudinary';
import { Download, Lock, Image as ImageIcon, Sparkles, Filter, ShieldCheck, Stars, ArrowUpRight } from 'lucide-react';

const luts = [
  { id: 1, title: 'Urban Cinematic', category: 'Action', level: 'pro', count: '12 LUTs', image: 'https://picsum.photos/400/300auto=format&fit=crop&q=80&w=400' },
  { id: 2, title: 'Soft Film', category: 'Vintage', level: 'pro', count: '8 LUTs', image: 'https://picsum.photos/400/300auto=format&fit=crop&q=80&w=400' },
  { id: 3, title: 'Basics Starter', category: 'General', level: 'free', count: '2 LUTs', image: 'https://picsum.photos/400/300auto=format&fit=crop&q=80&w=400' },
  { id: 4, title: 'Desaturate Pro', category: 'Mood', level: 'pro', count: '15 LUTs', image: 'https://picsum.photos/400/300auto=format&fit=crop&q=80&w=400' },
];

export default function LUTs() {
  useDocumentTitle('Plugsy - LUT Library');
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex flex-col md:flex-row justify-between items-end gap-8 mb-16 border-b border-[var(--brand-border)] pb-12">
        <div className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/5 border border-blue-500/10 text-blue-500 text-[10px] uppercase font-bold tracking-widest mb-6"
          >
            <Sparkles className="w-4 h-4" />
            <span>Premium Color Grading</span>
          </motion.div>
          <h1 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight">Professional <span className="text-blue-500">LUT Packages.</span></h1>
          <p className="text-[var(--brand-text-secondary)] text-md font-medium leading-relaxed">Download professional grade LUTs used by top creators to get the cinematic look in seconds. Compatible with CapCut, Premiere Pro, and more.</p>
        </div>
        <div className="card-premium p-6 flex items-center gap-4 bg-[var(--brand-surface)]">
          <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
            <Stars className="w-5 h-5" />
          </div>
          <div className="text-left">
             <div className="text-xs font-bold font-mono">PRO STATUS</div>
             <div className="text-[var(--brand-text-secondary)] text-[10px] font-bold uppercase tracking-wider">Plan Unlocked</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {luts.map((lut, i) => (
          <motion.div
            key={lut.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="card-premium p-3 group cursor-pointer flex flex-col"
          >
            <div className="aspect-[4/3] rounded-2xl overflow-hidden mb-6 relative">
               <img 
                 src={optimizeCloudinaryUrl(lut.image)} 
                 loading="lazy"
                 alt={lut.title} 
                 className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-80" 
               />
               <div className="absolute inset-0 bg-gradient-to-t from-[var(--brand-surface)]/80 via-transparent to-transparent" />
               <div className="absolute bottom-4 left-4 right-4">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-blue-500 mb-1">{lut.category}</div>
                  <h3 className="text-lg font-bold text-[var(--brand-text)] tracking-tight uppercase tracking-tighter">{lut.title}</h3>
               </div>
            </div>

            <div className="px-3 pb-3 mt-auto">
               <div className="flex justify-between items-center mb-6 px-1">
                  <span className="text-[10px] text-[var(--brand-text-secondary)] font-bold uppercase tracking-wider">{lut.count}</span>
                  <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">{lut.level}</span>
               </div>
               <LiquidGlass button chromaticAberration={2} className="w-full btn-primary py-3 rounded-xl flex items-center justify-center gap-3 text-xs uppercase font-black transition-all">
                 <Download className="w-4 h-4" />
                 Download
               </LiquidGlass>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Access Info */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        className="mt-32 card-premium p-12 flex flex-col items-center text-center bg-[var(--brand-surface)]"
      >
         <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20 mb-8">
            <ShieldCheck className="w-7 h-7 text-blue-500" />
         </div>
         <h2 className="text-2xl font-bold mb-6 tracking-tight">Enterprise Asset Protection</h2>
         <p className="text-[var(--brand-text-secondary)] max-w-lg text-sm font-medium leading-relaxed mb-10">
           All creative assets are served via secure endpoints. High-speed download links are dynamically generated for accounts with active creator access plans.
         </p>
         <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-[var(--brand-text-secondary)]">
            <span className="px-4 py-1 rounded bg-[var(--brand-bg)] border border-[var(--brand-border)]">.CUBE</span>
            <span className="px-4 py-1 rounded bg-[var(--brand-bg)] border border-[var(--brand-border)]">.VLT</span>
            <span className="px-4 py-1 rounded bg-[var(--brand-bg)] border border-[var(--brand-border)]">.XMP</span>
         </div>
      </motion.div>
    </div>
  );
}
