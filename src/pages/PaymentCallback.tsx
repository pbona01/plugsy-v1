import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { supabase } from '../lib/supabase';

export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isLoaded, userId } = useAuth();
  
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  const reference = searchParams.get('reference');

  useEffect(() => {
    if (!isLoaded) return;
    
    if (!reference) {
      navigate('/dashboard', { replace: true });
      return;
    }

    const verifyPayment = async () => {
      try {
        const res = await fetch('/api/payments?action=verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference })
        });
        
        const text = await res.text();
        console.log("[callback] raw:", text);
        
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error("Invalid server response format");
        }
        
        if (data.success || data.alreadyProcessed) {
          setStatus('success');
          
          const order = data.order;
          let targetPath = '/chat';
          
          if (order?.product_name?.toLowerCase().includes('medal')) {
            targetPath = '/medals?success=medal';
          }

          setTimeout(() => {
            navigate(targetPath, { replace: true });
          }, 2000);
        } else {
          setStatus('error');
          setErrorMessage(data.error || "Payment verification failed");
        }
      } catch (err: any) {
        console.error("Verification connection error:", err);
        setStatus('error');
        setErrorMessage(err.message || "Network error. Please try again or contact support.");
      }
    };
    
    verifyPayment();
  }, [isLoaded, reference, navigate, userId]);
  
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full p-8 border rounded-xl shadow-sm bg-[var(--brand-card)] border-[var(--brand-border)]">
        
        {status === 'verifying' && (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6" />
            <h2 className="text-xl font-bold text-[var(--brand-text)] capitalize">Verifying Your Payment...</h2>
            <p className="text-gray-500 mt-2">Please do not close this window.</p>
          </div>
        )}
        
        {status === 'success' && (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-2xl font-bold text-[var(--brand-text)]">✅ Payment Confirmed!</h2>
            <p className="text-gray-500 mt-3 mb-2">Redirecting to chat to get your order...</p>
          </div>
        )}
        
        {status === 'error' && (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
            <h2 className="text-xl font-bold text-red-600">Verification Error</h2>
            <p className="text-[var(--brand-text-secondary)] mt-2 mb-6">{errorMessage}</p>
            <button 
              onClick={() => navigate('/dashboard')}
              className="bg-[var(--brand-text)] text-[var(--brand-bg)] font-semibold tracking-tight py-3 px-6 rounded-lg hover:opacity-90 w-full"
            >
              Go to Dashboard
            </button>
          </div>
        )}
        
      </div>
    </div>
  );
}
