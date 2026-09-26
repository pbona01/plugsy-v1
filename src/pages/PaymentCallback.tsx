import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { ArrowRight, CheckCircle2, Clock3, Loader2, ShieldCheck } from 'lucide-react';

export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isLoaded, userId, getToken } = useAuth();
  
  const [status, setStatus] = useState<'verifying' | 'success' | 'pending' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState('');
  const [deliveryPath, setDeliveryPath] = useState('/chat');

  const reference = searchParams.get('reference');

  useEffect(() => {
    if (!isLoaded) return;
    
    if (!reference) {
      navigate('/dashboard', { replace: true });
      return;
    }

    const verifyPayment = async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/payments?action=verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reference })
        });
        
        const data = await res.json();
        
        if (res.ok && data.success && !data.pending) {
          setStatus('success');
          
          const order = data.order;
          let targetPath = '/chat';
          
          if (order?.product_name?.toLowerCase().includes('medal')) {
            targetPath = '/medals?success=medal';
          }
          setDeliveryPath(targetPath);

          setTimeout(() => {
            navigate(targetPath, { replace: true });
          }, 2000);
        } else if (res.ok && data.success && data.pending) {
          setStatus('pending');
        } else {
          setStatus('error');
          setErrorMessage(data.error || "Payment verification failed");
        }
      } catch (err: any) {
        console.error("Verification connection error");
        setStatus('error');
        setErrorMessage(err.message || "Network error. Please try again or contact support.");
      }
    };
    
    verifyPayment();
  }, [isLoaded, reference, navigate, userId, getToken]);
  
  return (
    <main className="grid min-h-[75vh] place-items-center bg-brand-bg px-4 py-10 text-brand-text">
      <section aria-live="polite" className="w-full max-w-md rounded-3xl border border-brand-border bg-brand-surface p-6 text-center shadow-xl sm:p-8">
        
        {status === 'verifying' && (
          <div className="flex flex-col items-center">
            <Loader2 className="mb-6 animate-spin text-brand-accent" size={42} aria-hidden="true" />
            <h1 className="text-xl font-black">Confirming your payment</h1>
            <p className="mt-2 text-sm text-brand-text-secondary">Please keep this page open while we check your order.</p>
          </div>
        )}
        
        {status === 'success' && (
          <div className="flex flex-col items-center">
            <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-500"><CheckCircle2 size={30} aria-hidden="true" /></span>
            <h1 className="text-2xl font-black">Payment confirmed</h1>
            <p className="mt-3 text-sm leading-6 text-brand-text-secondary">{deliveryPath.startsWith('/medals')?'Your medal is ready to view.':'Your order is saved. Open Plugsy Chat for your CapCut login details and delivery updates.'}</p>
            <button onClick={() => navigate(deliveryPath, { replace: true })} className="btn-primary mt-6 flex h-12 w-full items-center justify-center gap-2 text-sm font-bold">{deliveryPath.startsWith('/medals')?'View your medal':'Open Plugsy Chat'} <ArrowRight size={17}/></button>
          </div>
        )}
        
        {status === 'pending' && <div className="flex flex-col items-center"><Clock3 className="mb-5 text-amber-500" size={38} aria-hidden="true"/><h1 className="text-xl font-black">Order is processing</h1><p className="mt-3 text-sm leading-6 text-brand-text-secondary">Your payment was recorded. We'll show your delivery in Plugsy Chat when it's ready.</p><button onClick={() => navigate('/chat')} className="btn-primary mt-6 h-12 w-full text-sm font-bold">View Plugsy Chat</button></div>}
        {status === 'error' && (
          <div className="flex flex-col items-center">
            <ShieldCheck className="mb-5 text-red-500" size={38} aria-hidden="true"/>
            <h1 className="text-xl font-black">We couldn't confirm your payment</h1>
            <p className="mt-2 text-sm text-brand-text-secondary">{errorMessage}</p>
            <p className="mt-3 text-xs text-brand-text-secondary">If money left your wallet, contact support with reference {reference}. Please don't pay again until your order is checked.</p>
            <button 
              onClick={() => navigate('/dashboard')}
              className="btn-primary mt-6 h-12 w-full text-sm font-bold"
            >
              Go to Dashboard
            </button>
          </div>
        )}
        
      </section>
    </main>
  );
}
