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

const removeFailedScript = (script: HTMLScriptElement) => {
  script.dataset.premblyState = 'failed';
  script.remove();
  loadPromise = null;
};

export const loadPrembly = () => {
  if (window.IdentityKYC?.verify) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const existingNode = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const existing = existingNode?.dataset.premblyState === 'failed' ? null : existingNode;
    if (!existing && existingNode) existingNode.remove();
    const script = existing || document.createElement('script');
    let settled = false;
    let timeout = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (window.IdentityKYC?.verify) {
        script.dataset.premblyState = 'loaded';
        resolve();
      } else {
        removeFailedScript(script);
        reject(new Error('Prembly verification did not load. Please try again.'));
      }
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      removeFailedScript(script);
      reject(new Error('Prembly verification could not be loaded. Please check your connection and try again.'));
    };
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', fail, { once: true });
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.dataset.premblyState = 'loading';
      document.head.appendChild(script);
    }
    timeout = window.setTimeout(() => {
      if (window.IdentityKYC?.verify) finish();
      else fail();
    }, 15_000);
  });
  return loadPromise;
};

export default function usePremblyKyc(config: PremblyConfig) {
  useEffect(() => { void loadPrembly().catch(() => undefined); }, []);
  return useCallback(async () => {
    try {
      await loadPrembly();
      if (!window.IdentityKYC?.verify) throw new Error('Prembly verification is not ready. Please try again.');
      window.IdentityKYC.verify(config);
    } catch (error: any) {
      config.callback({ code: 'E00', status: 'failed', message: error?.message || 'Prembly verification could not be opened.' });
    }
  }, [config]);
}
