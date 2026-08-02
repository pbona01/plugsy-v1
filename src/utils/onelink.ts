import { createElement } from "react";
import { getOneLinkPlatformIcon } from "./onelinkPlatforms";

export const getPlatformIcon = (
  platform: string,
  options: { size?: number; className?: string } = {},
) => {
  const Icon = getOneLinkPlatformIcon(platform);
  return createElement(Icon, {
    size: options.size || 18,
    className: options.className,
    "aria-hidden": true,
  });
};

export const getOneLinkPath = (username: string) =>
  `/one/${encodeURIComponent(username.trim().toLowerCase())}`;

export const getProductionOneLinkUrl = (username: string) =>
  `https://www.plugsy.ng${getOneLinkPath(username)}`;

export const getCanonicalOneLinkUrl = (username: string) => {
  const path = getOneLinkPath(username);
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".local")
    ) {
      return `${window.location.origin}${path}`;
    }
  }
  return getProductionOneLinkUrl(username);
};

export const createOneLinkItemId = (prefix: "social" | "link") => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};
