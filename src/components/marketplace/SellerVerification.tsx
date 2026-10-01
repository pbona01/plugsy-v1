import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Loader2, ScanFace, ShieldCheck } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import usePremblyKyc from '../../hooks/usePremblyKyc';
import toast from 'react-hot-toast';

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
  const verified = seller?.verification_status === 'verified';
  const retryAvailable = seller?.verification_status === 'pending' && seller?.verification_retry_available === true;
  const pending = seller?.verification_status === 'pending' && !retryAvailable;
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

  const handleWidgetResult = useCallback(async (response: any) => {
    const active = widget;
    setWidget(null);
    if (!active) return;
    const code = String(response?.code || '').toUpperCase();
    const state = String(response?.status || '').toLowerCase();
    if (code === 'E02' || ['closed', 'cancelled', 'canceled'].includes(state)) {
      setBusy(false);
      toast('Verification closed. You can restart it when you are ready.');
      return;
    }
    if (code === 'E00' || state === 'failed') {
      setBusy(false);
      toast.error(response?.message || 'Prembly could not open the verification window.');
      return;
    }
    const sessionId = sessionIdFrom(response);
    if (!sessionId) {
      setBusy(false);
      toast.success('Verification submitted. Plugsy is waiting for Prembly’s secure confirmation.');
      await onComplete();
      return;
    }
    try {
      const result = await authenticatedRequest('complete-identity-verification', {
        reference: active.reference,
        sessionId,
      });
      if (result.status === 'verified') toast.success('Identity verified. You can now publish publicly.');
      else if (result.status === 'rejected') toast.error('Prembly could not verify this attempt. Review your details and try again.');
      else toast.success('Verification submitted. Your seller status will update shortly.');
      await onComplete();
    } catch (error: any) {
      toast.error(error.message || 'Plugsy could not confirm the verification result yet.');
      await onComplete();
    } finally {
      setBusy(false);
    }
  }, [authenticatedRequest, onComplete, widget]);

  const begin = async () => {
    if (!premiumActive) return toast.error('Activate Marketplace Premium before verifying your seller identity.');
    if (!accepted) return toast.error('Please accept the identity-verification consent notice.');
    setBusy(true);
    try {
      const result = await authenticatedRequest('begin-identity-verification', { accepted: true });
      if (result.status === 'verified') {
        toast.success('Your seller identity is already verified.');
        await onComplete();
        setBusy(false);
        return;
      }
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
            {['Choose BVN or NIN', 'Complete live face scan', 'Return verified'].map((label, index) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl border border-brand-border bg-brand-bg/45 p-3.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-accent text-[10px] font-black text-white">{index + 1}</span>
                <span className="text-[11px] font-bold leading-4">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-brand-border bg-brand-bg/45 p-5 sm:p-7 lg:border-l lg:border-t-0">
          {pending ? (
            <div className="flex h-full min-h-56 flex-col justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5 text-sm leading-6 text-brand-text-secondary">
              <Loader2 size={22} className="mb-4 animate-spin text-amber-500" />
              <strong className="text-brand-text-primary">Prembly is confirming your result.</strong>
              <span className="mt-1">Your seller status updates automatically after the signed result arrives.</span>
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
              <label className="mt-5 flex cursor-pointer items-start gap-3 text-xs leading-5 text-brand-text-secondary">
                <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-brand-accent" />
                <span>I consent to Prembly processing my identity and live facial data for Plugsy seller verification.</span>
              </label>
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
