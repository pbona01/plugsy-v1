const RECOVERY_WINDOW_MS = 30_000;
const MAX_RECOVERY_ATTEMPTS = 2;

type RecoveryState = { url?: string; at?: number; attempts?: number };

export async function recoverStaleDeployment(scope = "app"): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const key = `plugsy:deployment-recovery:${scope}`;
  let previous: RecoveryState = {};
  try { previous = JSON.parse(sessionStorage.getItem(key) || "{}"); } catch { /* ignore damaged state */ }

  const now = Date.now();
  const sameWindow = previous.url === window.location.href && now - Number(previous.at || 0) < RECOVERY_WINDOW_MS;
  const attempts = sameWindow ? Number(previous.attempts || 0) + 1 : 1;
  if (attempts > MAX_RECOVERY_ATTEMPTS) return false;

  try { sessionStorage.setItem(key, JSON.stringify({ url: window.location.href, at: now, attempts })); } catch { /* best effort */ }

  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
    const registration = await navigator.serviceWorker?.getRegistration?.();
    await registration?.update?.();
  } catch { /* reload still helps when cache APIs are unavailable */ }

  window.location.reload();
  return true;
}
