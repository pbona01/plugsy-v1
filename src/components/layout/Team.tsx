import React from 'react';
import { Twitter } from 'lucide-react';
import { motion } from 'motion/react';

export default function Team() {
  return (
    <section className="py-32 bg-brand-bg">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <h2 className="text-6xl md:text-8xl font-normal mb-16 text-center tracking-tight uppercase font-display leading-none">
          The Minds <span className="text-brand-accent">Behind Plugsy</span>
        </h2>
        
        <div className="max-w-md mx-auto card-premium p-10 text-center flex flex-col items-center">
          <div className="w-24 h-24 rounded-full bg-brand-accent/20 mb-6 flex items-center justify-center text-3xl font-black">
            P
          </div>
          <h3 className="text-2xl font-black uppercase tracking-tighter mb-2">Pedro</h3>
          <p className="text-sm font-bold uppercase tracking-widest text-brand-accent mb-4">Founder & Lead Storyteller</p>
          <p className="text-brand-text-secondary mb-6 leading-relaxed">
            Committed to making premium digital tools affordable and accessible for all creators.
          </p>
          <a 
            href="https://x.com/pedrro_vx?s=21" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-12 h-12 rounded-full bg-brand-surface border border-brand-border flex items-center justify-center hover:bg-brand-accent hover:text-white transition-colors"
          >
            <Twitter size={20} />
          </a>
        </div>
      </div>
    </section>
  );
}
