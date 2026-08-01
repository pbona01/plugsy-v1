import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export const WalletCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [status, setStatus] = useState<
    'checking' | 'verifying' | 'success' | 'pending' | 'failed'
  >('checking');

  const reference =
    searchParams.get('tx_ref') ||
    searchParams.get('reference');
  const providerTransactionId = searchParams.get('transaction_id');

  useEffect(() => {
    if (!reference) {
      navigate('/wallet');
      return;
    }

    void verifyTransaction();
  }, [reference]);

  const verifyTransaction = async () => {
    setStatus('verifying');

    try {
      const token = await getToken();

      if (!token) {
        setStatus('failed');
        toast.error('Your session expired. Please sign in again.');
        return;
      }

      const backoff = [0, 1500, 3000, 5000, 8000];
      for (let attempt = 0; attempt < backoff.length; attempt += 1) {
        if (backoff[attempt] > 0) {
          await new Promise((resolve) => setTimeout(resolve, backoff[attempt]));
        }
        const response = await fetch(
          '/api/wallet?action=verify',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ reference, transactionId: providerTransactionId }),
          },
        );

        const data = await response.json().catch(() => null);

        if (response.ok && data?.success && data.pending === false) {
          setStatus('success');
          return;
        }

        if (data?.pending === false) {
          setStatus('failed');
          return;
        }
      }

      setStatus('pending');
    } catch (error) {
      console.error('Verify error:', error);
      setStatus('pending');
    }
  };

  return (
    <div className="min-h-screen pt-32 pb-12 px-6 flex items-center justify-center">
      <div className="max-w-md w-full bg-brand-surface border border-brand-border rounded-2xl p-8 text-center shadow-xl">
        {status === 'verifying' || status === 'checking' ? (
          <div className="flex flex-col items-center">
            <Loader2 className="w-16 h-16 text-brand-accent animate-spin mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">
              Verifying Payment...
            </h2>
            <p className="text-brand-text-secondary">
              Please wait while we confirm your wallet top-up.
            </p>
          </div>
        ) : status === 'success' ? (
          <div className="flex flex-col items-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">
              Funded Successfully
            </h2>
            <p className="text-brand-text-secondary mb-8">
              Your wallet has been credited.
            </p>

            <button
              onClick={() => navigate('/wallet')}
              className="w-full bg-brand-accent hover:bg-opacity-90 text-white font-bold py-3 px-6 rounded-xl transition-all"
            >
              Back to Wallet
            </button>
          </div>
        ) : status === 'pending' ? (
          <div className="flex flex-col items-center">
            <AlertCircle className="w-16 h-16 text-amber-500 mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">
              Credit Processing
            </h2>
            <p className="text-brand-text-secondary mb-8">
              Confirmation is still processing. Your balance has not been changed yet.
            </p>

            <div className="space-y-3 w-full">
              <button
                onClick={() => void verifyTransaction()}
                className="w-full bg-brand-accent hover:bg-opacity-90 active:scale-[0.98] text-white font-bold py-3 px-6 rounded-xl transition-all"
              >
                Retry verification
              </button>
              <button
                onClick={() => navigate('/wallet')}
                className="w-full bg-brand-surface border border-brand-border hover:bg-white/5 active:scale-[0.98] text-white font-bold py-3 px-6 rounded-xl transition-all"
              >
                Back to Wallet
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <XCircle className="w-16 h-16 text-red-500 mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">
              Verification Failed
            </h2>
            <p className="text-brand-text-secondary mb-8">
              We could not confirm this funding attempt. No wallet credit
              is being claimed on this screen.
            </p>

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
