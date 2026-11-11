import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { SignIn } from '@clerk/clerk-react';
import { MailCheck, TriangleAlert } from 'lucide-react';
import { AuthExperience, plugsyAuthAppearance } from '../components/auth/AuthExperience';
import { safeAuthRedirect } from '../utils/safeAuthRedirect';

export default function Login() {
  const [searchParams] = useSearchParams();
  const redirect = safeAuthRedirect(searchParams.get('redirect'));
  return (
    <AuthExperience mode="login" switchHref={`/register?redirect=${encodeURIComponent(redirect)}`}>
      <section aria-live="polite" className="mb-5 rounded-2xl border border-amber-500/25 bg-amber-500/[.09] p-4 text-left">
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300"><TriangleAlert size={18} /></span>
          <div>
            <h2 className="text-sm font-black text-slate-950 dark:text-white">Google sign-in is temporarily unavailable</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-white/65">Your Plugsy account is safe. Use a secure email code to access your existing account.</p>
          </div>
        </div>
        <ol className="mt-4 space-y-2 border-t border-amber-500/15 pt-3 text-xs leading-5 text-slate-700 dark:text-white/72">
          <li><strong className="mr-2 text-amber-700 dark:text-amber-300">1.</strong>Enter the same Gmail address you used for Plugsy.</li>
          <li><strong className="mr-2 text-amber-700 dark:text-amber-300">2.</strong>Choose <span className="font-bold">Email code</span> or <span className="font-bold">Continue with email</span>.</li>
          <li><strong className="mr-2 text-amber-700 dark:text-amber-300">3.</strong>Check your inbox, enter the code, and continue to your old account.</li>
        </ol>
        <p className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-white/60"><MailCheck size={14} className="text-brand-accent" /> Do not create a new account or use a different email.</p>
      </section>
      <SignIn signUpUrl={`/register?redirect=${encodeURIComponent(redirect)}`} forceRedirectUrl={redirect} appearance={plugsyAuthAppearance} />
    </AuthExperience>
  );
}

