declare global {
  interface Window { OneSignal?: any; OneSignalDeferred?: any[]; Clerk?: any; }
}

export type OneSignalState = "unsupported" | "loading" | "initialized" | "failed";
let state: OneSignalState = typeof window === "undefined" ? "unsupported" : "loading";
let initialization: Promise<OneSignalState> | null = null;
let identityGeneration = 0;

const appId = String(import.meta.env.VITE_ONESIGNAL_APP_ID || "").trim();
const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window;
const subscription = () => window.OneSignal?.User?.PushSubscription;
const activeSubscription = () => {
  const current = subscription();
  return state === "initialized" && supported() && window.OneSignal?.Notifications?.permission === true && current?.optedIn === true && typeof current?.id === "string" && current.id.length > 0 ? current : null;
};

export const getOneSignalState = () => state;
export const initOneSignal = (): Promise<OneSignalState> => {
  if (initialization) return initialization;
  if (!supported() || !appId) { state = "unsupported"; return Promise.resolve(state); }
  state = "loading";
  initialization = new Promise((resolve) => {
    const start = () => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          if (!OneSignal.initialized) await OneSignal.init({ appId, notifyButton: { enable: false }, allowLocalhostAsSecureOrigin: true, serviceWorkerParam: { scope: "/" }, serviceWorkerPath: "sw.js" });
          state = "initialized";
          subscription()?.addEventListener?.("change", () => window.dispatchEvent(new CustomEvent("onesignal_subscribed_state_changed", { detail: { subscribed: Boolean(activeSubscription()) } })));
          resolve(state);
        } catch (error) { console.error("[OneSignal] initialization failed", error instanceof Error ? error.message : "unknown error"); state = "failed"; resolve(state); }
      });
    };
    if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start, { once: true }); else start();
  });
  return initialization;
};

export const isSubscribed = async () => Boolean((await initOneSignal()) === "initialized" && activeSubscription());
export const getPlayerId = async (): Promise<string | null> => { await initOneSignal(); return activeSubscription()?.id || null; };

const getToken = async () => window.Clerk?.session?.getToken ? window.Clerk.session.getToken() : null;
export const syncSubscriptionToDatabase = async (userId: string) => {
  const current = activeSubscription();
  if (!current || !userId) return false;
  try {
    const token = await getToken();
    const response = await fetch("/api/notifications?action=register-subscription", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ subscriptionId: current.id }) });
    return response.ok;
  } catch { return false; }
};

export const requestNotificationPermission = async (userId?: string): Promise<boolean> => {
  if ((await initOneSignal()) !== "initialized" || !supported()) return false;
  try {
    if (window.OneSignal.Notifications.permission !== true) await window.OneSignal.Notifications.requestPermission();
    if (window.OneSignal.Notifications.permission !== true) return false;
    await subscription()?.optIn?.();
    for (let i = 0; i < 20; i += 1) { if (activeSubscription()) break; await new Promise((resolve) => setTimeout(resolve, 250)); }
    const current = activeSubscription();
    if (!current) return false;
    if (userId) await syncSubscriptionToDatabase(userId);
    window.localStorage.setItem("onesignal_subscribed", "true");
    window.dispatchEvent(new CustomEvent("onesignal_subscribed_state_changed", { detail: { subscribed: true } }));
    return true;
  } catch { return false; }
};

export const repairPushSubscription = async (userId: string) => requestNotificationPermission(userId);

export const silentlyLinkOneSignalUser = async (userId: string, userRole: string) => {
  const generation = ++identityGeneration;
  if ((await initOneSignal()) !== "initialized" || generation !== identityGeneration) return false;
  try {
    await window.OneSignal.login(userId);
    if (generation !== identityGeneration) return false;
    await window.OneSignal.User?.addTag?.("user_role", userRole || "user");
    await syncSubscriptionToDatabase(userId);
    return true;
  } catch { return false; }
};

export const logoutOneSignalUser = async () => { identityGeneration += 1; if (state === "initialized") await window.OneSignal?.logout?.(); window.localStorage.removeItem("onesignal_subscribed"); };
export const notifyUser = async () => false;

export const clearAppBadge = async (): Promise<void> => {
  if (typeof navigator !== "undefined" && "clearAppBadge" in navigator) await (navigator as any).clearAppBadge();
  const registration = await navigator.serviceWorker?.getRegistration?.("/");
  registration?.active?.postMessage({ type: "CLEAR_BADGE" });
};
