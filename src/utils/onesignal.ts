declare global {
  interface Window { OneSignal?: any; OneSignalDeferred?: any[]; Clerk?: any; }
}

export type OneSignalState = "unsupported" | "loading" | "initialized" | "failed";
let state: OneSignalState = typeof window === "undefined" ? "unsupported" : "loading";
let initialization: Promise<OneSignalState> | null = null;
let identityQueue: Promise<void> = Promise.resolve();
let identityGeneration = 0;
let desiredIdentity: { id: string; role: string } | null = null;
const appId = String(import.meta.env.VITE_ONESIGNAL_APP_ID || "").trim();
const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window;
const pushSubscription = () => window.OneSignal?.User?.PushSubscription;
const activeSubscription = () => {
  const current = pushSubscription();
  return state === "initialized" && supported() && window.OneSignal?.Notifications?.permission === true && current?.optedIn === true && typeof current?.id === "string" && current.id.length > 0 ? current : null;
};
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const getOneSignalState = () => state;

export const initOneSignal = (): Promise<OneSignalState> => {
  if (!supported() || !appId) { state = "unsupported"; return Promise.resolve(state); }
  if (initialization) return initialization;
  state = "loading";
  initialization = new Promise((resolve) => {
    let settled = false;
    const finish = (next: OneSignalState) => { if (settled) return; settled = true; state = next; if (next === "failed") initialization = null; resolve(next); };
    const timeout = window.setTimeout(() => finish("failed"), 8000);
    const start = () => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          if (!OneSignal.initialized) await OneSignal.init({ appId, notifyButton: { enable: false }, allowLocalhostAsSecureOrigin: true, serviceWorkerParam: { scope: "/" }, serviceWorkerPath: "sw.js" });
          window.clearTimeout(timeout);
          if (settled) return;
          pushSubscription()?.addEventListener?.("change", () => window.dispatchEvent(new CustomEvent("onesignal_subscribed_state_changed", { detail: { subscribed: Boolean(activeSubscription()) } })));
          finish("initialized");
        } catch (error) {
          window.clearTimeout(timeout);
          console.error("[OneSignal] initialization failed", error instanceof Error ? error.message : "unknown error");
          finish("failed");
        }
      });
    };
    if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start, { once: true }); else start();
  });
  return initialization;
};

export const isSubscribed = async () => Boolean((await initOneSignal()) === "initialized" && activeSubscription());
export const getPlayerId = async (): Promise<string | null> => { await initOneSignal(); return activeSubscription()?.id || null; };
const clerkToken = async () => window.Clerk?.session?.getToken ? window.Clerk.session.getToken() : null;

export const syncSubscriptionToDatabase = async (userId: string) => {
  const current = activeSubscription();
  if (!current || !userId) return false;
  try {
    const token = await clerkToken();
    const response = await fetch("/api/notifications?action=register-subscription", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ subscriptionId: current.id }) });
    return response.ok;
  } catch { return false; }
};

export const requestNotificationPermission = async (userId?: string): Promise<boolean> => {
  if ((await initOneSignal()) !== "initialized" || !supported()) return false;
  try {
    if (window.OneSignal.Notifications.permission !== true) await window.OneSignal.Notifications.requestPermission();
    if (window.OneSignal.Notifications.permission !== true) return false;
    await pushSubscription()?.optIn?.();
    for (let index = 0; index < 24 && !activeSubscription(); index += 1) await delay(250);
    if (!activeSubscription()) return false;
    if (userId && !(await syncSubscriptionToDatabase(userId))) console.warn("[OneSignal] active subscription confirmed but diagnostic persistence failed");
    window.localStorage.setItem("onesignal_subscribed", "true");
    window.dispatchEvent(new CustomEvent("onesignal_subscribed_state_changed", { detail: { subscribed: true } }));
    return true;
  } catch { return false; }
};

export const repairPushSubscription = async (userId: string) => requestNotificationPermission(userId);

export const silentlyLinkOneSignalUser = async (userId: string, userRole: string) => {
  const generation = ++identityGeneration;
  desiredIdentity = { id: userId, role: userRole || "user" };
  identityQueue = identityQueue.then(async () => {
    if (generation !== identityGeneration || !desiredIdentity || desiredIdentity.id !== userId) return;
    if ((await initOneSignal()) !== "initialized" || generation !== identityGeneration) return;
    await window.OneSignal.login(userId);
    if (generation !== identityGeneration) return;
    await window.OneSignal.User?.addTag?.("user_role", userRole || "user");
    if (generation === identityGeneration) await syncSubscriptionToDatabase(userId);
  }).catch(() => undefined);
  await identityQueue;
  return generation === identityGeneration && desiredIdentity?.id === userId;
};

export const logoutOneSignalUser = async () => {
  const generation = ++identityGeneration;
  desiredIdentity = null;
  identityQueue = identityQueue.then(async () => {
    if (generation !== identityGeneration) return;
    if (state === "initialized") await window.OneSignal?.logout?.();
    if (generation === identityGeneration) window.localStorage.removeItem("onesignal_subscribed");
  }).catch(() => undefined);
  await identityQueue;
};

export const notifyUser = async () => false;
export const clearAppBadge = async (): Promise<void> => {
  if (typeof navigator !== "undefined" && "clearAppBadge" in navigator) await (navigator as any).clearAppBadge();
  const registration = await navigator.serviceWorker?.getRegistration?.("/");
  registration?.active?.postMessage({ type: "CLEAR_BADGE" });
};
