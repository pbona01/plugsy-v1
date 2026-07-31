import { createElement } from "react";
import {
  Github,
  Globe,
  Instagram,
  Linkedin,
  MessageSquare,
  Music,
  Send,
  Twitter,
  Youtube,
} from "lucide-react";

export const getPlatformIcon = (
  platform: string,
  options: { size?: number; className?: string } = {},
) => {
  let Icon = Globe;
  switch (platform.toLowerCase()) {
    case "github":
      Icon = Github;
      break;
    case "linkedin":
      Icon = Linkedin;
      break;
    case "instagram":
      Icon = Instagram;
      break;
    case "youtube":
      Icon = Youtube;
      break;
    case "twitter":
    case "x":
      Icon = Twitter;
      break;
    case "discord":
      Icon = MessageSquare;
      break;
    case "spotify":
      Icon = Music;
      break;
    case "telegram":
      Icon = Send;
      break;
    default:
      Icon = Globe;
  }
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
