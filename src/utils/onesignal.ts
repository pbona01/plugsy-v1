import { supabase } from "../lib/supabase";

declare global {
  interface Window {
    OneSignal: any;
    OneSignalDeferred: any[];
  }
}

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || "d2a9e7fc-deb3-455d-ba8b-2a6c767d5547";

let isLocalInitialized = false;

const isAllowedDomain = (): boolean => {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".plugsy.ng") ||
    hostname === "plugsy.ng" ||
    hostname.endsWith(".run.app") ||
    hostname.endsWith(".aistudio.google")
  );
};

const isProdDomain = (): boolean => {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return hostname === "plugsy.ng" || hostname.endsWith(".plugsy.ng");
};

// 1. Initialize OneSignal
export const initOneSignal = (): Promise<void> => {
  return new Promise((resolve) => {
    if (!ONESIGNAL_APP_ID) {
      console.warn("[OneSignal] VITE_ONESIGNAL_APP_ID is missing from environment. Initialization skipped.");
      resolve();
      return;
    }

    if (typeof window === "undefined") {
      resolve();
      return;
    }

    if (!isAllowedDomain()) {
      console.warn(`[OneSignal] Initialization skipped on domain: ${window.location.hostname}. OneSignal is configured for https://www.plugsy.ng`);
      resolve();
      return;
    }

    if (isLocalInitialized) {
      resolve();
      return;
    }

    const setupAndInit = async () => {
      try {
        if ("serviceWorker" in navigator) {
          console.log("[OneSignal] Delaying initialization until PWA Service Worker is ready...");
          // Wait for service worker setup to complete to prevent race condition registrations
          // Use a timeout of 1500ms to prevent hanging indefinitely in development mode or offline states
          const swReadyPromise = navigator.serviceWorker.ready;
          const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1500));
          await Promise.race([swReadyPromise, timeoutPromise]);
          console.log("[OneSignal] PWA Service Worker check completed. Initializing SDK now...");
        }
      } catch (swErr) {
        console.warn("[OneSignal] Service worker ready check failed or timed out:", swErr);
      }

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function (OneSignal: any) {
        if (OneSignal.initialized || isLocalInitialized) {
          console.log("[OneSignal] Client already initialized.");
          isLocalInitialized = true;
          resolve();
          return;
        }
        try {
          const usePwaWorker = isProdDomain();
          await OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            notifyButton: { enable: false },
            allowLocalhostAsSecureOrigin: true,
            ...(usePwaWorker ? {
              serviceWorkerParam: { scope: "/" },
              serviceWorkerPath: "sw.js", // Compatible with custom workbox configs (relative path without leading slash)
            } : {})
          });

          isLocalInitialized = true;
          console.log(`[OneSignal] PWA SDK configured and initialized successfully (usePwaWorker: ${usePwaWorker}).`);
          
          // Initial sync if already subscribed
          const currentUserId = await getCurrentAuthUserId();
          if (currentUserId) {
            const subscribed = OneSignal.User?.pushSubscription?.id;
            if (subscribed) {
              console.log("[OneSignal] Already subscribed on init, syncing to DB...");
              syncSubscriptionToDatabase(currentUserId).catch(e => console.error("[OneSignal] Init sync failed:", e));
            }
          }

          // Listen to subscription change events to automatically sync with Supabase
          OneSignal.Notifications.addEventListener("permissionChange", async (permission: boolean) => {
            console.log("[OneSignal] Notification permission changed status:", permission);
            if (permission) {
              const currentUserId = await getCurrentAuthUserId();
              if (currentUserId) {
                await syncSubscriptionToDatabase(currentUserId);
              }
            }
          });

          // Add subscription state change listener for token renewal or loss recovery
          if (OneSignal.User?.pushSubscription) {
            OneSignal.User.pushSubscription.addEventListener("change", async (state: any) => {
              console.log("[OneSignal] Subscription state altered:", state);
              const currentUserId = await getCurrentAuthUserId();
              if (currentUserId) {
                await syncSubscriptionToDatabase(currentUserId);
              }
            });
          }

          resolve();
        } catch (e: any) {
          if (e && (e.message?.includes("already initialized") || String(e).includes("already initialized"))) {
            isLocalInitialized = true;
            resolve();
            return;
          }
          console.warn("[OneSignal] Gracefully skipped or failed client initialization:", e);
          resolve();
        }
      });
    };

    if (document.readyState === "complete" || document.readyState === "interactive") {
      setupAndInit();
    } else {
      window.addEventListener("DOMContentLoaded", setupAndInit);
    }
  });
};

// Helper to get active authenticated user's ID
const getCurrentAuthUserId = async (): Promise<string | null> => {
  try {
    // Check if Clerk is initialized and active
    if (typeof window !== "undefined" && (window as any).Clerk?.user) {
      return (window as any).Clerk.user.id || null;
    }
    // Fallback to Supabase auth session
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || null;
  } catch (err) {
    console.error("[OneSignal] Failed to retrieve active local auth user ID:", err);
    return null;
  }
};

// 2. Synchronize OneSignal playerId to both profiles and push_subscriptions
export const syncSubscriptionToDatabase = async (userId: string): Promise<boolean> => {
  if (!userId) return false;
  
  try {
    const playerId = await getPlayerId();
    if (!playerId) {
      console.warn("[OneSignal] No player ID detected on active registration client.");
      return false;
    }

    console.log("[OneSignal] Synchronizing push registration for User ID:", userId, "Player ID:", playerId);

    // a) Retrieve table schema dynamically using a quick profile check to see which columns exist to prevent DB errors
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .or(`id.eq.${userId},clerk_id.eq.${userId}`)
      .maybeSingle();

    if (profile) {
      const profileKeys = Object.keys(profile);
      const profileUpdates: any = {};

      if (profileKeys.includes("onesignal_id")) {
        profileUpdates.onesignal_id = playerId;
      }
      if (profileKeys.includes("onesignal_player_id")) {
        profileUpdates.onesignal_player_id = playerId;
      }
      
      // Update details where id matches User ID as Text
      if (Object.keys(profileUpdates).length > 0) {
        const queryField = profileKeys.includes("clerk_id") && profile.clerk_id === userId ? "clerk_id" : "id";
        const { error: profileErr } = await supabase
          .from("profiles")
          .update(profileUpdates)
          .eq(queryField, userId);

        if (profileErr) {
          console.error("[OneSignal] Profiles metadata sync failed:", profileErr.message);
        } else {
          console.log("[OneSignal] Saved player ID to profiles matching user.");
        }
      }
    }

    // b) Save to push_subscriptions using upsert
    // Let's identify which columns exist in push_subscriptions
    // We check via reading an existing single row, or assume classic defaults
    const { data: subSample } = await supabase
      .from("push_subscriptions")
      .select("*")
      .limit(1);

    const subKeys = subSample && subSample.length > 0 ? Object.keys(subSample[0]) : ["id", "user_id", "onesignal_player_id", "onesignal_id", "subscription", "updated_at"];

    const subscriptionPayload: any = {
      user_id: userId,
      subscription: { playerId },
      updated_at: new Date().toISOString()
    };

    if (subKeys.includes("onesignal_id")) {
      subscriptionPayload.onesignal_id = playerId;
    }
    if (subKeys.includes("onesignal_player_id")) {
      subscriptionPayload.onesignal_player_id = playerId;
    }
    if (subKeys.includes("user_role") && profile?.role) {
      subscriptionPayload.user_role = profile.role;
    }

    const { error: subErr } = await supabase
      .from("push_subscriptions")
      .upsert(subscriptionPayload, { onConflict: "user_id" });

    if (subErr) {
      console.error("[OneSignal] push_subscriptions sync failed:", subErr.message);
      return false;
    }

    localStorage.setItem("onesignal_subscribed", "true");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("onesignal_subscribed_state_changed", { 
        detail: { subscribed: true, playerId } 
      }));
    }
    console.log("[OneSignal] Saved subscription details to push_subscriptions.");
    return true;
  } catch (err) {
    console.error("[OneSignal] Exception while executing database synchronizer:", err);
    return false;
  }
};

// 3. Request subscription permission from client
export const requestNotificationPermission = async (userId?: string): Promise<boolean> => {
  try {
    if (typeof window === "undefined" || !window.OneSignal || !window.OneSignal.Notifications) {
      console.error("[OneSignal] Native browser context not fully resolved yet.");
      return false;
    }

    // Call native platform prompt
    await window.OneSignal.Notifications.requestPermission();
    
    // Slight pause to finish negotiation
    await new Promise((resolve) => setTimeout(resolve, 800));

    const isPermitted = window.OneSignal.Notifications.permission;
    console.log("[OneSignal] Dialog outcome permission:", isPermitted);

    if (isPermitted) {
      try {
        if (window.OneSignal.User?.pushSubscription) {
          console.log("[OneSignal] Opting in push subscription...");
          await window.OneSignal.User.pushSubscription.optIn();
        }
      } catch (optErr) {
        console.warn("[OneSignal] Auto opt-in failed:", optErr);
      }

      const activeUser = userId || (await getCurrentAuthUserId());
      if (activeUser) {
        syncSubscriptionToDatabase(activeUser).catch((err) => {
          console.error("[OneSignal] Background subscription sync failed:", err);
        });
      }
      return true;
    }
    return false;
  } catch (err) {
    console.error("[OneSignal] Error requesting permission:", err);
    return false;
  }
};

// 3.1 Repair push subscription and force re-registration
export const repairPushSubscription = async (userId: string): Promise<boolean> => {
  try {
    if (typeof window === "undefined" || !window.OneSignal) {
      console.warn("[OneSignal] OneSignal SDK is not loaded/available on this window context.");
      return false;
    }
    
    console.log("[OneSignal] Triggering repair and force re-registration of push subscription...");
    
    // Check permission state
    const isPermitted = window.OneSignal.Notifications.permission;
    if (!isPermitted) {
      console.warn("[OneSignal] Notifications permission not granted; requesting first.");
      const granted = await requestNotificationPermission(userId);
      if (!granted) return false;
    }

    // Explicitly call optIn to reoccur token exchange with FCM/APNS registries
    if (window.OneSignal.User?.pushSubscription) {
      console.log("[OneSignal] Re-registering channel with pushSubscription.optIn()...");
      await window.OneSignal.User.pushSubscription.optIn();
    }

    // Force register/update of Service Worker on the scope if possible to repair registration
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      console.log("[OneSignal] Repairing local Service Worker registration update flow...");
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        if (reg.active && (reg.active.scriptURL.includes("sw.js") || reg.active.scriptURL.includes("OneSignalSDK"))) {
          await reg.update().catch((swErr) => console.log("[OneSignal] SW registration update warning:", swErr));
        }
      }
    }

    // Pause to permit standard gateway negotiation with OneSignal CDN nodes
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Force sync newest device registration token details to remote Supabase DB schemas
    const success = await syncSubscriptionToDatabase(userId);
    console.log("[OneSignal] Repair subscription outcome success mapping:", success);
    return success;
  } catch (err) {
    console.error("[OneSignal] Repair operations failed:", err);
    return false;
  }
};

// 4. Return whether client is subscribed
export const isSubscribed = async (): Promise<boolean> => {
  try {
    if (typeof window === "undefined" || !window.OneSignal || !window.OneSignal.Notifications) {
      return false;
    }
    const permission = window.OneSignal.Notifications.permission;
    const playerId = window.OneSignal.User?.pushSubscription?.id;
    return !!(permission && playerId);
  } catch (e) {
    return false;
  }
};

// 5. Get current player ID from client User subscription
export const getPlayerId = async (): Promise<string | null> => {
  try {
    if (typeof window === "undefined" || !window.OneSignal) return null;
    
    // Poll to register properly if needed
    // More aggressive polling for the first few seconds
    for (let i = 0; i < 12; i++) {
      const id = window.OneSignal.User?.pushSubscription?.id;
      if (id) return id;
      
      // If we don't have an ID but have permission and aren't opted in, try to opt in
      if (window.OneSignal.Notifications?.permission && !window.OneSignal.User?.pushSubscription?.optedIn) {
        try {
          await window.OneSignal.User?.pushSubscription?.optIn();
        } catch (e) {
          console.warn("[OneSignal] Polling opt-in warning:", e);
        }
      }
      
      // Delays: 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200
      // Total wait: ~7.8 seconds
      await new Promise((resolve) => setTimeout(resolve, i * 100 + 100));
    }
    return window.OneSignal.User?.pushSubscription?.id || null;
  } catch (e) {
    return null;
  }
};

// 6. Direct client tool to trigger edge alert notifications
export const notifyUser = async (
  userId: string,
  title: string,
  message: string,
  url: string = "/dashboard",
  extraData: any = {}
): Promise<boolean> => {
  try {
    const rawUrl = import.meta.env.VITE_SUPABASE_URL || "https://vnilkycbtxxcyoynakge.supabase.co";
    const cleanUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
    const refId = cleanUrl.replace("https://", "").split(".")[0];
    const edgeUrl = `https://${refId}.supabase.co/functions/v1/send-notification`;

    const response = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        userId,
        title,
        message,
        url,
        data: {
          type: "reaction",
          ...extraData,
        },
      }),
    });
    return response.ok;
  } catch (err) {
    console.error("[OneSignal] Function trigger execution error:", err);
    return false;
  }
};

// 7. Clear PWA home screen icon unread badges and synchronize with SW
export const getUnreadCountFromDB = (): Promise<number> => {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve(0);
        return;
      }
      const request = indexedDB.open("plugsy-badge-db", 1);
      request.onsuccess = (event: any) => {
        const db = event.target.result;
        try {
          if (!db.objectStoreNames.contains("badge-store")) {
            resolve(0);
            return;
          }
          const transaction = db.transaction("badge-store", "readonly");
          const store = transaction.objectStore("badge-store");
          const getReq = store.get("unread-count");
          getReq.onsuccess = () => {
            resolve(getReq.result || 0);
          };
          getReq.onerror = () => resolve(0);
        } catch (e) {
          resolve(0);
        }
      };
      request.onerror = () => resolve(0);
    } catch (e) {
      resolve(0);
    }
  });
};

export const clearAppBadge = async (): Promise<void> => {
  try {
    // Restore document title to default clean state (remove preceding badges like (3))
    if (typeof document !== "undefined") {
      document.title = document.title.replace(/^\(\d+\)\s*/, "");
    }

    if (typeof navigator !== "undefined" && "clearAppBadge" in navigator) {
      await (navigator as any).clearAppBadge();
      console.log("[Badge] Client-side badge cleared successfully.");
    }
    
    // Notify the custom Service Worker script to clear stored IndexedDB unread count
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        if (registration.active) {
          registration.active.postMessage({ type: "CLEAR_BADGE" });
        }
      }
    }
  } catch (err) {
    console.warn("[Badge] Error executing clearAppBadge operations:", err);
  }
};


export const silentlyLinkOneSignalUser = async (
  userId: string,
  userRole: string
) => {
  try {
    if (!window.OneSignal || !isLocalInitialized) {
      console.log("[onesignal] SDK not ready or not initialized yet for silent link")
      return
    }

    console.log("[onesignal] silently linking user:", userId)

    if (typeof window.OneSignal.login === "function") {
      await window.OneSignal.login(userId)
      console.log("[onesignal] ✅ external ID linked:", userId)
    } else if (typeof window.OneSignal.setExternalUserId === "function") {
      await window.OneSignal.setExternalUserId(userId)
      console.log("[onesignal] ✅ external ID linked (legacy API):", userId)
    }

    if (window.OneSignal.User?.addTag) {
      await window.OneSignal.User.addTag("user_role", userRole)
    } else if (typeof window.OneSignal.sendTag === "function") {
      await window.OneSignal.sendTag("user_role", userRole)
    }
    console.log("[onesignal] ✅ role tag set:", userRole)

    const permission = await window.OneSignal.Notifications
      ?.permission ?? await window.OneSignal.getNotificationPermission?.()
    
    console.log("[onesignal] current permission state:", permission)

    if (permission === true || permission === "granted") {
      let playerId = null
      if (window.OneSignal.User?.pushSubscription?.id) {
        playerId = window.OneSignal.User.pushSubscription.id
      } else if (typeof window.OneSignal.getUserId === "function") {
        playerId = await window.OneSignal.getUserId()
      }

      if (playerId) {
        console.log("[onesignal] backfilling Supabase with player ID:", playerId)
        const { supabase } = await import("@/lib/supabase")
        await supabase.from("push_subscriptions").upsert({
          user_id: userId,
          user_role: userRole,
          onesignal_player_id: playerId,
          subscription: { playerId },
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" })
        console.log("[onesignal] ✅ Supabase backfilled")
      }
    }
  } catch (e: any) {
    console.warn("[onesignal] silent link skipped or warning:", e.message || e)
  }
}
