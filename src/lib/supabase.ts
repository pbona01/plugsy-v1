import { createClient } from '@supabase/supabase-js';

const getEnv = (key: string) => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return undefined;
};

const rawUrl = (
  getEnv('NEXT_PUBLIC_SUPABASE_URL') ||
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_URL) ||
  getEnv('VITE_SUPABASE_URL') || 
  'https://vnilkycbtxxcyoynakge.supabase.co'
).trim();
const supabaseUrl = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
const supabaseAnonKey = (
  getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
  getEnv('VITE_SUPABASE_ANON_KEY') || 
  'sb_publishable_6krQD2xCzjSLtaol0F0YNg_bCk3ZpNa'
).trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL ERROR: Supabase credentials missing from Environment Variables. Application functionality will be severely limited.');
} else {
  // Check if keys look valid
  if (supabaseAnonKey.startsWith('sbp_')) {
    console.info('Supabase Config: Using newer sbp_ key format.');
  } else {
    const parts = supabaseAnonKey.split('.');
    if (parts.length !== 3) {
      console.warn(`Supabase Config: Anon key has ${parts.length} parts. Standard JWTs should have 3. This may cause 'Expected 3 parts in JWT' errors.`);
    }
  }
}

// Ensure singleton pattern for dev hot-reloading
let supabaseToken: string | null = null;
let lastTokenUpdate = 0;
let getTokenFn: ((options?: { template?: string }) => Promise<string | null>) | null = null;

console.log("[supabase-init] URL:", JSON.stringify(supabaseUrl));
console.log("[supabase-init] URL length:", supabaseUrl?.length);
console.log("[supabase-init] Anon key length:", supabaseAnonKey?.length);
console.log("[supabase-init] URL starts with https:", supabaseUrl?.startsWith("https://"));
console.log("[supabase-init] URL ends with slash:", supabaseUrl?.endsWith("/"));

export const supabase = (globalThis as any).supabaseInstance || createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    },
    heartbeatIntervalMs: 15000,
    timeout: 20000,
    transport: undefined // let it auto-select, but log below
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  },
  global: {
    headers: {
      apikey: supabaseAnonKey,
    },
    fetch: async (url, options: any = {}) => {
      // Auto-refresh token if it's nearing expiry or missing, and we have the getToken function
      const now = Date.now();
      if (getTokenFn && (!supabaseToken || (now - lastTokenUpdate > 50000))) {
        try {
          let token = await getTokenFn({ template: 'supabase' }).catch(() => null);
          if (!token) {
             token = await getTokenFn({ template: 'Supabase' }).catch(() => null);
          }
          if (token) {
            supabaseToken = token;
            lastTokenUpdate = now;
          }
        } catch (e: any) {
          console.warn("Supabase fetch auto-token refresh failed:", e.message);
        }
      }

      // Convert headers to a plain object to ensure compatibility with all fetch implementations
      let incomingHeaders: Record<string, string> = {};
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          incomingHeaders[key.toLowerCase()] = value;
        });
      } else if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          incomingHeaders[key.toLowerCase()] = String(value);
        });
      }
      
      // CRITICAL: Always ensure apikey is present
      const finalHeaders: Record<string, string> = {
        ...incomingHeaders,
        'apikey': supabaseAnonKey,
      };

      // Helper to check for valid Supabase-compatible JWT (for Clerk user tokens) with expiration check
      const isUserJWT = (token: string | null) => {
        if (!token) return false;
        const parts = token.split('.');
        if (parts.length !== 3 || !token.startsWith('eyJ')) {
          return false;
        }
        try {
          const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
          const payload = JSON.parse(payloadJson);
          const nowInSecs = Math.floor(Date.now() / 1000);
          if (payload.exp && payload.exp < (nowInSecs + 10)) {
            return false; // Expired or close to expired
          }
          return true;
        } catch (e) {
          return false;
        }
      };

      if (isUserJWT(supabaseToken)) {
        finalHeaders['Authorization'] = `Bearer ${supabaseToken}`;
        delete finalHeaders['authorization'];
      } else {
        // Fallback to anon key if JWT absent, expired, or malformed
        finalHeaders['Authorization'] = `Bearer ${supabaseAnonKey}`;
        delete finalHeaders['authorization'];
      }

      options.headers = finalHeaders;
      return fetch(url, options);
    },
  },
});

export const setSupabaseAuth = async (getToken: (options?: { template?: string }) => Promise<string | null>, force = false) => {
  getTokenFn = getToken;
  
  // Throttle refreshes unless forced
  const now = Date.now();
  if (!force && supabaseToken && (now - lastTokenUpdate < 50000)) {
    return;
  }

  try {
    let token = await getToken({ template: 'supabase' }).catch(() => null);
    if (!token) {
        token = await getToken({ template: 'Supabase' }).catch(() => null);
    }
    const isUserJWT = (t: string | null) => {
      if (!t) return false;
      const parts = t.split('.');
      return parts.length === 3 && t.startsWith('eyJ');
    };

    if (token) {
      if (isUserJWT(token)) {
        supabaseToken = token;
        lastTokenUpdate = now;
      } else {
        console.warn("Supabase Auth: Token received from Clerk is a JWE (e.g., 5 parts) or invalid. Ensure you have a 'supabase' JWT template created in your Clerk Dashboard.");
        supabaseToken = null; // Forces fallback to anonKey
      }
      
      if ((supabase as any).rest) {
        const headers = (supabase as any).rest.headers || {};
        headers['apikey'] = supabaseAnonKey;
        
        if (isUserJWT(token)) {
          headers['Authorization'] = `Bearer ${token}`;
          delete headers['authorization'];
        } else {
          headers['Authorization'] = `Bearer ${supabaseAnonKey}`;
          delete headers['authorization'];
        }
      }
      
      // Update realtime connection auth
      if ((supabase as any).realtime) {
         (supabase as any).realtime.setAuth(isUserJWT(token) ? token : supabaseAnonKey);
      }
    }
  } catch (error: any) {
    if (error.message?.includes('No JWT template exists') || error.message?.includes('template') || error.message?.includes('JWT')) {
      console.warn("CRITICAL: Clerk Supabase JWT template ('supabase') is missing or invalid. To fix 'No suitable key' errors, you MUST create a JWT template named 'supabase' in your Clerk Dashboard.");
      
      supabaseToken = null;
      lastTokenUpdate = now;

      if ((supabase as any).rest) {
        const restHeaders = (supabase as any).rest.headers || {};
        restHeaders['apikey'] = supabaseAnonKey;
        restHeaders['Authorization'] = `Bearer ${supabaseAnonKey}`;
        delete restHeaders['authorization'];
      }
      if ((supabase as any).realtime) {
         (supabase as any).realtime.setAuth(supabaseAnonKey);
      }
    } else {
      console.error("Error setting Supabase auth:", error);
    }
  }
};

if (import.meta.env.DEV) {
  (globalThis as any).supabaseInstance = supabase;
}

// Add global debug listener
if (supabase.realtime) {
  const socketAdapter = (supabase.realtime as any).socketAdapter;
  if (socketAdapter && typeof socketAdapter.onOpen === 'function') {
    socketAdapter.onOpen(() => {
       console.log("[realtime-global] ✅ WebSocket OPENED")
    })
    socketAdapter.onClose(() => {
       console.log("[realtime-global] ❌ WebSocket CLOSED")
    })
    socketAdapter.onError((err: any) => {
       console.warn("[realtime-global] ❌ WebSocket ERROR:", err)
    })
  } else if (typeof (supabase.realtime as any).onOpen === 'function') {
    (supabase.realtime as any).onOpen(() => {
       console.log("[realtime-global] ✅ WebSocket OPENED")
    })
    (supabase.realtime as any).onClose(() => {
       console.log("[realtime-global] ❌ WebSocket CLOSED")
    })
    (supabase.realtime as any).onError((err: any) => {
       console.warn("[realtime-global] ❌ WebSocket ERROR:", err)
    })
  }
}
