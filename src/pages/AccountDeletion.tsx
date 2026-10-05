import { useState } from 'react';
import { useAuth, useClerk } from '@clerk/clerk-react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function AccountDeletion() {
  const { userId, getToken } = useAuth();
  const { signOut } = useClerk();
  const [confirmation, setConfirmation] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = async () => {
    if (confirmation !== 'DELETE MY ACCOUNT' || !accepted || deleting) return;
    setDeleting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in again before deleting your account.');
      const response = await fetch('/api/account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation, understandsRetention: accepted }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Your account could not be deleted.');
      await signOut({ redirectUrl: '/' });
    } catch (error: any) {
      toast.error(error?.message || 'Your account could not be deleted.');
      setDeleting(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#f4f7fb] px-4 py-8 text-slate-950 dark:bg-[#06080d] dark:text-white sm:py-14">
      <div className="mx-auto max-w-2xl">
        <Link to={userId ? '/dashboard' : '/'} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-600 dark:text-white/65"><ArrowLeft size={17} /> Back</Link>
        <section className="mt-5 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,.10)] dark:border-white/10 dark:bg-[#0c1018]">
          <header className="border-b border-slate-200 p-6 dark:border-white/10 sm:p-9">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-500/10 text-red-500"><Trash2 size={22} /></div>
            <p className="mt-6 text-[11px] font-black uppercase tracking-[.2em] text-red-500">Account control</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Delete your Plugsy account</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-white/60">This permanently removes your login and public profile. This action cannot be undone.</p>
          </header>
          <div className="space-y-6 p-6 sm:p-9">
            <div className="space-y-3 rounded-2xl bg-slate-50 p-5 dark:bg-white/[.04]">
              <p className="flex gap-3 text-sm leading-6"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={18} /> Your login, public profile, seller listings and personal profile details are removed or anonymised.</p>
              <p className="flex gap-3 text-sm leading-6"><ShieldCheck className="mt-0.5 shrink-0 text-blue-500" size={18} /> Transaction, fraud-prevention and dispute records may be retained where law, payment reconciliation or an unresolved claim requires it.</p>
              <p className="flex gap-3 text-sm leading-6"><AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={18} /> You must first withdraw or spend any balance and resolve pending withdrawals or marketplace disputes.</p>
            </div>

            {!userId ? (
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5">
                <p className="text-sm leading-6 text-slate-700 dark:text-white/70">Sign in to verify ownership and permanently delete your account.</p>
                <Link to="/login?redirect=/account-deletion" className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-500">Sign in to continue</Link>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block text-sm font-bold">Type <span className="font-black text-red-500">DELETE MY ACCOUNT</span>
                  <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/15 dark:border-white/15 dark:bg-black/20" />
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm leading-6 dark:border-white/10">
                  <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-red-600" />
                  <span>I understand the deletion is permanent and that legally required financial and dispute records may be retained.</span>
                </label>
                <button onClick={deleteAccount} disabled={confirmation !== 'DELETE MY ACCOUNT' || !accepted || deleting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">
                  {deleting ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                  {deleting ? 'Deleting account…' : 'Permanently delete account'}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
