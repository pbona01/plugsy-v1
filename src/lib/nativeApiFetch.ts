import { Capacitor } from "@capacitor/core";

const PRODUCTION_API_ORIGIN = "https://www.plugsy.ng";
export function resolveNativeApiUrl(
  requestUrl: string,
  appOrigin: string,
  apiOrigin = PRODUCTION_API_ORIGIN,
): string | null {
  try {
    const source = new URL(requestUrl, appOrigin);
    const localOrigin = new URL(appOrigin).origin;
    if (source.origin !== localOrigin || !/^\/api(?:\/|$)/.test(source.pathname)) {
      return null;
    }

    const destination = new URL(apiOrigin);
    if (destination.protocol !== "https:" || !["www.plugsy.ng", "plugsy.ng"].includes(destination.hostname)) return null;
    destination.pathname = `${destination.pathname.replace(/\/$/, "")}${source.pathname}`;
    destination.search = source.search;
    destination.hash = source.hash;
    return destination.toString();
  } catch {
    return null;
  }
}

/** Route the app's relative API requests to Plugsy's hosted API in native WebViews. */
export function installNativeApiFetch(): void {
  if (!Capacitor.isNativePlatform() || typeof window === "undefined") return;

  const nativeWindow = window as Window & { __plugsyNativeApiFetchInstalled?: boolean };
  if (nativeWindow.__plugsyNativeApiFetchInstalled) return;
  nativeWindow.__plugsyNativeApiFetchInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requestUrl = input instanceof Request ? input.url : String(input);
    const destination = resolveNativeApiUrl(requestUrl, window.location.origin);
    if (!destination) return originalFetch(input, init);

    if (input instanceof Request) {
      const requestWithOverrides = init ? new Request(input, init) : input;
      return originalFetch(new Request(destination, requestWithOverrides));
    }
    return originalFetch(destination, init);
  };
}
