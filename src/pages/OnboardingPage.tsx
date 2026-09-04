import React from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";

const CATEGORIES = [
  "Graphic Design",
  "Video Editing & Motion Graphics",
  "Web Development",
  "UI/UX Design",
  "Content Writing & Copywriting",
  "Digital Marketing & Social Media",
  "Photography & Videography",
  "AI Automation & Prompt Engineering",
  "Cybersecurity",
  "3D Design, Animation & VFX",
];

export default function OnboardingPage() {
  return (
    <div className="bg-white dark:bg-[#0a0a0c] text-slate-900 dark:text-white min-h-screen font-sans selection:bg-[#0066ff]/20 selection:text-slate-900 dark:selection:text-white overflow-x-hidden transition-colors duration-300">
      
      {/* SECTION 1 — HERO */}
      <section className="relative min-h-[calc(100vh-4rem)] flex flex-col justify-center px-6 md:px-12 py-16 md:py-24 max-w-7xl mx-auto overflow-hidden">
        {/* Glow Element */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] md:w-[600px] h-[350px] md:h-[600px] bg-[#0066ff]/10 rounded-full blur-[100px] pointer-events-none -z-10" />

        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          {/* Accent Label */}
          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-[10px] uppercase tracking-[0.2em] text-[#0066ff] font-black mb-4 md:mb-6"
          >
            SMART, LOW COST AND FOR ALL.
          </motion.p>

          {/* Massive Headline */}
          <motion.h1 
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
            className="font-display text-4xl sm:text-5xl md:text-7xl font-black tracking-tight leading-[1.1] md:leading-[1.05] text-slate-900 dark:text-white mb-6"
          >
            Verified portfolios &amp; <br className="hidden sm:inline" />
            premium subscriptions, <br className="hidden sm:inline" />
            <span className="text-slate-700 dark:text-white/90">all in one place.</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="text-base sm:text-lg text-slate-600 dark:text-white/50 leading-relaxed max-w-2xl mb-10"
          >
            Plugsy gives individuals an affordable way to access digital services while connecting them to the best valued products.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mb-6"
          >
            <Link
              to="/register"
              className="px-8 py-4 bg-[#0066ff] text-white font-bold rounded-xl text-center hover:bg-[#0066ff]/90 transition-all shadow-[0_8px_24px_rgba(0,102,255,0.25)] hover:shadow-[0_12px_32px_rgba(0,102,255,0.35)] hover:-translate-y-0.5"
            >
              Get Started Free<span className="sr-only">.</span>
            </Link>
            <Link
              to="/login"
              className="px-8 py-4 bg-transparent border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white font-bold rounded-xl text-center hover:bg-slate-100 dark:hover:bg-white/5 hover:border-slate-400 dark:hover:border-white/30 transition-all hover:-translate-y-0.5"
            >
              I have an account
            </Link>
          </motion.div>

          {/* Trust Row */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="text-xs text-slate-400 dark:text-white/30 font-medium select-none"
          >
            Secure payments via Paystack · Up to 30% referral payouts
          </motion.p>
        </div>
      </section>

      {/* SECTION 2 — WHAT IS PLUGSY */}
      <section className="px-6 md:px-12 py-16 md:py-28 max-w-7xl mx-auto border-t border-slate-100 dark:border-white/[0.04]">
        <div className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#0066ff] font-black mb-3">
            WHAT YOU GET
          </p>
          <h2 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-slate-900 dark:text-white">
            Everything you need to craft & grow
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Card 1 — CapCut Pro */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.08] rounded-[20px] p-8 md:p-10 flex flex-col justify-between hover:border-slate-300 dark:hover:border-white/[0.15] transition-colors shadow-sm dark:shadow-none"
          >
            <div>
              <h3 className="text-xl md:text-2xl font-black font-display mb-3 text-slate-900 dark:text-white tracking-tight">
                CapCut Pro Subscriptions
              </h3>
              <p className="text-sm md:text-base text-slate-600 dark:text-white/60 leading-relaxed mb-8">
                Get instant access to CapCut's premium editing tools with no watermarks, exclusive effects and pro templates. Pay once, get your login details sent straight to your Plugsy chat within minutes.
              </p>
            </div>
            
            <ul className="space-y-3.5 border-t border-slate-200 dark:border-white/[0.06] pt-6">
              <li className="flex items-center gap-3 text-sm text-slate-700 dark:text-white/80">
                <span className="text-[#0066ff] font-bold">✓</span> Flexible monthly plans
              </li>
              <li className="flex items-center gap-3 text-sm text-slate-700 dark:text-white/80">
                <span className="text-[#0066ff] font-bold">✓</span> Fast delivery via in-app chat
              </li>
              <li className="flex items-center gap-3 text-sm text-slate-700 dark:text-white/80">
                <span className="text-[#0066ff] font-bold">✓</span> Renew anytime, no long contracts
              </li>
            </ul>
          </motion.div>

          {/* Card 2 — Verified Portfolio */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.08] rounded-[20px] p-8 md:p-10 flex flex-col justify-between hover:border-slate-300 dark:hover:border-white/[0.15] transition-colors shadow-sm dark:shadow-none"
          >
            <div>
              <h3 className="text-xl md:text-2xl font-black font-display mb-3 text-slate-900 dark:text-white tracking-tight">
                Build a Portfolio That Gets You Hired
              </h3>
              <p className="text-sm md:text-base text-slate-600 dark:text-white/60 leading-relaxed mb-8">
                Create a clean, shareable portfolio page for your work, including design, video, code, photography, writing and more. Clients react to your best pieces and you see exactly what's landing.
              </p>
            </div>

            <ul className="space-y-3.5 border-t border-slate-200 dark:border-white/[0.06] pt-6">
              <li className="flex items-center gap-3 text-sm text-slate-700 dark:text-white/80">
                <span className="text-[#0066ff] font-bold">✓</span> One link to share anywhere
              </li>
              <li className="flex items-center gap-3 text-sm text-slate-700 dark:text-white/80">
                <span className="text-[#0066ff] font-bold">✓</span> Client reactions + analytics
              </li>
              <li className="flex items-center gap-3 text-sm text-slate-700 dark:text-white/80">
                <span className="text-[#0066ff] font-bold">✓</span> 10 creative categories to choose from
              </li>
            </ul>
          </motion.div>
        </div>
      </section>

      {/* SECTION 3 — HOW IT WORKS */}
      <section className="px-6 md:px-12 py-16 md:py-28 max-w-7xl mx-auto border-t border-slate-100 dark:border-white/[0.04]">
        <div className="text-center mb-16 md:mb-24">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#0066ff] font-black mb-3">
            HOW IT WORKS
          </p>
          <h2 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-slate-900 dark:text-white">
            Three steps. That's it.
          </h2>
        </div>

        <div className="relative">
          {/* Connecting Line (Desktop) */}
          <div className="hidden md:block absolute top-7 left-[10%] right-[10%] h-[1px] bg-slate-200 dark:bg-white/[0.08] -z-10" />

          <div className="grid md:grid-cols-3 gap-12 md:gap-8">
            {/* Step 1 */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center md:items-start text-center md:text-left"
            >
              <div className="w-14 h-14 rounded-full bg-[#0066ff]/10 border border-[#0066ff]/20 text-[#0066ff] font-mono font-black flex items-center justify-center text-lg mb-6 shadow-[0_0_20px_rgba(0,102,255,0.1)] bg-white dark:bg-transparent">
                01
              </div>
              <h4 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">
                Create your account
              </h4>
              <p className="text-sm text-slate-600 dark:text-white/50 leading-relaxed max-w-xs">
                Sign up free in under a minute
              </p>
            </motion.div>

            {/* Step 2 */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="flex flex-col items-center md:items-start text-center md:text-left"
            >
              <div className="w-14 h-14 rounded-full bg-[#0066ff]/10 border border-[#0066ff]/20 text-[#0066ff] font-mono font-black flex items-center justify-center text-lg mb-6 shadow-[0_0_20px_rgba(0,102,255,0.1)] bg-white dark:bg-transparent">
                02
              </div>
              <h4 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">
                Choose what you need
              </h4>
              <p className="text-sm text-slate-600 dark:text-white/50 leading-relaxed max-w-xs">
                CapCut subscription, a portfolio, or both
              </p>
            </motion.div>

            {/* Step 3 */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col items-center md:items-start text-center md:text-left"
            >
              <div className="w-14 h-14 rounded-full bg-[#0066ff]/10 border border-[#0066ff]/20 text-[#0066ff] font-mono font-black flex items-center justify-center text-lg mb-6 shadow-[0_0_20px_rgba(0,102,255,0.1)] bg-white dark:bg-transparent">
                03
              </div>
              <h4 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">
                Get instant access
              </h4>
              <p className="text-sm text-slate-600 dark:text-white/50 leading-relaxed max-w-xs">
                Login details or your live portfolio link, ready to use
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* SECTION 4 — REFERRAL CALLOUT */}
      <section className="bg-slate-50 dark:bg-white/[0.02] border-y border-slate-100 dark:border-white/[0.04]">
        <div className="px-6 md:px-12 py-20 md:py-28 max-w-7xl mx-auto flex flex-col items-center text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#0066ff] font-black mb-4">
            EARN WHILE YOU SHARE
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black font-display tracking-tight text-slate-900 dark:text-white mb-6">
            Get up to 30% every time someone uses your code
          </h2>
          <p className="text-sm md:text-base text-slate-600 dark:text-white/60 leading-relaxed max-w-2xl mb-12">
            Every Plugsy user gets a unique referral code. Share your code. When someone buys a subscription or portfolio using your code, you get a commission straight in your wallet automatically.
          </p>

          {/* Simple before/after style stat mockup */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="bg-white dark:bg-[#0a0a0c] border border-slate-200 dark:border-white/[0.08] rounded-2xl p-6 mb-10 max-w-sm w-full font-mono text-left relative overflow-hidden shadow-lg dark:shadow-none"
          >
            {/* Visual background hint */}
            <div className="absolute -right-10 -bottom-10 w-24 h-24 bg-[#0066ff]/5 rounded-full blur-xl" />
            
            <p className="text-[10px] uppercase text-slate-400 dark:text-white/30 tracking-wider font-bold mb-3">REFERRAL OVERVIEW</p>
            <div className="flex justify-between items-center mb-1.5 pb-2 border-b border-slate-100 dark:border-white/[0.04]">
              <span className="text-xs text-slate-500 dark:text-white/50">Your Referral Code</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white tracking-widest bg-slate-100 dark:bg-white/[0.04] px-2.5 py-1 rounded">PLUGX9</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500 dark:text-white/50">Total Earnings</span>
              <span className="text-xs font-bold text-[#0066ff]">+₦1,500.00</span>
            </div>
          </motion.div>

          <Link
            to="/register"
            className="px-6 py-3.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-white/[0.08] hover:border-slate-300 dark:hover:border-white/25 transition-all w-full sm:w-auto hover:-translate-y-0.5 shadow-sm dark:shadow-none"
          >
            Create your account to get your code
          </Link>
        </div>
      </section>

      {/* SECTION 5 — CATEGORIES SHOWCASE */}
      <section className="px-6 md:px-12 py-16 md:py-28 max-w-7xl mx-auto border-t border-slate-100 dark:border-white/[0.04]">
        <div className="text-center mb-12">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#0066ff] font-black mb-3">
            BUILT FOR EVERY CREATIVE
          </p>
          <h2 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-slate-900 dark:text-white mb-4">
            Whatever you do, there's a category for it
          </h2>
        </div>

        <div className="flex flex-wrap justify-center gap-3.5 max-w-4xl mx-auto">
          {CATEGORIES.map((category, idx) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.04 }}
              className="bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.1] rounded-full px-5 py-2.5 text-[13px] text-slate-700 dark:text-white/60 font-medium whitespace-nowrap select-none hover:border-[#0066ff] hover:text-[#0066ff] dark:hover:text-white hover:bg-[#0066ff]/5 transition-all cursor-default"
            >
              {category}
            </motion.div>
          ))}
        </div>
      </section>

      {/* SECTION 6 — FINAL CTA */}
      <section className="px-6 md:px-12 py-20 md:py-32 max-w-7xl mx-auto border-t border-slate-100 dark:border-white/[0.04] text-center">
        <div className="max-w-2xl mx-auto flex flex-col items-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black font-display tracking-tight text-slate-900 dark:text-white mb-4">
            Ready to get started?
          </h2>
          <p className="text-sm md:text-base text-slate-600 dark:text-white/50 leading-relaxed mb-10 max-w-md">
            Join Plugsy and get instant access to CapCut Pro and your own verified portfolio.
          </p>

          <Link
            to="/register"
            className="px-8 py-4.5 bg-[#0066ff] text-white font-bold rounded-xl text-center hover:bg-[#0066ff]/90 transition-all shadow-[0_8px_24px_rgba(0,102,255,0.25)] hover:shadow-[0_12px_32px_rgba(0,102,255,0.35)] hover:-translate-y-0.5 w-full sm:w-auto px-10 mb-6"
          >
            Create Free Account
          </Link>

          <p className="text-xs text-slate-500 dark:text-white/40 font-medium">
            Already have an account?{" "}
            <Link to="/login" className="text-slate-900 dark:text-white hover:text-[#0066ff] underline underline-offset-4 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </section>
      {/* SECTION 7 — FOOTER */}
      <footer className="px-6 md:px-12 py-10 max-w-7xl mx-auto border-t border-slate-100 dark:border-white/[0.04] flex flex-col gap-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex flex-col items-start gap-1">
            <span className="font-display font-black text-xl text-slate-900 dark:text-white tracking-tight">Plugsy</span>
            <span className="text-xs text-slate-500 dark:text-white/40 font-medium font-sans">smart, low cost and for all.</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link to="/products" className="text-xs text-slate-600 dark:text-white/50 hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-wider font-bold">
              Products
            </Link>
            <Link to="/about" className="text-xs text-slate-600 dark:text-white/50 hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-wider font-bold">
              About Plugsy
            </Link>
            <Link to="/support" className="text-xs text-slate-600 dark:text-white/50 hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-wider font-bold">
              Support
            </Link>
            <Link to="/login" className="text-xs text-slate-600 dark:text-white/50 hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-wider font-bold">
              Sign In
            </Link>
            <Link to="/register" className="text-xs text-slate-600 dark:text-white/50 hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-wider font-bold">
              Sign Up
            </Link>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-[11px] text-slate-500 dark:text-white/30 border-t border-slate-100 dark:border-white/[0.04] pt-8 font-sans">
          <span>© 2026 Plugsy. Built for smarter, more affordable access to what you need.</span>
          <div className="flex gap-4">
            <Link to="/terms" className="hover:text-slate-900 dark:hover:text-white/50 transition-colors">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-slate-900 dark:hover:text-white/50 transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
