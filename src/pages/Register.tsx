import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import { SignUp } from '@clerk/clerk-react';
import { Stars } from 'lucide-react';
import { Logo } from '../components/ui/Logo';

export default function Register() {
  const location = useLocation();

  useEffect(() => {
    // Basic initialization if needed
  }, [location]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden pt-24 pb-12 text-brand-text">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 bg-[radial-gradient(circle_at_top,_var(--color-brand-accent)_0%,_transparent_50%)] opacity-10 dark:opacity-20" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md flex flex-col items-center"
      >
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex items-center gap-2 mb-6 group">
            <div className="h-12 w-auto flex items-center justify-center group-hover:scale-110 transition-transform">
               <Logo className="h-12 w-auto object-contain" />
            </div>
            <span className="text-2xl font-black tracking-tighter">PLUGSY.</span>
          </Link>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-[10px] font-black mb-4 uppercase tracking-widest">
            <Stars className="w-3 h-3" />
            <span>JOIN 1000+ PLUGGED IN USERS</span>
          </div>
          <h1 className="text-5xl font-normal tracking-tight mb-2 uppercase font-display leading-none">Create <span className="text-brand-accent">Account</span></h1>
          <p className="text-brand-text-secondary font-medium">and start living premium on a budget.</p>
        </div>

        <SignUp 
          signInUrl="/login" 
          forceRedirectUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: "card-premium border-none shadow-none p-0",
              card: "bg-transparent shadow-none border-none",
              headerTitle: "hidden",
              headerSubtitle: "hidden",
              socialButtonsBlockButton: "rounded-full border-brand-border bg-brand-surface hover:bg-brand-text/5 text-brand-text font-black",
              formButtonPrimary: "liquid-glass !bg-brand-text !text-brand-bg hover:!scale-105 active:!scale-95 transition-transform !py-4 rounded-[30px]",
              formFieldInput: "input",
              footerActionLink: "text-brand-accent hover:underline",
              identityPreviewText: "text-brand-text",
              identityPreviewEditButtonIcon: "text-brand-accent",
              footer: "hidden",
            }
          }}
        />
      </motion.div>
    </div>
  );
}
