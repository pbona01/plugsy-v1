import { LiquidGlass } from "../components/ui/LiquidGlass";
import React, { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Shield, Clock, MousePointer2, RefreshCw, Video, Palette, Tv, Briefcase } from 'lucide-react';
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
  const [searchParams] = useSearchParams();

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
        <title>Plugsy</title>
        <meta name="description" content="Get premium access without the premium price. Plugsy provides smart, lower-cost access to CapCut Pro and other digital tools tailored for creators and students in the Nigerian market. Pay securely with Paystack for instant activation." />
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
              GET PREMIUM ACCESS <br className="hidden sm:block" />
              <span className="text-brand-text-secondary opacity-20">WITHOUT THE</span> <br className="hidden sm:block" />
              <span className="text-brand-accent">PREMIUM PRICE.</span>
            </motion.h1>
            
            <motion.p variants={fadeUp} className="text-2xl md:text-3xl font-bold tracking-tight text-brand-text mb-6 max-w-3xl mx-auto leading-tight font-sans">
              Smart. Lower cost. For everyone.
            </motion.p>
            
            <motion.p variants={fadeUp} className="text-base md:text-lg text-brand-text-secondary mb-10 md:mb-12 leading-relaxed max-w-xl mx-auto font-medium">
              The smartest way to plug into your favorite digital tools. Experience premium access with ease.
            </motion.p>
            
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row justify-center gap-4 mb-8 md:mb-12">
              <LiquidGlass component={Link} button chromaticAberration={2} to="/products" className="btn-primary text-center flex items-center justify-center gap-2 text-base md:text-lg h-14 md:h-16 px-8 md:px-10">
                Browse All Products
              </LiquidGlass>
              <LiquidGlass component={Link} button chromaticAberration={2} to="/#how-it-works" className="btn-secondary text-center flex items-center justify-center gap-2 text-base md:text-lg h-14 md:h-16 px-8 md:px-10">
                How it Works
              </LiquidGlass>
            </motion.div>
            
            <motion.div variants={fadeUp} className="flex items-center justify-center gap-3 text-brand-text-secondary/60 text-sm font-bold uppercase tracking-widest">
              <Shield size={20} className="text-brand-accent" />
              <span>Simple plans. Guided support. Easy renewal tracking.</span>
            </motion.div>
          </motion.div>

        </div>
      </section>

      {/* Marketplace Catalog */}
      <section className="py-32 bg-brand-surface border-y border-brand-border">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center mb-24">
            <h2 className="font-bold mb-6 tracking-[-0.04em] uppercase font-display leading-[1.1] md:leading-[0.85] text-brand-text">
              Premium Solutions for <br className="hidden sm:block" /><span className="text-brand-accent">Everyone</span>
            </h2>
            <p className="text-xl text-brand-text-secondary font-medium max-w-2xl mx-auto">Unlock premium capabilities for your personal projects, learning, and productivity.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* CapCut Card */}
            <div className="card-premium p-8 flex flex-col group hover:-translate-y-2 transition-all relative border-brand-accent/50 ring-1 ring-brand-accent/20">
                <div className="absolute top-4 right-4 bg-brand-accent text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg">
                    Popular
                </div>
                <div className="w-14 h-14 rounded-2xl bg-brand-accent/10 flex items-center justify-center mb-6">
                  <Video size={28} className="text-brand-accent" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter mb-4">CapCut Pro Max</h3>
                <p className="text-brand-text-secondary text-sm mb-8 flex-1">Advanced video editing tools, simplified.</p>
                <LiquidGlass component={Link} button chromaticAberration={2} to="/products" className="btn-primary !py-3 text-center font-black uppercase tracking-widest text-[10px]">
                  View Plans
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
            
            {/* Learn with Plugsy Card (Disabled) */}
            <div className="card-premium p-8 flex flex-col relative opacity-60 grayscale cursor-not-allowed border-brand-border">
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <span className="bg-brand-surface border border-brand-border text-brand-text font-black uppercase tracking-widest px-4 py-2 text-xs rounded-full">Coming Soon</span>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-brand-surface border border-brand-border flex items-center justify-center mb-6">
                  <Palette size={28} className="text-brand-text-secondary" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter mb-4">Learn with Plugsy</h3>
                <p className="text-brand-text-secondary text-sm mb-8 flex-1">Master new skills with our premium course library.</p>
                <div className="btn-secondary !py-3 text-center font-black uppercase tracking-widest text-[10px] opacity-50">
                  Coming Soon
                </div>
            </div>

            {/* LUTs Card (Disabled) */}
            <div className="card-premium p-8 flex flex-col relative opacity-60 grayscale cursor-not-allowed border-brand-border">
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <span className="bg-brand-surface border border-brand-border text-brand-text font-black uppercase tracking-widest px-4 py-2 text-xs rounded-full">Coming Soon</span>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-brand-surface border border-brand-border flex items-center justify-center mb-6">
                  <Tv size={28} className="text-brand-text-secondary" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter mb-4">Color Grading LUTs</h3>
                <p className="text-brand-text-secondary text-sm mb-8 flex-1">Professional cinematic aesthetics for all your videos.</p>
                <div className="btn-secondary !py-3 text-center font-black uppercase tracking-widest text-[10px] opacity-50">
                  Coming Soon
                </div>
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
                  { icon: MousePointer2, title: 'Choose your plan', desc: 'Select your preferred CapCut pro plan.' },
                  { icon: RefreshCw, title: 'Pay with Paystack', desc: 'Securely pay instantly using your card or bank transfer.' },
                  { icon: Clock, title: 'Instant Activation', desc: 'Our team is notified immediately to prepare your account.' },
                  { icon: CheckCircle2, title: 'Confirm & Track', desc: 'Track your premium subscription countdown in the dashboard.' },
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
                        Receipt for 1yr Access
                      </div>
                      <div className="flex items-end gap-3">
                         <div className="w-8 h-8 rounded-full bg-brand-text/10 shrink-0"></div>
                         <div className="liquid-glass border border-brand-border p-4 rounded-3xl rounded-tl-sm text-sm font-bold text-brand-text-secondary">
                          Payment received. Tracker active.
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
                { q: 'Does the CapCut pro logs work for iPhone or android or even my pc?', a: 'Yes, the CapCut Pro logs work on iPhone, Android, and even PC with full access. Please note: • We only allow 1 device login per user. • Any additional device login will require purchasing a new log. This procedure helps avoid CapCut security restrictions and keeps the accounts stable.' },
                { q: 'Is Learn With Plugsy available?', a: 'Not yet. It’s still in development and will launch soon. It will be an online platform where you can learn digital skills from home at affordable prices, including graphic design, software development, video editing, UI/UX design, and digital marketing. The goal is to make practical, in-demand skills easy and accessible for everyone.' },
                { q: 'What is Plugsy Portfolio Creation?', a: 'Plugsy Portfolio Creation is coming soon. This feature will allow freelancers and anyone to build a clear, professional profile of their work, helping them showcase their skills and stand out to clients or employers.' },
                { q: 'How do I login after getting pro access?', a: 'Login through TikTok first, wait for the login code from us, and then log into CapCut using TikTok. You can watch the tutorial here: https://youtu.be/eRENvc0DB8A' },
                { q: 'What is Plugsy?', a: 'Plugsy is an online platform built to help people connect to affordable services and experiences in a smarter and easier way while still maintaining full value and quality.' },
                { q: 'How do I get CapCut pro access?', a: 'After payment, your pro login will be sent to you.' },
                { q: 'How does confirmation work?', a: 'Confirmation is automatic via Paystack. Our team then prepares your premium logins.' },
                { q: 'When does my subscription countdown start?', a: 'Your subscription countdown begins as soon as our team activates your premium logins.' },
                { q: 'Will I get a renewal reminder?', a: 'Yes, you will get reminders to renew your plan before it expires to ensure no interruption.' },
                { q: 'Can I renew before my plan expires?', a: 'Yes, you can initiate a renewal before your current plan expires for seamless access.' },
                { q: 'What happens if my payment fails?', a: 'If an issue arises, you can retry or reach out to our support team via the chat portal.' },
              ].map((faq, i) => (
                <FAQItem key={i} faq={faq} />
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
