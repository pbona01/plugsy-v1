import { ChangeEvent, useState } from 'react';
import { Camera, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import imageCompression from 'browser-image-compression';
import toast from 'react-hot-toast';

type Method = 'bvn_face' | 'nin_face';

const options: { id: Method; title: string; description: string }[] = [
  { id: 'bvn_face', title: 'BVN + Face Validation', description: 'Match your BVN to a current selfie.' },
  { id: 'nin_face', title: 'NIN + Face Validation', description: 'Match your NIN to a current selfie.' },
];

const readSelfie = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Your selfie could not be read. Please choose another image.'));
  reader.onload = () => resolve(String(reader.result || ''));
  reader.readAsDataURL(file);
});

export default function SellerVerification({ seller, onComplete }: { seller: any; onComplete: () => Promise<void> }) {
  const { getToken } = useAuth();
  const [method, setMethod] = useState<Method>('bvn_face');
  const [number, setNumber] = useState('');
  const [selfie, setSelfie] = useState<File | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preparingSelfie, setPreparingSelfie] = useState(false);
  const verified = seller?.verification_status === 'verified';
  const retryAvailable = seller?.verification_status === 'pending' && seller?.verification_retry_available === true;
  const pending = seller?.verification_status === 'pending' && !retryAvailable;
  const selected = options.find((option) => option.id === method)!;
  const numberLabel = method === 'bvn_face' ? 'BVN' : 'NIN';

  const chooseSelfie = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Use a JPG or PNG selfie. HEIC files are not supported yet.');
      event.target.value = '';
      return;
    }
    setPreparingSelfie(true);
    try {
      const prepared = await imageCompression(file, {
        maxSizeMB: 1.2,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: 'image/jpeg',
        initialQuality: 0.9,
      });
      setSelfie(new File([prepared], file.name.replace(/\.(png|jpe?g)$/i, '.jpg'), { type: 'image/jpeg' }));
    } catch {
      toast.error('That selfie could not be prepared. Please take another clear photo.');
      event.target.value = '';
    } finally {
      setPreparingSelfie(false);
    }
  };

  const submit = async () => {
    const cleanNumber = number.replace(/\s+/g, '');
    if (!/^\d{11}$/.test(cleanNumber)) return toast.error(`Enter your 11-digit ${numberLabel}.`);
    if (!selfie) return toast.error('Upload a clear current selfie.');
    if (!accepted) return toast.error('Please accept the identity-verification consent notice.');

    setBusy(true);
    try {
      const image = await readSelfie(selfie);
      const token = await getToken();
      const response = await fetch('/api/marketplace?action=verify-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({ method, number: cleanNumber, image, accepted: true }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        if (result?.code === 'VERIFICATION_PENDING_RETRY' || result?.code === 'VERIFICATION_IN_PROGRESS') await onComplete();
        throw new Error(result?.error || 'Verification is unavailable.');
      }
      if (result.status === 'verified') {
        toast.success('Identity verified. You can now publish publicly.');
        setNumber('');
        setSelfie(null);
        setAccepted(false);
      } else {
        toast.error('That selfie did not match the identity record. Check the number and take a clear, front-facing photo before retrying.');
      }
      await onComplete();
    } catch (error: any) {
      toast.error(error.message || 'Verification could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto mt-6 max-w-7xl rounded-3xl border border-brand-border bg-brand-surface p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-accent/10 text-brand-accent"><ShieldCheck size={21} /></span>
          <h3 className="mt-4 text-xl font-black">Verify your seller identity</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-text-secondary">Choose one secure identity check for public Marketplace selling. Plugsy only stores the verification status and reference — never your BVN, NIN or selfie.</p>
        </div>
        {verified && <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-500"><CheckCircle2 size={15} /> Verified</span>}
      </div>

      {pending ? (
        <div className="mt-6 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-brand-text-secondary">
          <strong className="text-brand-text-primary">Verification is being checked.</strong> Prembly has not returned a final result yet. A retry will open automatically after five minutes.
        </div>
      ) : !verified && (
        <div className="mt-6">
          {retryAvailable && <div className="mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-brand-text-secondary"><strong className="text-brand-text-primary">Your previous attempt expired.</strong> It is safe to submit a fresh selfie now.</div>}
          <div className="grid gap-4 lg:grid-cols-[1fr_.95fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((option) => (
              <button key={option.id} type="button" onClick={() => setMethod(option.id)} className={`rounded-2xl border p-4 text-left transition ${method === option.id ? 'border-brand-accent bg-brand-accent/5 shadow-sm' : 'border-brand-border hover:border-brand-accent/40'}`}>
                <strong className="text-sm">{option.title}</strong>
                <p className="mt-2 text-xs leading-5 text-brand-text-secondary">{option.description}</p>
              </button>
            ))}
          </div>

          <div className="space-y-4 rounded-2xl border border-brand-border bg-brand-bg/50 p-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-[.14em] text-brand-text-secondary">Your {numberLabel}</span>
              <input inputMode="numeric" maxLength={11} value={number} onChange={(event) => setNumber(event.target.value.replace(/\D/g, ''))} placeholder={`Enter 11-digit ${numberLabel}`} className="h-12 w-full rounded-xl border border-brand-border bg-brand-surface px-4 text-sm outline-none focus:border-brand-accent" />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-brand-border bg-brand-surface p-3.5">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-accent/10 text-brand-accent"><Camera size={17} /></span>
                <span className="min-w-0">
                  <strong className="block truncate text-xs">{preparingSelfie ? 'Preparing your selfie…' : selfie ? selfie.name : 'Take or upload a selfie'}</strong>
                  <span className="mt-1 block text-[10px] text-brand-text-secondary">JPG or PNG · automatically optimized</span>
                </span>
              </span>
              <span className="text-xs font-black text-brand-accent">Choose</span>
              <input type="file" accept="image/jpeg,image/png" capture="user" className="hidden" onChange={(event) => void chooseSelfie(event)} />
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-brand-text-secondary">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-brand-accent" />
              <span>I confirm this is my identity number and current selfie. I consent to Prembly processing them for identity verification.</span>
            </label>
            <button type="button" disabled={busy || preparingSelfie} onClick={() => void submit()} className="btn-primary flex h-12 w-full items-center justify-center gap-2 text-xs font-black uppercase tracking-wider disabled:opacity-50">
              {busy ? <><Loader2 size={16} className="animate-spin" />Checking identity…</> : `Verify with ${selected.title}`}
            </button>
          </div>
          </div>
        </div>
      )}
    </section>
  );
}
