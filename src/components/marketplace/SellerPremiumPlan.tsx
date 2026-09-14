import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { marketplaceAttempt, clearMarketplaceAttempt } from '../../utils/marketplaceAttempt.js';

export default function SellerPremiumPlan({ seller, onComplete }: { seller: any; onComplete: () => Promise<void> }) {
  const { userId, getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const expires = seller?.public_plan_expires_at ? new Date(seller.public_plan_expires_at) : null;
  const active = seller?.public_selling_enabled && expires && expires.getTime() > Date.now();
  const activate = async () => {
    if (!userId || busy || !window.confirm('Pay ₦1,500 from your Plugsy Wallet for one month of public marketplace publishing? Private listings remain free. This is not an automatic renewal.')) return;
    setBusy(true);
    try {
      const key = marketplaceAttempt(localStorage, userId, 'seller-premium');
      const token = await getToken();
      const response = await fetch('/api/marketplace?action=activate-premium', {
        method: 'POST', headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: key, acceptedTermsVersion: 'marketplace-premium-v1' }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Plan activation failed.');
      clearMarketplaceAttempt(localStorage, userId, 'seller-premium');
      toast.success('Public seller plan activated.');
      await onComplete();
    } catch (error: any) { toast.error(error.message || 'Plan activation failed.'); }
    finally { setBusy(false); }
  };
  return <section className="mx-auto mt-6 max-w-7xl rounded-2xl border border-brand-accent/25 bg-brand-surface p-5">
    <h3 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck size={20} /> Premium public publishing</h3>
    <p className="mt-2 text-sm text-brand-text-secondary">₦1,500 for one month. Only needed to publish in the public marketplace. Private product links are free. No automatic renewal.</p>
    <p className="mt-3 text-xs text-brand-text-secondary">{active ? `Active until ${expires!.toLocaleDateString()}.` : 'Seller verification is required before activating this plan.'} Expiry does not remove products already purchased from buyer libraries.</p>
    <button onClick={() => void activate()} disabled={busy || active || seller?.verification_status !== 'verified'} className="btn-primary mt-4 h-11 px-5 text-sm disabled:opacity-50">{busy ? 'Activating…' : active ? 'Plan active' : 'Activate for ₦1,500'}</button>
    <p className="mt-2 text-xs text-brand-text-secondary">Paid activation stays disabled during the marketplace preview.</p>
  </section>;
}
