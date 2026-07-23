import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { Instagram, Twitter, Users, Zap, Shield, Globe } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const teamMembers = [
  {
    name: 'Peter Akamu (Pedrro)',
    role: 'Founder',
    bio: 'The thinker behind the Plugsy blueprint. Pedrro is driven by a mission to solve real-world problems through innovation and creativity. He oversees branding, growth strategy, and the platform’s core mission of connecting value with accessibility.',
    image: 'https://i.postimg.cc/5tdKSQTM/IMG-20260511-WA0092.jpg', 
    twitter: 'https://x.com/pedrrovx?s=21',
  },
  {
    name: 'Emmanuel Joel',
    role: 'Co-Founder & Systems Strategist',
    bio: 'A problem-solving strategist dedicated to longevity. Emmanuel focuses on building sustainable systems and ensuring Plugsy operates with stability, a long-term vision, and measurable impact.',
    twitter: 'https://x.com/emmanuellljoel?s=21',
    image: 'https://i.postimg.cc/GmDX1rHv/IMG-1738.png', 
  },
  {
    name: 'Ogechi Akamu',
    role: 'Head of Content',
    bio: 'The creative engine of the brand. Ogechi leads the content team, ensuring that every interaction with Plugsy is engaging, consistent, and of the highest creative quality across all social platforms.',
    twitter: 'https://x.com/ogechiakamu?s=21',
    image: 'https://i.postimg.cc/hPzJCt5D/IMG-1739-JPG.jpg', 
  },
  {
    name: 'Judith Nlemobi',
    role: 'Customer Support & Experience',
    bio: 'The bridge between Plugsy and its users. Judith manages response systems to ensure that every user receives fast, smooth, and reliable assistance whenever they need a "plug."',
    twitter: 'https://x.com/NlemobiN',
    image: 'https://i.postimg.cc/15rp0tnD/IMG-1742.png', 
  },
  {
    name: 'Benedict Peter',
    role: 'Lead Developer',
    bio: 'The architect behind the screen. Benedict translates the Plugsy vision into scalable and seamless digital experiences, ensuring the platform remains fast, reliable, and continuously evolving to meet user needs.',
    image: 'https://i.postimg.cc/T2VqFqFr/file-000000007b9c71f48d6f507b8f8e001f.png',
    twitter: 'https://x.com/BonaPeter169777',
  }
];

export default function About() {
  useDocumentTitle('Plugsy - About');
  useEffect(() => {
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", "Smart, Lower the Cost, for All. Connect creators, students, and entrepreneurs with high-value services.");
    }
  }, []);

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 sm:px-8 max-w-7xl mx-auto">
      {/* About Section */}
      <section className="mb-24 mt-8 md:mt-12 text-center max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-text/5 border border-brand-border text-brand-text-secondary text-[10px] font-black uppercase tracking-widest mb-8"
        >
          <Globe size={14} className="text-brand-accent" />
          <span>The Plugsy Vision</span>
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl md:text-6xl lg:text-7xl font-normal tracking-tight uppercase font-display leading-[0.9] text-brand-text mb-8"
        >
          Trusted Access to <span className="text-brand-accent">Affordable</span> Premium Services.
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg md:text-xl text-brand-text-secondary font-medium tracking-tight leading-relaxed max-w-3xl mx-auto mb-16"
        >
          In a world where digital tools are essential for growth, pricing shouldn't be a barrier to entry. Plugsy is a smart, low-cost ecosystem built to connect creators, students, and entrepreneurs with the high-value services they need—without the "Premium Price" tax.
        </motion.p>

        {/* Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-8 rounded-3xl bg-brand-surface border border-brand-border hover:border-brand-accent/50 transition-colors group flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 rounded-full bg-brand-accent/10 flex items-center justify-center text-brand-accent mb-6 group-hover:scale-110 transition-transform">
              <Zap size={28} />
            </div>
            <h3 className="text-xl font-black uppercase tracking-tighter mb-4 text-brand-text">Smarter</h3>
            <p className="text-brand-text-secondary leading-relaxed text-sm">Strategic solutions for digital access.</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="p-8 rounded-3xl bg-brand-surface border border-brand-border hover:border-brand-accent/50 transition-colors group flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
              <Shield size={28} />
            </div>
            <h3 className="text-xl font-black uppercase tracking-tighter mb-4 text-brand-text">Lower Cost</h3>
            <p className="text-brand-text-secondary leading-relaxed text-sm">Premium value at a fraction of the market rate.</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="p-8 rounded-3xl bg-brand-surface border border-brand-border hover:border-brand-accent/50 transition-colors group flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 mb-6 group-hover:scale-110 transition-transform">
              <Users size={28} />
            </div>
            <h3 className="text-xl font-black uppercase tracking-tighter mb-4 text-brand-text">For All</h3>
            <p className="text-brand-text-secondary leading-relaxed text-sm">From the student in the hostel to the CEO in the office.</p>
          </motion.div>
        </div>
      </section>

      {/* Team Section */}
      <section className="mb-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-normal tracking-tight uppercase font-display mb-4 text-brand-text">Meet the <span className="text-brand-accent">Team</span></h2>
          <p className="text-brand-text-secondary max-w-2xl mx-auto">The Visionaries & Growth Leaders.</p>
        </div>

        <div className="flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {teamMembers.map((member, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="p-8 rounded-[40px] bg-brand-surface border border-brand-border transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,255,150,0.1)] hover:border-[#00ff96]/30 group text-center flex flex-col items-center relative overflow-hidden"
            >
              <div className="absolute top-0 right-[-20%] w-48 h-48 bg-[#0066ff]/20 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
              <div className="absolute bottom-0 left-[-20%] w-48 h-48 bg-[#00ff96]/10 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
              
              <div className="w-28 h-28 md:w-32 md:h-32 rounded-3xl overflow-hidden mb-6 border-2 border-brand-border group-hover:border-brand-accent transition-colors shrink-0">
                <img src={member.image} alt={member.name} className="w-full h-full object-cover transition-all duration-500" loading="lazy" />
              </div>
              
              <h3 className="text-xl font-medium tracking-wide text-brand-text mb-2 leading-relaxed">{member.name}</h3>
              <p className="text-[10px] font-black uppercase tracking-widest text-brand-accent mb-6">{member.role}</p>
              <p className="text-brand-text-secondary text-sm leading-relaxed mb-8 flex-1">
                {member.bio}
              </p>

              <div className="flex items-center gap-4 mt-auto">
                {member.twitter && (
                  <a href={member.twitter} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-brand-text/5 text-brand-text-secondary hover:text-white hover:bg-brand-accent transition-colors">
                    <Twitter size={16} />
                  </a>
                )}
              </div>
            </motion.div>
          ))}

          {/* Hidden Member Placeholder */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="p-8 rounded-[40px] bg-brand-surface/50 border border-brand-border border-dashed transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,255,100,0.1)] hover:border-green-500/30 group text-center flex flex-col items-center justify-center relative overflow-hidden min-h-[400px]"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            
            <div className="w-28 h-28 md:w-32 md:h-32 rounded-3xl overflow-hidden mb-6 border-2 border-brand-border border-dashed flex items-center justify-center shrink-0 bg-brand-text/5">
              <Users size={32} className="text-brand-text-secondary opacity-50" />
            </div>
            
            <h3 className="text-xl font-medium tracking-wide text-brand-text mb-2 opacity-50 leading-relaxed">Coming Soon</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary mb-4 opacity-50">New Plug Loading...</p>
          </motion.div>
        </div>
      </section>

      {/* Connected Channels & Moto */}
      <section className="text-center pt-16 border-t border-brand-border max-w-2xl mx-auto">
        <h3 className="text-2xl font-black uppercase tracking-tighter mb-8 text-brand-text">Connected Channels</h3>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-16">
          <a href="https://www.tiktok.com/@plugsyng?_r=1&_t=ZS-96H4C3wqQOz" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-8 py-4 rounded-full bg-brand-surface border border-brand-border hover:bg-[#000000] hover:text-white hover:border-[#00f2fe] transition-all group w-full sm:w-auto">
            <img src="https://i.postimg.cc/jjtSqKQN/download-removebg-preview.png" alt="TikTok" className="w-5 h-5 object-contain" loading="lazy" />
            <span className="font-bold tracking-tight">@plugsyng</span>
          </a>
          <a href="https://www.instagram.com/plugsyng?igsh=enlhdXhxZ2Y2OWQ%3D&utm_source=qr" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-8 py-4 rounded-full bg-brand-surface border border-brand-border hover:bg-gradient-to-tr hover:from-[#f09433] hover:via-[#dc2743] hover:to-[#bc1888] hover:text-white transition-all group w-full sm:w-auto">
            <Instagram size={20} className="text-brand-text group-hover:text-white" />
            <span className="font-bold tracking-tight">@plugsyng</span>
          </a>
        </div>

        <div className="pt-8">
          <p className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-brand-text opacity-90 font-display">
            Smart. Lower Cost. For All.
          </p>
        </div>
      </section>
    </div>
  );
}
