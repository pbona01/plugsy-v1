import React from "react";
import { Globe } from "lucide-react";

export const ONE_LINK_PLATFORM_IDS = [
  "instagram",
  "tiktok",
  "x",
  "facebook",
  "linkedin",
  "youtube",
  "whatsapp",
  "telegram",
  "snapchat",
  "github",
  "discord",
  "spotify",
  "behance",
  "dribbble",
  "website",
] as const;

export type OneLinkPlatformId =
  (typeof ONE_LINK_PLATFORM_IDS)[number];

export interface OneLinkPlatformIconProps {
  size?: number;
  className?: string;
}

const BrandIcon = ({
  size = 18,
  className,
  path,
}: OneLinkPlatformIconProps & { path: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    fill="currentColor"
  >
    <path d={path} />
  </svg>
);

const brand = (path: string) =>
  function PlatformIcon(props: OneLinkPlatformIconProps) {
    return <BrandIcon {...props} path={path} />;
  };

const WebsiteIcon = ({ size = 18, className }: OneLinkPlatformIconProps) => (
  <Globe aria-hidden="true" size={size} className={className} />
);

const InstagramIcon = brand("M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6Zm9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z");
const TikTokIcon = brand("M15.5 2c.25 2.15 1.45 3.43 3.5 3.75V9a8.1 8.1 0 0 1-3.5-1.02v7.02a6 6 0 1 1-5.2-5.95v3.3a2.75 2.75 0 1 0 1.95 2.65V2h3.25Z");
const XIcon = brand("M3 3h4.7l4.7 6.28L17.8 3H21l-7.12 8.28L21.5 21h-4.7l-5.37-7.18L5.25 21H2l7.93-9.18L3 3Zm3.18 1.75 11.5 14.5h1.64L7.82 4.75H6.18Z");
const FacebookIcon = brand("M13.5 22v-8h2.75l.41-3.2H13.5V8.76c0-.93.26-1.56 1.6-1.56h1.7V4.34A22.8 22.8 0 0 0 14.32 4C11.87 4 10.2 5.49 10.2 8.22v2.58H7.44V14h2.76v8h3.3Z");
const LinkedinIcon = brand("M5.35 8.35H2.2V22h3.15V8.35ZM3.78 2A1.83 1.83 0 1 0 3.8 5.66 1.83 1.83 0 0 0 3.78 2ZM22 14.17c0-4.11-2.19-6.02-5.12-6.02a4.42 4.42 0 0 0-4 2.2v-2h-3.15V22h3.15v-7.6c0-2 .38-3.95 2.87-3.95 2.46 0 2.49 2.3 2.49 4.08V22H22v-7.83Z");
const YoutubeIcon = brand("M23.5 6.2a3 3 0 0 0-2.1-2.1C19.55 3.6 12 3.6 12 3.6s-7.55 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.85.5 9.4.5 9.4.5s7.55 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.27 3.6-6.27 3.6Z");
const WhatsappIcon = brand("M12.04 2a9.84 9.84 0 0 0-8.42 14.93L2 22l5.23-1.55A9.96 9.96 0 1 0 12.04 2Zm0 17.92a8 8 0 0 1-4.08-1.12l-.3-.18-3.1.92.95-3.02-.2-.31A7.9 7.9 0 1 1 12.04 19.92Zm4.35-5.92c-.24-.12-1.41-.69-1.63-.77-.22-.08-.38-.12-.54.12-.16.24-.62.77-.76.93-.14.16-.28.18-.52.06-1.42-.71-2.35-1.27-3.3-2.88-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.51.58.18 1.1.16 1.51.1.46-.07 1.41-.58 1.61-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z");
const TelegramIcon = brand("M22.4 2.6 1.7 10.58c-1.41.57-1.4 1.36-.26 1.7l5.31 1.66 2.04 6.32c.25.7.13.98.86.98.56 0 .81-.26 1.12-.56l2.58-2.51 5.37 3.97c.99.55 1.7.27 1.95-.92l3.53-16.64c.36-1.45-.55-2.1-1.8-1.98ZM8.03 13.56l10.35-6.53c.52-.32 1-.15.61.2l-8.54 7.7-.33 3.51-2.09-4.88Z");
const SnapchatIcon = brand("M12 2c3.03 0 4.56 2.28 4.56 5.2 0 1.06-.17 2.25.13 2.96.21.49.67.7 1.21.92.69.29 1.45.6 1.31 1.18-.1.43-.73.69-1.75.85-.2.03-.34.26-.22.44.77 1.17 1.93 1.43 3.18 1.63.33.05.56.34.53.67-.04.45-.48.66-1.1.75-.42.06-.75.35-.94.72-.48.94-1.22 1.24-2.13 1.09-.68-.11-1.17-.16-1.62.13-.85.54-1.76 1.46-3.16 1.46s-2.31-.92-3.16-1.46c-.45-.29-.94-.24-1.62-.13-.91.15-1.65-.15-2.13-1.09-.19-.37-.52-.66-.94-.72-.62-.09-1.06-.3-1.1-.75-.03-.33.2-.62.53-.67 1.25-.2 2.41-.46 3.18-1.63.12-.18-.02-.41-.22-.44-1.02-.16-1.65-.42-1.75-.85-.14-.58.62-.89 1.31-1.18.54-.22 1-.43 1.21-.92.3-.71.13-1.9.13-2.96C7.44 4.28 8.97 2 12 2Z");
const GithubIcon = brand("M12 .7A11.5 11.5 0 0 0 8.36 23.1c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.29-5.27-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.9 10.9 0 0 1 5.75 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.73.8 1.18 1.83 1.18 3.08 0 4.41-2.71 5.38-5.29 5.67.42.36.79 1.06.79 2.14v3.27c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z");
const DiscordIcon = brand("M19.54 5.34A16.7 16.7 0 0 0 15.44 4l-.5 1.03a15.5 15.5 0 0 0-5.87 0L8.55 4a16.6 16.6 0 0 0-4.1 1.34C1.85 9.2 1.15 12.96 1.5 16.66a16.8 16.8 0 0 0 5.03 2.54l1.23-1.68a10.7 10.7 0 0 1-1.93-.93l.48-.37c3.72 1.72 7.75 1.72 11.43 0l.49.37c-.62.37-1.27.68-1.94.93l1.23 1.68a16.7 16.7 0 0 0 5.03-2.54c.42-4.29-.72-8.02-3.01-11.32ZM8.45 14.4c-1.12 0-2.04-1.03-2.04-2.29 0-1.26.9-2.29 2.04-2.29s2.06 1.04 2.04 2.29c0 1.26-.9 2.29-2.04 2.29Zm7.1 0c-1.12 0-2.04-1.03-2.04-2.29 0-1.26.9-2.29 2.04-2.29s2.06 1.04 2.04 2.29c0 1.26-.9 2.29-2.04 2.29Z");
const SpotifyIcon = brand("M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22Zm5.04 15.87a.69.69 0 0 1-.95.23c-2.6-1.59-5.87-1.95-9.72-1.07a.69.69 0 1 1-.31-1.34c4.21-.96 7.83-.55 10.75 1.24.33.2.43.62.23.94Zm1.35-3a.86.86 0 0 1-1.19.28c-2.97-1.83-7.5-2.36-11.01-1.29a.86.86 0 1 1-.5-1.65c4.02-1.22 9.01-.63 12.42 1.47.4.25.53.78.28 1.19Zm.12-3.13C14.95 8.62 9.08 8.42 5.68 9.45a1.03 1.03 0 1 1-.6-1.97c3.9-1.18 10.38-.94 14.48 1.49a1.03 1.03 0 0 1-1.05 1.77Z");
const BehanceIcon = brand("M2 5h7.2c3.18 0 5.33 1.09 5.33 4.14 0 1.61-.78 2.74-2.2 3.42 1.98.56 2.98 2.08 2.98 4.1C15.31 19.95 12.54 21 9.61 21H2V5Zm3.52 6.47h3.4c1.28 0 2.24-.58 2.24-1.98 0-1.58-1.21-1.9-2.51-1.9H5.52v3.88Zm0 6.94H9.1c1.44 0 2.7-.47 2.7-2.2 0-1.7-1.07-2.38-2.65-2.38H5.52v4.58ZM17 6h5v1.65h-5V6Zm2.55 3.1c3.83 0 5.73 3.22 5.52 6.84h-7.82c.1 1.98 1.06 2.88 2.78 2.88 1.25 0 2.25-.77 2.45-1.47h2.4C24.11 19.7 22.48 21 19.94 21c-3.33 0-5.39-2.29-5.39-5.56 0-3.17 2.18-5.56 5-5.56v-.78Zm2.82 4.98c-.27-1.58-.97-2.4-2.9-2.4-1.55 0-2.15 1.2-2.22 2.4h5.12Z");
const DribbbleIcon = brand("M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22Zm7.43 5.07a9.3 9.3 0 0 1 1.96 5.76 22.4 22.4 0 0 0-6.28-.09c-.2-.48-.4-.95-.63-1.42a17.25 17.25 0 0 0 4.95-4.25ZM12 2.62c2.38 0 4.55.89 6.2 2.34a14.7 14.7 0 0 1-4.45 3.82 48.5 48.5 0 0 0-3.14-5.99c.45-.11.92-.17 1.39-.17Zm-3.14.76a39.8 39.8 0 0 1 3.2 6.03 35.6 35.6 0 0 1-9.35 1.2 9.42 9.42 0 0 1 6.15-7.23Zm-6.23 8.87h.68a38.6 38.6 0 0 0 9.46-1.35l.52 1.17c-4.56 1.28-7.16 4.75-7.73 5.61a9.32 9.32 0 0 1-2.93-5.43Zm4.2 6.5c.38-.65 2.4-3.72 7.1-5.03a30.4 30.4 0 0 1 1.08 6.9 9.34 9.34 0 0 1-8.18-1.87Zm9.77 1.16a32 32 0 0 0-1-6.57 19.4 19.4 0 0 1 5.63.14 9.4 9.4 0 0 1-4.63 6.43Z");

export const ONE_LINK_PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: InstagramIcon },
  { id: "tiktok", label: "TikTok", icon: TikTokIcon },
  { id: "x", label: "X", icon: XIcon },
  { id: "facebook", label: "Facebook", icon: FacebookIcon },
  { id: "linkedin", label: "LinkedIn", icon: LinkedinIcon },
  { id: "youtube", label: "YouTube", icon: YoutubeIcon },
  { id: "whatsapp", label: "WhatsApp", icon: WhatsappIcon },
  { id: "telegram", label: "Telegram", icon: TelegramIcon },
  { id: "snapchat", label: "Snapchat", icon: SnapchatIcon },
  { id: "github", label: "GitHub", icon: GithubIcon },
  { id: "discord", label: "Discord", icon: DiscordIcon },
  { id: "spotify", label: "Spotify", icon: SpotifyIcon },
  { id: "behance", label: "Behance", icon: BehanceIcon },
  { id: "dribbble", label: "Dribbble", icon: DribbbleIcon },
  { id: "website", label: "Website", icon: WebsiteIcon },
] as const;

const aliases: Record<string, OneLinkPlatformId> = {
  twitter: "x",
  web: "website",
  site: "website",
};

const byId = new Map(
  ONE_LINK_PLATFORMS.map((platform) => [platform.id, platform]),
);

export const canonicalizeOneLinkPlatform = (
  value: string,
): OneLinkPlatformId | null => {
  const normalized = String(value || "").trim().toLowerCase();
  const canonical = aliases[normalized] || normalized;
  return byId.has(canonical as OneLinkPlatformId)
    ? (canonical as OneLinkPlatformId)
    : null;
};

export const getOneLinkPlatform = (value: string) => {
  const canonical = canonicalizeOneLinkPlatform(value);
  return canonical ? byId.get(canonical)! : null;
};

export const getOneLinkPlatformLabel = (value: string) => {
  const platform = getOneLinkPlatform(value);
  if (platform) return platform.label;
  const legacy = String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
  return legacy || "Website";
};

export const getOneLinkPlatformIcon = (value: string) =>
  getOneLinkPlatform(value)?.icon || WebsiteIcon;
