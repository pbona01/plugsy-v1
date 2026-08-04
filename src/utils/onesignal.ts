declare global {
  interface Window { OneSignal?: any; OneSignalDeferred?: any[]; Clerk?: any; }
}

export type OneSignalState = "unsupported" | "loading" | "initialized" | "failed";
let state: OneSignalState = typeof window === "undefined" ? "unsupported" : "loading";
let initialization: Promise<OneSignalState> | null = null;
let identityQueue: Promise<void> = Promise.resolve();
let identityGeneration = 0;
let desiredIdentity: { id: string; role: string } | null = null;
let linkedIdentity = "";
let currentActorToken: (() => Promise<string | null>) | null = null;
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
          pushSubscription()?.addEventListener?.("change", () => {
            window.dispatchEvent(new CustomEvent("onesignal_subscribed_state_changed", { detail: { subscribed: Boolean(activeSubscription()) } }));
            void reconcileSubscription();
          });
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

export const unregisterSubscription = async (userId: string, token?: string) => {
  if (!userId) return false;
  try {
    const authToken = token || await clerkToken();
    const response = await fetch("/api/notifications?action=unregister-subscription", { method: "POST", headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: "{}" });
    return response.ok;
  } catch { return false; }
};

async function reconcileSubscription() {
  if (!desiredIdentity || !currentActorToken) return;
  const token = await currentActorToken();
  if (activeSubscription()) await syncSubscriptionToDatabase(desiredIdentity.id);
  else await unregisterSubscription(desiredIdentity.id, token || undefined);
}

const serializedLogin = (userId: string, role: string, token?: string) => {
  const generation = ++identityGeneration;
  desiredIdentity = { id: userId, role: role || "user" };
  currentActorToken = token ? async () => token : clerkToken;
  identityQueue = identityQueue.then(async () => {
    if (generation !== identityGeneration || !desiredIdentity || desiredIdentity.id !== userId) return;
    if ((await initOneSignal()) !== "initialized" || generation !== identityGeneration) return;
    if (linkedIdentity && linkedIdentity !== userId) await window.OneSignal.logout?.();
    if (generation !== identityGeneration) return;
    await window.OneSignal.login(userId);
    if (generation === identityGeneration) linkedIdentity = userId;
  }).catch(() => undefined);
  return { generation, operation: identityQueue };
};

export type NotificationEnableResult = { active: boolean; registered: boolean; code: string };
export const requestNotificationPermission = async (userId?: string, token?: string): Promise<NotificationEnableResult> => {
  if ((await initOneSignal()) !== "initialized" || !supported()) return { active: false, registered: false, code: "SDK_UNAVAILABLE" };
  try {
    const requestedGeneration = userId ? serializedLogin(userId, "user", token) : null;
    if (requestedGeneration) await requestedGeneration.operation;
    if (userId && (!desiredIdentity || desiredIdentity.id !== userId || requestedGeneration?.generation !== identityGeneration)) return { active: false, registered: false, code: "IDENTITY_CHANGED" };
    if (window.OneSignal.Notifications.permission !== true) await window.OneSignal.Notifications.requestPermission();
    if (window.OneSignal.Notifications.permission !== true) return { active: false, registered: false, code: "PERMISSION_BLOCKED" };
    await pushSubscription()?.optIn?.();
    for (let index = 0; index < 24 && !activeSubscription(); index += 1) await delay(250);
    if (!activeSubscription()) return { active: false, registered: false, code: "SUBSCRIPTION_MISSING" };
    let registered = true;
    if (userId && token) {
      const response = await fetch("/api/notifications?action=register-subscription", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ subscriptionId: activeSubscription()?.id }) });
      registered = response.ok;
    } else if (userId) registered = await syncSubscriptionToDatabase(userId);
    window.localStorage.setItem("onesignal_subscribed", "true");
    window.dispatchEvent(new CustomEvent("onesignal_subscribed_state_changed", { detail: { subscribed: true } }));
    return { active: true, registered, code: registered ? "ACTIVE" : "REGISTRATION_WARNING" };
  } catch { return { active: false, registered: false, code: "ENABLE_FAILED" }; }
};

export const repairPushSubscription = async (userId: string, token?: string) => requestNotificationPermission(userId, token);

export const silentlyLinkOneSignalUser = async (userId: string, userRole: string) => {
  const queued = serializedLogin(userId, userRole);
  await queued.operation;
  if (queued.generation === identityGeneration && desiredIdentity?.id === userId) await reconcileSubscription();
  return queued.generation === identityGeneration && desiredIdentity?.id === userId;
};

export const logoutOneSignalUser = async () => {
  const generation = ++identityGeneration;
  desiredIdentity = null;
  currentActorToken = null;
  identityQueue = identityQueue.then(async () => {
    if (generation !== identityGeneration) return;
    if (state === "initialized") await window.OneSignal?.logout?.();
    if (generation === identityGeneration) { linkedIdentity = ""; window.localStorage.removeItem("onesignal_subscribed"); }
  }).catch(() => undefined);
  await identityQueue;
};

export const notifyUser = async () => false;
export const clearAppBadge = async (): Promise<void> => {
  if (typeof navigator !== "undefined" && "clearAppBadge" in navigator) await (navigator as any).clearAppBadge();
  const registration = await navigator.serviceWorker?.getRegistration?.("/");
  registration?.active?.postMessage({ type: "CLEAR_BADGE" });
};
