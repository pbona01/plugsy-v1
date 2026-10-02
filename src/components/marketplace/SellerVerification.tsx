import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Loader2, ScanFace, ShieldCheck } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import usePremblyKyc from '../../hooks/usePremblyKyc';
import toast from 'react-hot-toast';

const CONSENT_VERSION = 'seller-identity-v2-2026-10-02';
type VerificationProgress = 'idle' | 'opening' | 'provider' | 'syncing' | 'delayed' | 'complete' | 'rejected';

type WidgetConfiguration = {
  widgetKey: string;
  widgetId: string;
  reference: string;
  email: string;
  firstName: string;
  lastName: string;
  isTest: boolean;
};

const valueAt = (source: any, paths: string[]) => {
  for (const path of paths) {
    let value = source;
    for (const key of path.split('.')) value = value?.[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return '';
};

const sessionIdFrom = (response: any) => valueAt(response, [
  'session_id', 'sessionId', 'data.session_id', 'data.sessionId',
  'data.widget_info.session_id', 'widget_info.session_id',
]);

function PremblyLauncher({ config, onResult }: { config: WidgetConfiguration; onResult: (response: any) => void }) {
  const launched = useRef(false);
  const launch = usePremblyKyc({
    first_name: config.firstName,
    last_name: config.lastName,
    email: config.email,
    widget_key: config.widgetKey,
    widget_id: config.widgetId,
    user_ref: config.reference,
    is_test: config.isTest,
    metadata: {
      verification_reference: config.reference,
      transaction_id: config.reference,
    },
    callback: onResult,
  });

  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    launch();
  }, [launch]);

  return null;
}

export default function SellerVerification({ seller, onComplete }: { seller: any; onComplete: () => Promise<void> }) {
  const { getToken } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [widget, setWidget] = useState<WidgetConfiguration | null>(null);
  const [progress, setProgress] = useState<VerificationProgress>('idle');
  const pollCount = useRef(0);
  const rejectedRecoveryChecked = useRef(false);
  const verified = seller?.verification_status === 'verified';
  const retryAvailable = seller?.verification_status === 'pending' && seller?.verification_retry_available === true;
  const pending = seller?.verification_status === 'pending' && !retryAvailable;
  const checking = pending || progress === 'syncing' || progress === 'delayed';
  const premiumActive = seller?.public_selling_enabled === true
    && Date.parse(seller?.public_plan_expires_at || '') > Date.now();

  const authenticatedRequest = useCallback(async (action: string, body: Record<string, unknown>) => {
    const token = await getToken();
    const response = await fetch(`/api/marketplace?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(result?.error || 'Verification is temporarily unavailable.');
    return result;
  }, [getToken]);

  const checkStatus = useCallback(async ({ announce = false } = {}) => {
    const result = await authenticatedRequest('check-identity-verification', {});
    if (result.status === 'verified') {
      setProgress('complete');
      setBusy(false);
      if (announce) toast.success('Identity verified. Public marketplace access is ready.', { id: 'seller-verification-result' });
      await onComplete();
      return true;
    }
    if (result.status === 'rejected') {
      setProgress('rejected');
      setBusy(false);
      if (announce) toast.error('Prembly could not verify this attempt. Review your details before trying again.', { id: 'seller-verification-result' });
      await onComplete();
      return true;
    }
    setProgress('syncing');
    return false;
  }, [authenticatedRequest, onComplete]);

  useEffect(() => {
    if (verified) {
      setProgress('complete');
      setBusy(false);
      return;
    }
    if (progress === 'delayed') return;
    const shouldPoll = pending || progress === 'syncing';
    if (!shouldPoll) return;
    let cancelled = false;
    let interval = 0;
    pollCount.current = 0;
    const tick = async () => {
      if (cancelled) return;
      pollCount.current += 1;
      if (pollCount.current > 18) {
        setProgress('delayed');
        return;
      }
      try {
        const finished = await checkStatus({ announce: false });
        if (finished) {
          cancelled = true;
          window.clearInterval(interval);
        }
      } catch { /* The next signed webhook or poll can still finish the attempt. */ }
    };
    void tick();
    interval = window.setInterval(() => void tick(), 7_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [checkStatus, pending, progress, verified]);

  useEffect(() => {
    if (seller?.verification_status !== 'rejected' || rejectedRecoveryChecked.current) return;
    rejectedRecoveryChecked.current = true;
    setProgress('syncing');
    void checkStatus({ announce: false }).catch(() => setProgress('rejected'));
  }, [checkStatus, seller?.verification_status]);

  const handleWidgetResult = useCallback(async (response: any) => {
    const active = widget;
    setWidget(null);
    if (!active) return;
    const releaseAttempt = async () => {
      try {
        await authenticatedRequest('cancel-identity-verification', { reference: active.reference });
      } catch {
        // Workspace refresh below still exposes the normal one-minute retry fallback.
      }
      await onComplete();
    };
    const code = String(response?.code || '').toUpperCase();
    const state = String(response?.status || '').toLowerCase();
    if (code === 'E02' || ['closed', 'cancelled', 'canceled'].includes(state)) {
      setBusy(false);
      setProgress('idle');
      toast('Verification closed. You can restart it when you are ready.');
      await releaseAttempt();
      return;
    }
    if (code === 'E00' || ['failed', 'error'].includes(state)) {
      setBusy(false);
      setProgress('idle');
      toast.error(response?.message || 'Prembly could not open the verification window.');
      await releaseAttempt();
      return;
    }
    const sessionId = sessionIdFrom(response);
    if (!sessionId) {
      setBusy(false);
      setProgress('syncing');
      toast.success('Verification submitted. Plugsy is waiting for Prembly’s secure confirmation.');
      await onComplete();
      try { await checkStatus({ announce: true }); } catch { /* Polling continues. */ }
      return;
    }
    setProgress('syncing');
    try {
      const result = await authenticatedRequest('complete-identity-verification', {
        reference: active.reference,
        sessionId,
      });
      if (result.status === 'verified') toast.success('Identity verified. You can now publish publicly.');
      else if (result.status === 'rejected') toast.error('Prembly could not verify this attempt. Review your details and try again.', { id: 'seller-verification-result' });
      else toast.success('Verification submitted. Plugsy is securely checking the result.');
      await onComplete();
    } catch (error: any) {
      toast.error(error.message || 'Plugsy could not confirm the verification result yet.');
      await onComplete();
    } finally {
      setBusy(false);
    }
  }, [authenticatedRequest, checkStatus, onComplete, widget]);

  const begin = async () => {
    if (!premiumActive) return toast.error('Activate Marketplace Premium before verifying your seller identity.');
    if (!accepted) return toast.error('Please accept the identity-verification consent notice.');
    setBusy(true);
    setProgress('opening');
    try {
      const result = await authenticatedRequest('begin-identity-verification', { accepted: true, adultConfirmed: true, consentVersion: CONSENT_VERSION });
      if (result.status === 'verified') {
        toast.success('Your seller identity is already verified.');
        await onComplete();
        setBusy(false);
        return;
      }
      setProgress('provider');
      setWidget({
        widgetKey: result.widgetKey,
        widgetId: result.widgetId,
        reference: result.reference,
        email: result.email,
        firstName: result.firstName,
        lastName: result.lastName,
        isTest: Boolean(result.isTest),
      });
    } catch (error: any) {
      setBusy(false);
      setProgress('idle');
      toast.error(error.message || 'Verification could not be started.');
    }
  };

  return (
    <section className="mx-auto mt-6 max-w-7xl overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
      {widget && <PremblyLauncher config={widget} onResult={(response) => void handleWidgetResult(response)} />}
      <div className="grid lg:grid-cols-[1.05fr_.95fr]">
        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-accent/10 text-brand-accent"><ShieldCheck size={21} /></span>
            {verified && <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-500"><CheckCircle2 size={15} /> Verified</span>}
          </div>
          <p className="mt-5 text-[10px] font-black uppercase tracking-[.18em] text-brand-accent">Prembly secure verification</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight">Verify without sending documents to Plugsy</h3>
          <p className="mt-3 max-w-xl text-sm leading-6 text-brand-text-secondary">Prembly opens a protected verification window where you choose BVN or NIN and complete a live camera face check. Plugsy receives only the verified result and session reference.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {['Choose BVN or NIN', 'Complete live face scan', 'Secure result check'].map((label, index) => {
              const activeStep = progress === 'complete' ? 3 : progress === 'syncing' || progress === 'delayed' ? 2 : progress === 'provider' ? 1 : 0;
              const done = activeStep > index;
              const active = activeStep === index && progress !== 'idle';
              return (
              <div key={label} className={`flex items-center gap-3 rounded-2xl border p-3.5 transition-colors ${active ? 'border-brand-accent/45 bg-brand-accent/10' : 'border-brand-border bg-brand-bg/45'}`}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-black ${done ? 'bg-emerald-500 text-white' : 'bg-brand-accent text-white'}`}>{done ? <CheckCircle2 size={14}/> : active ? <Loader2 size={13} className="animate-spin"/> : index + 1}</span>
                <span className="text-[11px] font-bold leading-4">{label}</span>
              </div>
            )})}
          </div>
        </div>

        <div className="border-t border-brand-border bg-brand-bg/45 p-5 sm:p-7 lg:border-l lg:border-t-0">
          {checking ? (
            <div className="flex h-full min-h-56 flex-col justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5 text-sm leading-6 text-brand-text-secondary">
              <Loader2 size={22} className="mb-4 animate-spin text-amber-500" />
              <strong className="text-brand-text-primary">{progress === 'delayed' ? 'This check is taking longer than usual.' : 'Securely checking your verification.'}</strong>
              <span className="mt-1">{progress === 'delayed' ? 'Your completed check is not lost. Use Check status now, or return later—Plugsy will also accept Prembly’s signed update.' : 'Plugsy is waiting for Prembly’s signed result and checking the session securely. This normally takes under two minutes.'}</span>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-brand-border"><span className="block h-full w-2/3 animate-pulse rounded-full bg-amber-500"/></div>
              <button type="button" onClick={() => void checkStatus({ announce: true })} className="mt-5 self-start rounded-xl border border-brand-border bg-brand-surface px-4 py-2 text-[10px] font-black uppercase tracking-wider text-brand-text-primary">Check status now</button>
            </div>
          ) : verified ? (
            <div className="flex h-full min-h-56 flex-col items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-6 text-center">
              <CheckCircle2 size={34} className="text-emerald-500" />
              <strong className="mt-4 text-lg">Seller identity verified</strong>
              <p className="mt-2 text-xs leading-5 text-brand-text-secondary">Your identity details remain with Prembly. Plugsy stores the result and reference.</p>
            </div>
          ) : (
            <div className="flex h-full flex-col justify-center">
              {retryAvailable && <div className="mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs leading-5 text-brand-text-secondary"><strong className="text-brand-text-primary">The previous attempt did not finish.</strong> You can safely open a new Prembly session.</div>}
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-accent/10 text-brand-accent"><ScanFace size={19} /></span>
                <div><strong className="block text-sm">Live identity check</strong><span className="text-[10px] text-brand-text-secondary">Camera access happens inside Prembly</span></div>
              </div>
              <div className="mt-5 flex items-start gap-3 text-xs leading-5 text-brand-text-secondary">
                <input id="seller-verification-consent" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-brand-accent" />
                <div><label htmlFor="seller-verification-consent" className="cursor-pointer">I confirm I am at least 18 and explicitly consent to Prembly processing my BVN or NIN details and live facial/biometric data solely to verify my identity for public selling. I understand Plugsy stores only the result, provider reference, and consent record—not my BVN, NIN, or selfie.</label> I have read the <Link to="/privacy" className="font-bold text-brand-accent underline underline-offset-2">Privacy Policy</Link> and <Link to="/marketplace/policy" className="font-bold text-brand-accent underline underline-offset-2">Marketplace Policy</Link>.</div>
              </div>
              {!premiumActive && <p className="mt-4 rounded-xl border border-brand-border bg-brand-surface p-3 text-[11px] leading-5 text-brand-text-secondary">Activate the monthly or yearly Marketplace Premium plan first. Verification is the final step before public publishing.</p>}
              <button type="button" disabled={busy || !premiumActive} onClick={() => void begin()} className="btn-primary mt-5 flex h-12 w-full items-center justify-center gap-2 text-xs font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? <><Loader2 size={16} className="animate-spin" />Opening Prembly…</> : <>Verify securely <ArrowUpRight size={15} /></>}
              </button>
              <p className="mt-3 text-center text-[10px] leading-4 text-brand-text-secondary">You will complete the entire identity and camera process in Prembly’s secure widget.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
