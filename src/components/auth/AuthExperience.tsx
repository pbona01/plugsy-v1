import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Layers3, ShoppingBag, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../ui/Logo';

type AuthMode = 'login' | 'signup';

type AuthExperienceProps = {
  mode: AuthMode;
  children: ReactNode;
  switchHref: string;
};

const copy = {
  signup: {
    eyebrow: 'Start with Plugsy',
    title: 'Build. Sell. Get paid.',
    description: 'Create one account for your products, portfolio, Marketplace and wallet.',
    switchLead: 'Already have an account?',
    switchLabel: 'Sign in',
  },
  login: {
    eyebrow: 'Welcome back',
    title: 'Your space is ready.',
    description: 'Sign in to manage your products, wallet and Marketplace activity.',
    switchLead: 'New to Plugsy?',
    switchLabel: 'Create an account',
  },
} satisfies Record<AuthMode, Record<string, string>>;

const creatorSteps = [
  { icon: Layers3, label: 'Create', detail: 'Package your work' },
  { icon: ShoppingBag, label: 'Publish', detail: 'Reach your buyers' },
  { icon: WalletCards, label: 'Earn', detail: 'Track every payout' },
];

export const plugsyAuthAppearance = {
  variables: {
    colorPrimary: '#1677ff',
    colorText: 'var(--brand-text)',
    colorTextSecondary: 'var(--brand-text-secondary)',
    colorBackground: 'transparent',
    colorInputBackground: 'color-mix(in srgb, var(--brand-surface) 76%, transparent)',
    colorInputText: 'var(--brand-text)',
    borderRadius: '16px',
    fontFamily: 'var(--font-sans)',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full !shadow-none',
    card: 'w-full !gap-4 !rounded-none !bg-transparent !p-0 !shadow-none',
    header: 'hidden',
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
    main: '!gap-4',
    socialButtons: 'gap-2',
    socialButtonsBlockButton: 'min-h-12 rounded-2xl border border-brand-border bg-brand-surface/80 px-4 text-brand-text shadow-none backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-brand-accent/45 hover:bg-brand-surface focus-visible:ring-2 focus-visible:ring-brand-accent/40',
    socialButtonsBlockButtonText: 'text-sm font-bold',
    dividerRow: 'my-1',
    dividerLine: 'bg-brand-border',
    dividerText: 'px-3 text-[11px] font-semibold text-brand-text-secondary',
    form: 'gap-3',
    formFieldRow: 'gap-3',
    formFieldLabel: 'mb-1 text-[12px] font-bold text-brand-text-secondary',
    formFieldInput: 'h-12 rounded-2xl border border-brand-border bg-brand-surface/80 px-4 text-[16px] text-brand-text shadow-none outline-none backdrop-blur-xl transition placeholder:text-brand-text-secondary/70 hover:border-brand-text-secondary/35 focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/15',
    formFieldInputShowPasswordButton: 'text-brand-text-secondary hover:text-brand-text',
    formButtonPrimary: 'mt-1 h-12 rounded-2xl bg-brand-accent text-sm font-black text-white shadow-[0_14px_34px_rgba(0,102,255,.28)] transition hover:-translate-y-0.5 hover:bg-[#1677ff] hover:shadow-[0_18px_40px_rgba(0,102,255,.34)] focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg active:translate-y-0',
    identityPreview: 'rounded-2xl border border-brand-border bg-brand-surface/75',
    identityPreviewText: 'text-brand-text',
    identityPreviewEditButtonIcon: 'text-brand-accent',
    formFieldErrorText: 'mt-1 text-[11px] font-semibold text-red-500',
    formFieldSuccessText: 'mt-1 text-[11px] font-semibold text-emerald-500',
    alert: 'rounded-2xl border border-red-500/20 bg-red-500/10 text-red-500',
    alertText: 'text-[12px] font-semibold',
    otpCodeFieldInput: 'h-12 rounded-xl border-brand-border bg-brand-surface/80 text-brand-text',
    formResendCodeLink: 'font-bold text-brand-accent',
    footer: '!hidden',
    footerAction: '!hidden',
    footerActionText: '!hidden',
    footerActionLink: '!hidden',
    footerPages: '!hidden',
  },
};

export function AuthExperience({ mode, children, switchHref }: AuthExperienceProps) {
  const reduceMotion = useReducedMotion();
  const content = copy[mode];

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[#eef3fb] text-slate-950 dark:bg-[#05070d] dark:text-white">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(0,102,255,.22),transparent_34%),radial-gradient(circle_at_88%_22%,rgba(129,92,246,.17),transparent_32%),radial-gradient(circle_at_46%_100%,rgba(255,118,90,.16),transparent_38%)] dark:bg-[radial-gradient(circle_at_12%_10%,rgba(0,102,255,.26),transparent_34%),radial-gradient(circle_at_88%_22%,rgba(129,92,246,.18),transparent_32%),radial-gradient(circle_at_46%_100%,rgba(255,118,90,.13),transparent_38%)]" />
        <motion.div
          animate={reduceMotion ? undefined : { x: [0, 18, -8, 0], y: [0, -14, 10, 0], rotate: [0, 5, -3, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -left-28 top-[38%] h-80 w-80 rounded-full bg-blue-500/15 blur-[90px] dark:bg-blue-500/20"
        />
        <motion.div
          animate={reduceMotion ? undefined : { x: [0, -15, 12, 0], y: [0, 18, -10, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -right-32 bottom-[-5rem] h-96 w-96 rounded-full bg-violet-500/15 blur-[100px] dark:bg-violet-500/20"
        />
      </div>

      <div className="relative mx-auto grid min-h-[100dvh] w-full max-w-[1500px] lg:grid-cols-[minmax(0,1.08fr)_minmax(27rem,.78fr)] lg:gap-4 lg:p-4">
        <motion.aside
          initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative hidden min-h-[calc(100dvh-2rem)] overflow-hidden rounded-[2.25rem] border border-white/10 bg-[#070a11] p-10 text-white shadow-[0_28px_90px_rgba(0,0,0,.28)] lg:flex lg:flex-col xl:p-14"
        >
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_14%_16%,rgba(0,102,255,.42),transparent_31%),radial-gradient(circle_at_84%_18%,rgba(142,94,255,.28),transparent_31%),radial-gradient(circle_at_50%_92%,rgba(255,123,92,.30),transparent_39%)]" />
          <div aria-hidden="true" className="absolute inset-0 opacity-[.18] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />

          <Link to="/" aria-label="Go to Plugsy home" className="relative z-10 inline-flex w-fit min-h-11 items-center gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-white/80">
            <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/60 p-1.5 shadow-xl"><Logo className="h-full w-full object-contain" /></span>
            <span className="text-xl font-black tracking-tight">Plugsy<span className="text-[#2f8bff]">.</span></span>
          </Link>

          <div className="relative z-10 my-auto max-w-2xl py-10 xl:py-14">
            <p className="text-[11px] font-black uppercase tracking-[.2em] text-blue-200">One account. Every creator tool.</p>
            <h2 className="mt-5 max-w-[12ch] text-[clamp(3.25rem,4.8vw,5.75rem)] font-black leading-[.92] tracking-[-.065em] text-white">Turn your work into something people can buy.</h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/68">Build your public presence, sell digital products and keep every payment in one secure Plugsy space.</p>

            <div className="mt-9 grid max-w-2xl grid-cols-3 gap-3">
              {creatorSteps.map(({ icon: Icon, label, detail }, index) => (
                <motion.div
                  key={label}
                  initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 + index * 0.07, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-2xl border border-white/10 bg-white/[.07] p-4 backdrop-blur-xl"
                >
                  <Icon size={18} className="text-blue-300" aria-hidden="true" />
                  <p className="mt-5 text-sm font-black text-white">{label}</p>
                  <p className="mt-1 text-[11px] text-white/55">{detail}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.aside>

        <section className="relative flex min-h-[100dvh] items-start justify-center px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7 sm:pt-[max(2.5rem,env(safe-area-inset-top))] lg:min-h-0 lg:items-center lg:px-8 lg:py-10">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[29rem] pt-1 sm:pt-3 lg:pt-0"
          >
            <div className="mb-9 flex items-center lg:hidden">
              <Link to="/" aria-label="Go to Plugsy home" className="inline-flex min-h-11 items-center gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand-accent">
                <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-black/[.07] bg-black p-1.5 shadow-[0_10px_24px_rgba(0,0,0,.2)] dark:border-white/10"><Logo className="h-full w-full object-contain" /></span>
                <span className="text-[1.35rem] font-black tracking-[-.045em] text-slate-950 dark:text-white">Plugsy<span className="text-brand-accent">.</span></span>
              </Link>
            </div>

            <header className="max-w-[25rem]">
              <p className="text-[11px] font-black uppercase tracking-[.2em] text-brand-accent">{content.eyebrow}</p>
              <h1 className="mt-3 text-[clamp(2.25rem,10vw,2.85rem)] font-black leading-[.96] tracking-[-.06em] text-slate-950 sm:text-[clamp(2.65rem,8vw,3.8rem)] dark:text-white">{content.title}</h1>
              <p className="mt-4 max-w-md text-[15px] leading-6 text-slate-600 dark:text-white/58">{content.description}</p>
            </header>

            <div className="mt-6 rounded-[1.5rem] border border-white/70 bg-white/72 p-4 shadow-[0_18px_45px_rgba(38,61,102,.14)] backdrop-blur-2xl sm:mt-7 sm:rounded-[1.75rem] sm:p-6 sm:shadow-[0_24px_70px_rgba(38,61,102,.16)] dark:border-white/[.1] dark:bg-[#0b1019]/88 dark:shadow-[0_24px_60px_rgba(0,0,0,.32)]">
              {children}
            </div>

            <div className="mt-5 flex flex-col items-center gap-2.5 text-center">
              <p className="text-sm text-slate-600 dark:text-white/58">
                {content.switchLead}{' '}
                <Link to={switchHref} className="inline-flex min-h-11 items-center gap-1 font-black text-slate-950 underline decoration-brand-accent/50 underline-offset-4 hover:text-brand-accent dark:text-white dark:hover:text-blue-300">
                  {content.switchLabel}<ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </p>
              <p className="max-w-sm text-[11px] leading-5 text-slate-500 dark:text-white/42">
                By continuing, you agree to Plugsy’s <Link to="/terms" className="underline underline-offset-2 hover:text-brand-accent">Terms</Link> and <Link to="/privacy" className="underline underline-offset-2 hover:text-brand-accent">Privacy Policy</Link>.
              </p>
            </div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
