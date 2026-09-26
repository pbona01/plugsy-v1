import { useReducedMotion } from 'motion/react';

export default function LoadingSplash() {
  const reduceMotion = useReducedMotion();

  return (
    <main role="status" aria-live="polite" className="grid min-h-screen place-items-center bg-brand-bg px-6 text-brand-text">
      <div className="flex flex-col items-center text-center">
        <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-brand-border bg-brand-surface p-2 shadow-[0_12px_40px_rgba(0,0,0,.16)]">
          <img src="/logo.svg" alt="" className="h-full w-full object-contain" />
        </span>
        <span className="mt-5 text-lg font-black tracking-tight">Plugsy<span className="text-brand-accent">.</span></span>
        <p className="mt-2 text-sm text-brand-text-secondary">Opening your space…</p>
        <span aria-hidden="true" className={`mt-5 h-5 w-5 rounded-full border-2 border-brand-border border-t-brand-accent ${reduceMotion ? '' : 'animate-spin'}`} />
      </div>
    </main>
  );
}
