import React from 'react';
import { motion } from 'motion/react';
import { Link, useSearchParams } from 'react-router-dom';
import { SignIn } from '@clerk/clerk-react';
import { LockKeyhole } from 'lucide-react';
import { Logo } from '../components/ui/Logo';
import { safeAuthRedirect } from '../utils/safeAuthRedirect';

const clerkAppearance = {
  elements: {
    rootBox: 'w-full', card: 'w-full bg-transparent !p-0 shadow-none', header: 'hidden', headerTitle: 'hidden', headerSubtitle: 'hidden',
    socialButtonsBlockButton: 'h-12 rounded-2xl border-brand-border bg-brand-surface text-brand-text shadow-none transition hover:border-brand-accent/60 hover:bg-brand-accent/[.05]',
    socialButtonsBlockButtonText: 'font-semibold', dividerLine: 'bg-brand-border', dividerText: 'px-3 text-[11px] font-medium text-brand-text-secondary',
    formFieldLabel: 'text-[12px] font-semibold text-brand-text-secondary',
    formFieldInput: 'h-12 rounded-2xl border-brand-border bg-brand-surface px-4 text-brand-text shadow-none outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/15',
    formButtonPrimary: 'mt-2 h-12 rounded-2xl bg-[#4d7dff] text-sm font-bold text-white shadow-[0_12px_28px_rgba(77,125,255,.25)] transition hover:bg-[#3f6ff2] hover:shadow-[0_16px_34px_rgba(77,125,255,.32)] focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg',
    identityPreviewText: 'text-brand-text', identityPreviewEditButtonIcon: 'text-brand-accent',
  },
};

export default function Login() {
  const [searchParams] = useSearchParams();
  const redirect = safeAuthRedirect(searchParams.get('redirect'));
  return (
    <main className="relative grid min-h-screen place-items-center bg-brand-bg px-4 py-5 text-brand-text sm:px-6 sm:py-8">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(77,125,255,.17),transparent_36%),radial-gradient(circle_at_12%_92%,rgba(42,88,220,.11),transparent_30%)]" />
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="relative w-full max-w-[28rem] rounded-[1.75rem] border border-brand-border bg-brand-surface/95 px-5 py-6 shadow-[0_24px_70px_rgba(0,0,0,.28)] backdrop-blur-xl sm:px-7 sm:py-8">
        <Link to="/" aria-label="Go to Plugsy home" className="inline-flex min-h-11 items-center gap-3 rounded-2xl outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-brand-accent">
          <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl border border-brand-border bg-brand-bg p-1.5 shadow-sm"><Logo className="h-full w-full object-contain" /></span>
          <span className="text-xl font-black tracking-tight">Plugsy<span className="text-brand-accent">.</span></span>
        </Link>
        <div className="mt-5">
          <h1 className="text-[clamp(2rem,8vw,2.7rem)] font-black leading-tight tracking-[-.045em]">Welcome <span className="text-brand-accent">back.</span></h1>
          <p className="mt-1 text-sm leading-5 text-brand-text-secondary">Sign in to continue where you left off.</p>
        </div>
        <div className="mt-5"><SignIn signUpUrl={`/register?redirect=${encodeURIComponent(redirect)}`} forceRedirectUrl={redirect} appearance={clerkAppearance} /></div>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-brand-text-secondary"><LockKeyhole size={13} aria-hidden="true" /> Secure sign-in</p>
      </motion.section>
    </main>
  );
}
