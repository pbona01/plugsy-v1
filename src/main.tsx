import React, {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import App from './App.tsx';
import './index.css';
import { ThemeProvider, useTheme } from './lib/ThemeContext';
import { HelmetProvider } from 'react-helmet-async';

// Vite emits this event when a preloaded hashed module is no longer available
// after a deployment. Reloading once obtains a matching HTML shell and avoids
// presenting a blank route to the user.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const key = "plugsy-vite-preload-reload";
  if (sessionStorage.getItem(key) !== window.location.href) {
    sessionStorage.setItem(key, window.location.href);
    window.location.reload();
  }
});

function ThemedClerkProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  // Cloudinary startup checks
  if (typeof window !== 'undefined') {
    if (!import.meta.env.VITE_CLOUDINARY_CLOUD_NAME) {
      console.warn("Missing VITE_CLOUDINARY_CLOUD_NAME. Uploads will fail.");
    }
    if (!import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET) {
      console.warn("Missing VITE_CLOUDINARY_UPLOAD_PRESET. Uploads will fail.");
    }
  }
  
  // Vite PWA owns the single root-scope worker (`/sw.js`). It imports the
  // OneSignal and badge helpers, so registering a second root worker here
  // would race OneSignal and intermittently disable web push.

  // Use the key from environment, falling back only if strictly missing
  const PUBLISHABLE_KEY = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || 
                         (typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY : undefined))?.trim();
  
  if (!PUBLISHABLE_KEY) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070707] font-sans">
        <div className="text-white text-center p-8">
          <p className="text-red-500 font-bold mb-2 uppercase tracking-widest text-xs">Environment Error</p>
          <h1 className="text-xl font-bold">Clerk Publishable Key is missing</h1>
          <p className="text-gray-500 text-sm mt-4 max-w-xs mx-auto">
            Please configure <span className="font-mono text-white">VITE_CLERK_PUBLISHABLE_KEY</span> in your environment.
          </p>
        </div>
      </div>
    );
  }
  
  const isLiveKey = PUBLISHABLE_KEY.startsWith('pk_live');
  const isProductionDomain = window.location.hostname === 'plugsy.ng' || window.location.hostname.endsWith('.plugsy.ng');
  const isAISPreview = window.location.hostname.includes('run.app') || 
                       window.location.hostname.includes('webcontainer') ||
                       window.location.hostname.includes('localhost') || 
                       window.location.hostname.includes('127.0.0.1') ||
                       window.location.hostname.includes('github.dev');

  const [clerkError, setClerkError] = React.useState(false);
  const [bypassed, setBypassed] = React.useState(() => {
    try {
      return localStorage.getItem('clerk_domain_bypass') === 'true';
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    const handleDomainLockError = () => {
      if (isProductionDomain) return; // Never lock or show domain gate on production live domain
      setClerkError(true);
      try {
        localStorage.removeItem('clerk_domain_bypass');
      } catch (err) {}
      setBypassed(false);
    };

    const handleError = (event: ErrorEvent) => {
      const msg = event?.message || '';
      if (
        msg.includes('Can only be used on:') || 
        msg.includes('plugsy.ng') || 
        msg.toLowerCase().includes('clerkjs')
      ) {
        handleDomainLockError();
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason;
      const reasonText = typeof reason === 'string' ? reason : reason?.message || '';
      if (
        reasonText.includes('Can only be used on:') || 
        reasonText.includes('plugsy.ng') || 
        reasonText.toLowerCase().includes('clerkjs')
      ) {
        handleDomainLockError();
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  const handleBypass = () => {
    try {
      localStorage.setItem('clerk_domain_bypass', 'true');
    } catch (e) {}
    setBypassed(true);
    setClerkError(false);
  };

  // If we are in preview but using live keys (or Clerk has actively rejected the domain),
  // we show a professional, helpful domain gate page with clear steps.
  // CRITICAL: Never show this on custom production domains (when isAISPreview is false) or on plugsy.ng
  if (isAISPreview && !isProductionDomain && (clerkError || (isLiveKey && !bypassed))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070707] p-6 text-center font-sans text-white">
        <div className="max-w-md w-full bg-[#111115] border border-white/10 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
          {/* Subtle gradient light background decorative element */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#EF4444]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-[#EF4444]/5 rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-6 relative z-10">
            {/* Warning Shield/Alert Icon */}
            <div className="w-16 h-16 bg-[#EF4444]/10 rounded-full flex items-center justify-center mx-auto border border-[#EF4444]/20">
              <svg className="w-8 h-8 text-[#EF4444]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-black tracking-tight text-white uppercase sm:text-3xl">Domain Restrict Warning</h1>
              <p className="text-xs font-semibold text-[#EF4444] uppercase tracking-widest">
                {clerkError ? "Clerk Connection Blocked - Active" : "Clerk Production Key Active"}
              </p>
            </div>

            <p className="text-gray-400 text-sm leading-relaxed max-w-sm mx-auto">
              {clerkError ? (
                <span>
                  Clerk has actively rejected authentication requests from this sandbox environment because the key being used is strict-locked to <span className="text-white font-medium">https://www.plugsy.ng</span>.
                </span>
              ) : (
                <span>
                  Live user database keys are strictly locked to <span className="text-white font-medium">https://www.plugsy.ng</span>. 
                  Running the preview here triggers Clerk's origin protection filter.
                </span>
              )}
            </p>

            <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl text-left space-y-3">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">How to resolve:</p>
              <ul className="text-xs text-gray-400 space-y-2.5 list-disc pl-4 leading-normal">
                <li>
                  <span className="text-white font-medium">Configure Clerk Test Keys:</span> Go to AI Studio secrets (the Settings menu) and modify <code className="text-red-400 bg-red-400/10 px-1 py-0.5 rounded font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> to use your <span className="text-emerald-400 font-semibold">Development/Test key</span> (<code className="font-mono">pk_test_...</code>).
                </li>
                <li>
                  <span className="text-white font-medium">Access Production:</span> To use actual live customer credentials and production logins, navigate to the fully functional live site at <a href="https://www.plugsy.ng" target="_blank" rel="noopener noreferrer" className="text-red-400 font-semibold hover:underline">www.plugsy.ng</a>.
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-2 pt-2 sm:flex-row justify-center">
              <button
                onClick={handleBypass}
                className="flex-1 px-6 py-3 bg-white/5 hover:bg-white/10 active:scale-95 text-white rounded-full font-bold text-xs uppercase tracking-wider border border-white/10 transition-all cursor-pointer"
              >
                Proceed to App
              </button>
              {clerkError && (
                <button
                  onClick={() => {
                    setClerkError(false);
                    setBypassed(false);
                    window.location.reload();
                  }}
                  className="flex-1 px-6 py-3 bg-[#EF4444] hover:bg-[#D93838] active:scale-95 text-white rounded-full font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Reload & Retry
                </button>
              )}
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-white/5 text-[9px] text-gray-600 font-mono">
            Origin Host: {window.location.hostname}
          </div>
        </div>
      </div>
    );
  }

  // If there's a custom domain DNS failure, users can provide a fallback via environment
  let fallbackApi = (import.meta.env.VITE_CLERK_FRONTEND_API || 
                            (typeof process !== 'undefined' ? process.env?.VITE_CLERK_FRONTEND_API : undefined))?.trim();

  // Force fallback to .accounts.dev URL directly by decoding the Publishable Key
  // This bypasses the custom domain entirely for DNS propagation issues
  if (!fallbackApi && PUBLISHABLE_KEY) {
    try {
      const parts = PUBLISHABLE_KEY.split('_');
      if (parts.length >= 3) {
        const decoded = atob(parts[2]);
        if (decoded && decoded.endsWith('$')) {
          fallbackApi = decoded.slice(0, -1);
        }
      }
    } catch (e) {
      console.warn("Failed to decode Clerk publishable key for fallback API");
    }
  }

  return (
    <ClerkProvider 
      publishableKey={PUBLISHABLE_KEY} 
      frontendApi={fallbackApi}
      afterSignOutUrl="/"
      fallbackRedirectUrl="/dashboard"
      forceRedirectUrl="/dashboard"
      appearance={{
        baseTheme: theme === 'dark' ? dark : undefined,
      }}
      clerkJSUrl="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js"
    >
      {children}
    </ClerkProvider>
  );
}

// Suppress THREE.Clock deprecation warning triggered internally by @react-three/fiber
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('THREE.Clock: This module has been deprecated')) {
    return;
  }
  originalWarn(...args);
};

// Suppress benign WebSocket errors in the AI Studio environment
const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && (
    args[0].includes('WebSocket closed without opened') ||
    args[0].includes('failed to connect to websocket')
  )) {
    return;
  }
  originalError(...args);
};

window.addEventListener('unhandledrejection', (event) => {
  const reasonText = typeof event.reason === 'string' ? event.reason : event.reason?.message || '';
  if (
    reasonText.includes('WebSocket closed without opened') ||
    reasonText.includes('failed to connect to websocket')
  ) {
    event.preventDefault();
    console.warn('Suppressed benign WebSocket error:', reasonText);
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <ThemeProvider>
        <ThemedClerkProvider>
          <App />
        </ThemedClerkProvider>
      </ThemeProvider>
    </HelmetProvider>
  </StrictMode>,
);
