import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export default function MarketplaceGuestCheckout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "pending" | "failed">("checking");
  const reference = params.get("reference") || params.get("tx_ref") || "";
  useEffect(() => {
    if (!reference) { setStatus("failed"); return; }
    let cancelled = false;
    const verify = async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, attempt * 1800));
        const response = await fetch(`/api/marketplace?action=verify-guest-checkout&reference=${encodeURIComponent(reference)}`, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (response.ok && payload?.success && payload.deliveryToken) { navigate(`/marketplace/guest-delivery/${payload.deliveryToken}`, { replace: true }); return; }
        if (!payload?.pending) { setStatus("failed"); return; }
      }
      if (!cancelled) setStatus("pending");
    };
    void verify();
    return () => { cancelled = true; };
  }, [navigate, reference]);
  return <main className="grid min-h-screen place-items-center bg-brand-bg px-5 text-brand-text"><section className="w-full max-w-md rounded-3xl border border-brand-border bg-brand-surface p-8 text-center shadow-xl">{status === "checking" ? <><Loader2 className="mx-auto animate-spin text-brand-accent" size={42} /><h1 className="mt-6 text-2xl font-black">Confirming your payment</h1><p className="mt-2 text-sm leading-6 text-brand-text-secondary">Please keep this page open while we securely verify Flutterwave’s confirmation.</p></> : status === "pending" ? <><AlertCircle className="mx-auto text-amber-500" size={42} /><h1 className="mt-6 text-2xl font-black">Payment is still processing</h1><p className="mt-2 text-sm leading-6 text-brand-text-secondary">Your receipt will be sent as soon as Flutterwave confirms the payment. You can safely close this page.</p></> : <><CheckCircle2 className="mx-auto text-red-500" size={42} /><h1 className="mt-6 text-2xl font-black">We could not confirm this payment</h1><p className="mt-2 text-sm leading-6 text-brand-text-secondary">No download has been issued. If Flutterwave shows a successful payment, contact Plugsy support with your payment reference.</p></>}</section></main>;
}
