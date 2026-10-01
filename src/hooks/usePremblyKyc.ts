import { useCallback, useEffect } from 'react';

const SCRIPT_ID = 'prembly-identity-kyc-script';
const SCRIPT_URL = 'https://js.prembly.com/v1/inline/widget-v3.js';
let loadPromise: Promise<void> | null = null;

type PremblyConfig = {
  first_name?: string;
  last_name?: string;
  email: string;
  widget_key: string;
  widget_id: string;
  user_ref?: string;
  is_test?: boolean;
  metadata?: Record<string, unknown>;
  callback: (response: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    IdentityKYC?: { verify: (config: PremblyConfig) => void };
  }
}

const loadPrembly = () => {
  if (window.IdentityKYC?.verify) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing || document.createElement('script');
    const finish = () => window.IdentityKYC?.verify ? resolve() : reject(new Error('Prembly verification did not load.'));
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => {
      loadPromise = null;
      reject(new Error('Prembly verification could not be loaded.'));
    }, { once: true });
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
    window.setTimeout(() => {
      if (window.IdentityKYC?.verify) resolve();
      else {
        loadPromise = null;
        reject(new Error('Prembly verification took too long to load.'));
      }
    }, 12_000);
  });
  return loadPromise;
};

export default function usePremblyKyc(config: PremblyConfig) {
  useEffect(() => { void loadPrembly().catch(() => undefined); }, []);
  return useCallback(async () => {
    try {
      await loadPrembly();
      window.IdentityKYC?.verify(config);
    } catch (error: any) {
      config.callback({ code: 'E00', status: 'failed', message: error?.message || 'Prembly verification could not be opened.' });
    }
  }, [config]);
}
