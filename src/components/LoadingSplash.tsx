import { useReducedMotion } from 'motion/react';

export default function LoadingSplash() {
  const reduceMotion = useReducedMotion();

  return (
    <main role="status" aria-live="polite" className="grid min-h-screen place-items-center bg-brand-bg px-6 text-brand-text">
      <div className="flex flex-col items-center text-center" aria-label="Opening Plugsy">
        <img src="https://i.postimg.cc/4dHFwnzr/IMG-1987.png" alt="Plugsy" className="h-20 w-20 rounded-full object-cover shadow-[0_12px_40px_rgba(0,0,0,.16)]" />
        <span aria-hidden="true" className={`mt-6 h-1 w-16 overflow-hidden rounded-full bg-brand-border ${reduceMotion ? '' : 'before:block before:h-full before:w-1/2 before:rounded-full before:bg-brand-accent before:animate-[pulse_800ms_ease-in-out_infinite]'}`} />
      </div>
    </main>
  );
}
