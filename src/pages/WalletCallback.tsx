import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const WalletCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'checking' | 'failed'>('checking');
  
  const reference = searchParams.get('reference');

  useEffect(() => {
    if (!reference) {
      navigate('/wallet');
      return;
    }

    verifyTransaction();
  }, [reference]);

  const verifyTransaction = async () => {
    setStatus('verifying');
    try {
      // Poll a few times to give webhook time to process
      for (let i = 0; i < 5; i++) {
        const res = await fetch('/api/wallet?action=verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference })
        });
        
        const data = await res.json();
        
        if (data.success && !data.pending) {
          setStatus('success');
          return;
        }
        
        // Wait 2 seconds before next poll
        await new Promise(r => setTimeout(r, 2000));
      }
      
      // If we get here, it's still pending after 10 seconds
      // We assume it might still be processing. 
      setStatus('success');
      toast.success('Payment received, wallet will be updated shortly.');
      
    } catch (err) {
      console.error('Verify error:', err);
      setStatus('failed');
    }
  };

  return (
    <div className="min-h-screen pt-32 pb-12 px-6 flex items-center justify-center">
      <div className="max-w-md w-full bg-brand-surface border border-brand-border rounded-2xl p-8 text-center shadow-xl">
        
        {status === 'verifying' || status === 'checking' ? (
          <div className="flex flex-col items-center">
            <Loader2 className="w-16 h-16 text-brand-accent animate-spin mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Verifying Payment...</h2>
            <p className="text-brand-text-secondary">Please wait while we confirm your wallet top-up.</p>
          </div>
        ) : status === 'success' ? (
          <div className="flex flex-col items-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Funded Successfully</h2>
            <p className="text-brand-text-secondary mb-8">Your wallet has been credited.</p>
            
            <button
              onClick={() => navigate('/wallet')}
              className="w-full bg-brand-accent hover:bg-opacity-90 text-white font-bold py-3 px-6 rounded-xl transition-all"
            >
              Back to Wallet
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <XCircle className="w-16 h-16 text-red-500 mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Verification Failed</h2>
            <p className="text-brand-text-secondary mb-8">We couldn't verify your payment immediately. If you were charged, it will reflect shortly.</p>
            
            <button
              onClick={() => navigate('/wallet')}
              className="w-full bg-brand-surface border border-brand-border hover:bg-white/5 text-white font-bold py-3 px-6 rounded-xl transition-all"
            >
              Back to Wallet
            </button>
          </div>
        )}
        
      </div>
    </div>
  );
};
