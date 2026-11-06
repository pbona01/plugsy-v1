import { LiquidGlass } from "../components/ui/LiquidGlass";
import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, ShoppingBag, Briefcase, Award, Link2, Wallet, MessageCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { PortfolioSecretAccess } from '../components/ui/PortfolioSecretAccess';
import { Helmet } from 'react-helmet-async';

const FAQItem: React.FC<{ faq: { q: string, a: string } }> = ({ faq }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  return (
    <div className="card-premium p-6 cursor-pointer hover:border-brand-accent/20 transition-colors" onClick={() => setIsOpen(!isOpen)}>
      <div className="flex justify-between items-center">
          <h4 className="text-lg font-black uppercase tracking-tighter">{faq.q}</h4>
          <span className="text-brand-accent text-2xl">{isOpen ? '−' : '+'}</span>
      </div>
      {isOpen && <p className="text-brand-text-secondary font-medium tracking-tight leading-relaxed mt-4 pt-4 border-t border-brand-border">{faq.a}</p>}
    </div>
  );
};

export default function Home() {
  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  return (
    <div className="flex flex-col w-full overflow-hidden">
      <Helmet>
        <title>Plugsy | smart, low cost &amp; for all.</title>
        <meta name="description" content="Simple digital solution built around what you actually need." />
      </Helmet>
      
      {/* Hero Section */}
      <section className="relative pt-24 pb-16 md:pt-40 md:pb-32 px-4 lg:px-8">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full -z-10 bg-[radial-gradient(circle_at_top,_var(--color-brand-accent)_0%,_transparent_50%)] opacity-10 dark:opacity-20" />
        
        <div className="max-w-7xl mx-auto text-center flex flex-col items-center">
          
          <motion.div 
            className="max-w-4xl flex flex-col items-center"
            initial="hidden"
            animate="visible"
            variants={staggerContainer}>
                       <motion.h1 variants={fadeUp} className="font-bold tracking-[-0.04em] mb-10 md:mb-12 leading-[1.1] md:leading-[0.85] text-brand-text font-display">
              BUILT FOR WHAT <br className="hidden sm:block" />
              <span className="text-brand-text-secondary opacity-20">YOU ACTUALLY</span> <br className="hidden sm:block" />
              <span className="text-brand-accent">NEED.</span>
            </motion.h1>
            
            <motion.p variants={fadeUp} className="text-2xl md:text-3xl font-bold tracking-tight text-brand-text mb-6 max-w-3xl mx-auto leading-tight font-sans">
              Smart. Lower cost. For everyone.
            </motion.p>
            
            <motion.p variants={fadeUp} className="text-base md:text-lg text-brand-text-secondary mb-10 md:mb-12 leading-relaxed max-w-xl mx-auto font-medium">
              Sell digital products, build a trusted portfolio, and connect with clients in one clear workspace.
            </motion.p>
            
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row justify-center gap-4 mb-8 md:mb-12">
              <LiquidGlass component={Link} button chromaticAberration={2} to="/marketplace" className="btn-primary text-center flex items-center justify-center gap-2 text-base md:text-lg h-14 md:h-16 px-8 md:px-10">
                Explore Marketplace
              </LiquidGlass>
              <LiquidGlass component={Link} button chromaticAberration={2} to="/portfolio" className="btn-secondary text-center flex items-center justify-center gap-2 text-base md:text-lg h-14 md:h-16 px-8 md:px-10">
                Build Portfolio
              </LiquidGlass>
            </motion.div>
            
            <motion.div variants={fadeUp} className="flex items-center justify-center gap-3 text-brand-text-secondary/60 text-sm font-bold uppercase tracking-widest">
              <Shield size={20} className="text-brand-accent" />
              <span>Protected checkout. Verified sellers. Human support.</span>
            </motion.div>
          </motion.div>

        </div>
      </section>

      {/* Marketplace Catalog */}
      <section className="py-32 bg-brand-surface border-y border-brand-border">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center mb-24">
            <h2 className="font-bold mb-6 tracking-[-0.04em] uppercase font-display leading-[1.1] md:leading-[0.85] text-brand-text">
              Everything you need to <br className="hidden sm:block" /><span className="text-brand-accent">create and grow</span>
            </h2>
            <p className="text-xl text-brand-text-secondary font-medium max-w-2xl mx-auto">A practical home for digital products, portfolios, trusted profiles, and customer conversations.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Marketplace Card */}
            <div className="card-premium p-8 flex flex-col group hover:-translate-y-2 transition-all relative border-brand-accent/50 ring-1 ring-brand-accent/20">
                <div className="absolute top-4 right-4 bg-brand-accent text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg">
                    Popular
                </div>
                <div className="w-14 h-14 rounded-2xl bg-brand-accent/10 flex items-center justify-center mb-6">
                  <ShoppingBag size={28} className="text-brand-accent" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter mb-4">Digital Marketplace</h3>
                <p className="text-brand-text-secondary text-sm mb-8 flex-1">Buy and sell courses, eBooks, templates, guides, and other digital products.</p>
                <LiquidGlass component={Link} button chromaticAberration={2} to="/marketplace" className="btn-primary !py-3 text-center font-black uppercase tracking-widest text-[10px]">
                  Explore Products
                </LiquidGlass>
            </div>
            
            {/* Portfolio Card */}
            <div className="card-premium p-8 flex flex-col group hover:-translate-y-2 transition-all relative border-brand-accent/50 ring-1 ring-brand-accent/20">
                <div className="absolute top-4 right-4 bg-brand-accent text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg">
                    New
                </div>
                <div className="w-14 h-14 rounded-2xl bg-brand-accent/10 flex items-center justify-center mb-6">
                  <Briefcase size={28} className="text-brand-accent" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter mb-4">Plugsy Portfolio</h3>
                <p className="text-brand-text-secondary text-sm mb-8 flex-1">Build a clear, professional profile of your work effortlessly.</p>
                <div className="h-12 w-full">
                  <PortfolioSecretAccess>
                    <LiquidGlass component={Link} button chromaticAberration={2} to="/portfolio" className="btn-primary flex items-center justify-center w-full !py-3 text-center font-black uppercase tracking-widest text-[10px] h-full block">
                      View Portfolios
                    </LiquidGlass>
                  </PortfolioSecretAccess>
                </div>
            </div>
            
            {/* Medals Card */}
            <div className="card-premium p-8 flex flex-col group hover:-translate-y-2 transition-all border-brand-border">
                <div className="w-14 h-14 rounded-2xl bg-brand-accent/10 flex items-center justify-center mb-6">
                  <Award size={28} className="text-brand-accent" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter mb-4">Plugsy Medals</h3>
                <p className="text-brand-text-secondary text-sm mb-8 flex-1">Unlock creator benefits and savings with a verified Plugsy medal.</p>
                <LiquidGlass component={Link} button chromaticAberration={2} to="/medals" className="btn-secondary !py-3 text-center font-black uppercase tracking-widest text-[10px]">View Medals</LiquidGlass>
            </div>

            {/* One Link Card */}
            <div className="card-premium p-8 flex flex-col group hover:-translate-y-2 transition-all border-brand-border">
                <div className="w-14 h-14 rounded-2xl bg-brand-accent/10 flex items-center justify-center mb-6">
                  <Link2 size={28} className="text-brand-accent" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter mb-4">One Link</h3>
                <p className="text-brand-text-secondary text-sm mb-8 flex-1">Share your work, products, profiles, and contact points from one page.</p>
                <LiquidGlass component={Link} button chromaticAberration={2} to="/onelink" className="btn-secondary !py-3 text-center font-black uppercase tracking-widest text-[10px]">Create One Link</LiquidGlass>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-32">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
            <div>
              <h2 className="font-bold mb-8 tracking-[-0.04em] uppercase leading-[1.1] md:leading-[0.85] font-display text-brand-text">
                Built for <br className="hidden sm:block" /><span className="text-brand-accent">efficiency.</span>
              </h2>
              <p className="text-xl md:text-2xl text-brand-text-secondary mb-16 font-medium leading-relaxed">We stripped away the complexity to give you a clean, unified experience.</p>
              
              <div className="space-y-12">
                {[
                  { icon: ShoppingBag, title: 'Find what you need', desc: 'Browse seller-created courses, guides, templates, and digital resources.' },
                  { icon: Wallet, title: 'Pay securely', desc: 'Use protected checkout with clear pricing and a record of every purchase.' },
                  { icon: Shield, title: 'Keep access', desc: 'Purchased products stay in your library and seller updates appear automatically.' },
                  { icon: MessageCircle, title: 'Get support', desc: 'Reach Plugsy support through the same customer and admin chat experience.' },
                ].map((item, i) => (
                  <div key={i} className="flex gap-6 group">
                    <div className="w-16 h-16 rounded-[2rem] bg-brand-surface border border-brand-border flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <item.icon size={28} className="text-brand-accent" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black uppercase tracking-tighter mb-2">{item.title}</h4>
                      <p className="text-brand-text-secondary font-medium">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative">
              <div className="aspect-[4/5] bg-brand-surface rounded-[4rem] border border-brand-border p-1 dark:bg-[linear-gradient(to_bottom_right,_var(--color-brand-surface),_transparent)]">
                <div className="w-full h-full rounded-[3.8rem] bg-brand-surface p-12 flex flex-col justify-end relative overflow-hidden">
                  <div className="absolute top-12 left-12 right-12 bottom-32 card-premium p-8 flex flex-col bg-brand-bg shadow-2xl">
                    <div className="flex-1 flex flex-col justify-end space-y-6">
                      <div className="self-end bg-brand-accent text-white p-4 rounded-3xl rounded-tr-sm text-sm font-bold shadow-xl">
                        Digital product purchased
                      </div>
                      <div className="flex items-end gap-3">
                         <div className="w-8 h-8 rounded-full bg-brand-text/10 shrink-0"></div>
                         <div className="liquid-glass border border-brand-border p-4 rounded-3xl rounded-tl-sm text-sm font-bold text-brand-text-secondary">
                          Payment confirmed. Product added to your library.
                         </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-8 text-center text-[10px] font-black uppercase tracking-[0.4em] text-brand-text-secondary/40">
                    Proprietary Secure Sync
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-32 bg-brand-bg relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 bg-[radial-gradient(circle_at_bottom,_var(--color-brand-accent)_0%,_transparent_50%)] opacity-5" />
        <div className="max-w-4xl mx-auto px-4 lg:px-8">
          <h2 className="font-bold mb-16 text-center tracking-[-0.04em] uppercase font-display leading-[1.1] md:leading-[0.85] text-brand-text">
            THE <span className="text-brand-accent">DETAILS.</span>
          </h2>
          
          <div className="grid grid-cols-1 gap-6">
              {[
                { q: 'What can I buy on Plugsy?', a: 'Sellers can offer digital courses, eBooks, templates, guides, creator resources, and other approved digital products.' },
                { q: 'How are purchases delivered?', a: 'After successful payment, the product appears in My Library. Guest buyers receive a secure delivery link by email.' },
                { q: 'What is Marketplace Premium?', a: 'Marketplace Premium allows verified sellers to publish products publicly with lower marketplace fees. Sellers control whether their plan renews.' },
                { q: 'What is Plugsy Portfolio?', a: 'Plugsy Portfolio helps creators and professionals present their skills, projects, experience, and contact details to potential clients.' },
                { q: 'Are buyers protected?', a: 'Yes. Eligible Marketplace orders include a buyer-protection window before seller funds are released.' },
                { q: 'Can sellers update a product after purchase?', a: 'Yes. Buyers keep access to the seller’s latest product version, including updated files and course lessons.' },
                { q: 'How do I get help?', a: 'Open Plugsy Support or Chats from your dashboard. The customer and admin chat system remains available for account and purchase support.' },
              ].map((faq, i) => (
                <FAQItem key={i} faq={faq} />
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
