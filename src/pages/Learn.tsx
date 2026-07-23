import React from 'react';
import { motion } from 'motion/react';
import { GraduationCap, Stars, Sparkles, BookOpen, Video, Zap } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function Learn() {
  useDocumentTitle('Plugsy - Learn');
  const categories = [
    { icon: Video, title: 'Editing Masterclass', desc: 'Master the art of storytelling.' },
    { icon: Zap, title: 'Speed Ramping', desc: 'Control time in your videos.' },
    { icon: Sparkles, title: 'Color Grading', desc: 'Make your visuals pop.' }
  ];

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-32 space-y-24">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-[10px] font-black mb-8 uppercase tracking-widest rounded-full">
            <GraduationCap size={14} />
            <span>Learning Hub</span>
        </div>
        <h1 className="text-6xl md:text-9xl font-normal mb-8 tracking-tight uppercase font-display leading-[0.85]">Master your <br /><span className="text-brand-accent">Craft.</span></h1>
        <p className="text-xl md:text-2xl text-brand-text-secondary font-medium tracking-tight max-w-2xl leading-relaxed">
          Elite resources and step-by-step guides designed to transform you from a creator into a technical editor.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {categories.map((cat, i) => (
          <motion.div
            key={cat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="card-premium p-10 group hover:border-brand-accent/30"
          >
            <div className="w-14 h-14 rounded-2xl bg-brand-accent/5 flex items-center justify-center text-brand-accent mb-8 group-hover:scale-110 transition-transform">
              <cat.icon size={28} />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tighter mb-3">{cat.title}</h3>
            <p className="text-brand-text-secondary font-medium">{cat.desc}</p>
          </motion.div>
        ))}
      </div>

      <div className="liquid-glass p-12 md:p-20 border-brand-border border-dashed flex flex-col items-center justify-center text-center rounded-[4rem]">
         <div className="px-4 py-1.5 bg-brand-text/10 rounded-full text-[10px] font-black uppercase tracking-widest mb-8 text-brand-text-secondary flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-pulse"></div>
            Curriculum Provisioning
         </div>
         <h3 className="text-4xl md:text-6xl font-normal uppercase tracking-tight mb-6 font-display">Elite Training <span className="text-brand-accent">Incoming.</span></h3>
         <p className="text-brand-text-secondary text-xl font-medium max-w-xl mb-12 leading-relaxed">We are extracting the most effective editing secrets from world-class creators. Get ready for a game-changing learning experience.</p>
         
         <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-brand-surface border border-brand-border shadow-sm">
                <BookOpen size={20} className="text-brand-accent" />
                <span className="text-sm font-bold opacity-60 italic">Course: CapCut Mastery</span>
            </div>
            <div className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-brand-surface border border-brand-border shadow-sm">
                <Stars size={20} className="text-brand-accent" />
                <span className="text-sm font-bold opacity-60 italic">Coming May 2024</span>
            </div>
         </div>
      </div>
    </div>
  );
}
