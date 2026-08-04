declare global {
  interface Window { OneSignal?: any; OneSignalDeferred?: any[]; Clerk?: any; }
}

export type OneSignalState = "unsupported" | "loading" | "initialized" | "failed";
export type TokenProvider = () => Promise<string | null>;
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
export const isCurrentIdentity = (generation: number, userId?: string) => generation === identityGeneration && (!userId || desiredIdentity?.id === userId);

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

export const syncSubscriptionToDatabase = async (userId: string, explicitToken?: string | null) => {
  const current = activeSubscription();
  if (!current || !userId) return false;
  try {
    const token = explicitToken === undefined ? await clerkToken() : explicitToken;
    const response = await fetch("/api/notifications?action=register-subscription", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ expectedUserId: userId, subscriptionId: current.id }) });
    return response.ok;
  } catch { return false; }
};

export const unregisterSubscription = async (userId: string, tokenProvider: TokenProvider = clerkToken) => {
  if (!userId) return false;
  try {
    const authToken = await tokenProvider();
    const response = await fetch("/api/notifications?action=unregister-subscription", { method: "POST", headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify({ expectedUserId: userId }) });
    return response.ok;
  } catch { return false; }
};

async function reconcileSubscription() {
  const generation = identityGeneration;
  const identity = desiredIdentity;
  const tokenProvider = currentActorToken;
  if (!identity || !tokenProvider) return;
  identityQueue = identityQueue.then(async () => {
    const token = await tokenProvider();
    if (!isCurrentIdentity(generation, identity.id) || linkedIdentity !== identity.id) return;
    const current = activeSubscription();
    if (current) await syncSubscriptionToDatabase(identity.id, token);
    else await unregisterSubscription(identity.id, tokenProvider);
  }).catch(() => undefined);
  await identityQueue;
}

const serializedLogin = (userId: string, role: string, tokenProvider: TokenProvider = clerkToken) => {
  const generation = ++identityGeneration;
  const previousIdentity = desiredIdentity;
  const previousTokenProvider = currentActorToken;
  desiredIdentity = { id: userId, role: role || "user" };
  currentActorToken = tokenProvider;
  identityQueue = identityQueue.then(async () => {
    if (generation !== identityGeneration || !desiredIdentity || desiredIdentity.id !== userId) return;
    if ((await initOneSignal()) !== "initialized" || generation !== identityGeneration) return;
    if (previousIdentity && previousIdentity.id !== userId && previousTokenProvider) {
      await unregisterSubscription(previousIdentity.id, previousTokenProvider);
    }
    if (generation !== identityGeneration) return;
    if (linkedIdentity && linkedIdentity !== userId) await window.OneSignal.logout?.();
    if (generation !== identityGeneration) return;
    await window.OneSignal.login(userId);
    if (generation === identityGeneration) linkedIdentity = userId;
  }).catch(() => undefined);
  return { generation, operation: identityQueue };
};

export type NotificationEnableResult = { active: boolean; registered: boolean; code: string };
const queueRegisterSubscription = async (generation: number, userId: string, tokenProvider: TokenProvider, subscriptionId: string) => {
  let registered = false;
  identityQueue = identityQueue.then(async () => {
    const token = await tokenProvider();
    if (!isCurrentIdentity(generation, userId) || linkedIdentity !== userId || activeSubscription()?.id !== subscriptionId) return;
    const response = await fetch("/api/notifications?action=register-subscription", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ expectedUserId: userId, subscriptionId }) });
    if (!isCurrentIdentity(generation, userId) || linkedIdentity !== userId || activeSubscription()?.id !== subscriptionId) return;
    registered = response.ok;
  }).catch(() => undefined);
  await identityQueue;
  return { registered, stale: !isCurrentIdentity(generation, userId) || linkedIdentity !== userId };
};

export const requestNotificationPermission = async (userId?: string, tokenProvider: TokenProvider = clerkToken): Promise<NotificationEnableResult> => {
  const initialGeneration = identityGeneration;
  if ((await initOneSignal()) !== "initialized" || !supported()) return { active: false, registered: false, code: "SDK_UNAVAILABLE" };
  if (!isCurrentIdentity(initialGeneration)) return { active: false, registered: false, code: "IDENTITY_CHANGED" };
  try {
    const requestedGeneration = userId ? serializedLogin(userId, "user", tokenProvider) : null;
    const generation = requestedGeneration?.generation ?? initialGeneration;
    if (requestedGeneration) await requestedGeneration.operation;
    if (!isCurrentIdentity(generation, userId) || (userId && linkedIdentity !== userId)) return { active: false, registered: false, code: "IDENTITY_CHANGED" };
    if (window.OneSignal.Notifications.permission !== true) await window.OneSignal.Notifications.requestPermission();
    if (!isCurrentIdentity(generation, userId)) return { active: false, registered: false, code: "IDENTITY_CHANGED" };
    if (window.OneSignal.Notifications.permission !== true) return { active: false, registered: false, code: "PERMISSION_BLOCKED" };
    await pushSubscription()?.optIn?.();
    if (!isCurrentIdentity(generation, userId)) return { active: false, registered: false, code: "IDENTITY_CHANGED" };
    for (let index = 0; index < 24 && !activeSubscription(); index += 1) {
      await delay(250);
      if (!isCurrentIdentity(generation, userId)) return { active: false, registered: false, code: "IDENTITY_CHANGED" };
    }
    const subscription = activeSubscription();
    if (!subscription) return { active: false, registered: false, code: "SUBSCRIPTION_MISSING" };
    if (!isCurrentIdentity(generation, userId) || (userId && linkedIdentity !== userId)) return { active: false, registered: false, code: "IDENTITY_CHANGED" };
    let registered = true;
    if (userId) {
      const queued = await queueRegisterSubscription(generation, userId, tokenProvider, subscription.id);
      if (queued.stale) return { active: false, registered: false, code: "IDENTITY_CHANGED" };
      registered = queued.registered;
    }
    if (!isCurrentIdentity(generation, userId)) return { active: false, registered: false, code: "IDENTITY_CHANGED" };
    window.localStorage.setItem("onesignal_subscribed", "true");
    if (!isCurrentIdentity(generation, userId)) return { active: false, registered: false, code: "IDENTITY_CHANGED" };
    window.dispatchEvent(new CustomEvent("onesignal_subscribed_state_changed", { detail: { subscribed: true } }));
    return { active: true, registered, code: registered ? "ACTIVE" : "REGISTRATION_WARNING" };
  } catch { return { active: false, registered: false, code: "ENABLE_FAILED" }; }
};

export const repairPushSubscription = async (userId: string, tokenProvider: TokenProvider = clerkToken) => requestNotificationPermission(userId, tokenProvider);

export const silentlyLinkOneSignalUser = async (userId: string, userRole: string, tokenProvider: TokenProvider = clerkToken) => {
  const queued = serializedLogin(userId, userRole, tokenProvider);
  await queued.operation;
  if (queued.generation === identityGeneration && desiredIdentity?.id === userId) await reconcileSubscription();
  return queued.generation === identityGeneration && desiredIdentity?.id === userId;
};

export const logoutOneSignalUser = async () => {
  const generation = ++identityGeneration;
  const previousIdentity = desiredIdentity;
  const previousTokenProvider = currentActorToken;
  desiredIdentity = null;
  currentActorToken = null;
  identityQueue = identityQueue.then(async () => {
    if (previousIdentity && previousTokenProvider) {
      await unregisterSubscription(previousIdentity.id, previousTokenProvider);
    }
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
