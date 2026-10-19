import { Capacitor } from "@capacitor/core";

export const PRODUCTION_SITE_ORIGIN = "https://www.plugsy.ng";

export function getSiteOrigin(): string {
  if (Capacitor.isNativePlatform()) return PRODUCTION_SITE_ORIGIN;
  return typeof window === "undefined" ? PRODUCTION_SITE_ORIGIN : window.location.origin;
}

export function getSiteUrl(path: string): string {
  return new URL(path, getSiteOrigin()).toString();
}
