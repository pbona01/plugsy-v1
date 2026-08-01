import React from "react";
import { ChevronRight, ExternalLink, MessageSquare } from "lucide-react";
import { OneLinkProfile } from "../types";
import {
  getOneLinkTheme,
  OneLinkVisualTokens,
} from "../constants/onelink-themes";
import { getPlatformIcon } from "../utils/onelink";
import { getOneLinkImageDeliveryUrl } from "../utils/uploadOneLinkImage";
import { cn } from "../lib/utils";
import { normalizeExternalUrl } from "../../shared/onelink.js";

interface OneLinkPublicViewProps {
  profile: OneLinkProfile;
  onMessage?: () => void;
  preview?: boolean;
}

const getPlatformLabel = (platform: string) =>
  platform
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const getSafeUrlSubtitle = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
};

export default function OneLinkPublicView({
  profile,
  onMessage,
  preview = false,
}: OneLinkPublicViewProps) {
  const theme = getOneLinkTheme(profile.settings.theme);
  const hasWallpaper = Boolean(profile.wallpaperUrl);
  const wallpaperUsesDarkText =
    hasWallpaper && profile.wallpaperTextMode === "dark";
  const visual: OneLinkVisualTokens = hasWallpaper
    ? wallpaperUsesDarkText
      ? {
          pageForeground: "text-slate-950",
          secondaryForeground: "text-slate-700",
          cardForeground: "text-slate-950",
          buttonForeground: "text-slate-950",
          iconForeground: "text-slate-800",
          cardSurface: "bg-white/80",
          buttonSurface: "bg-white/75 hover:bg-white/90",
          border: "border-black/15",
          accentForeground: theme.accentForeground,
          accentSurface: theme.accentSurface,
          footerForeground: "text-slate-950",
        }
      : {
          pageForeground: "text-white",
          secondaryForeground: "text-slate-200",
          cardForeground: "text-white",
          buttonForeground: "text-white",
          iconForeground: "text-white",
          cardSurface: "bg-slate-950/70",
          buttonSurface: "bg-black/50 hover:bg-black/65",
          border: "border-white/25",
          accentForeground: theme.accentForeground,
          accentSurface: theme.accentSurface,
          footerForeground: "text-white",
        }
    : theme;
  const socials = profile.settings.socials
    .filter((social) => social.enabled && !social.invalid)
    .map((social) => ({
      ...social,
      url: normalizeExternalUrl(social.url),
    }))
    .filter(
      (social): social is typeof social & { url: string } =>
        Boolean(social.url),
    );
  const projects = profile.settings.projects
    .filter((project) => project.enabled && !project.invalid)
    .map((project) => ({
      ...project,
      url: normalizeExternalUrl(project.url),
    }))
    .filter(
      (project): project is typeof project & { url: string } =>
        Boolean(project.url),
    );
  const displayName =
    profile.displayName || profile.username || "Plugsy Creator";
  const initial = displayName.slice(0, 1).toUpperCase() || "P";

  return (
    <div
      className={cn(
        "relative isolate w-full overflow-x-hidden",
        preview ? "min-h-full" : "min-h-screen",
        theme.background,
        visual.pageForeground,
      )}
    >
      {profile.wallpaperUrl && (
        <img
          src={getOneLinkImageDeliveryUrl(
            profile.wallpaperUrl,
            "wallpaper",
          )}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover object-center"
          referrerPolicy="no-referrer"
        />
      )}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 -z-10",
          hasWallpaper
            ? wallpaperUsesDarkText
              ? "bg-white/55"
              : "bg-black/55"
            : theme.glow,
        )}
      />

      <main
        className={cn(
          "mx-auto flex w-full max-w-xl flex-col items-center px-4 text-center sm:px-6",
          preview ? "py-8" : "min-h-screen py-12 sm:py-16",
        )}
      >
        <section
          aria-label={`${displayName}'s One Link`}
          className={cn(
            "w-full rounded-[2rem] border px-4 py-8 shadow-2xl backdrop-blur-xl sm:px-8",
            visual.cardSurface,
            visual.cardForeground,
            visual.border,
          )}
        >
          <div
            className={cn(
              "mx-auto mb-5 h-24 w-24 overflow-hidden rounded-full border-2 shadow-xl ring-4 ring-current/10",
              visual.accentSurface,
              visual.accentForeground,
              visual.border,
            )}
          >
            {profile.imageUrl ? (
              <img
                src={getOneLinkImageDeliveryUrl(
                  profile.imageUrl,
                  "avatar",
                )}
                alt={`${displayName}'s profile`}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                aria-label={`${displayName} profile placeholder`}
                className="flex h-full w-full items-center justify-center text-3xl font-black"
              >
                {initial}
              </div>
            )}
          </div>

          <h1
            className={cn(
              "break-words text-2xl font-black tracking-tight sm:text-3xl",
              visual.cardForeground,
            )}
          >
            {displayName}
          </h1>
          <p
            className={cn(
              "mt-1 break-all text-sm font-semibold",
              visual.secondaryForeground,
            )}
          >
            @{profile.username}
          </p>

          {profile.biography && (
            <p
              className={cn(
                "mx-auto mt-5 max-w-md whitespace-pre-wrap break-words text-sm leading-6",
                visual.secondaryForeground,
              )}
            >
              {profile.biography}
            </p>
          )}

          {profile.settings.messageEnabled && (
            <button
              type="button"
              onClick={onMessage}
              disabled={!onMessage}
              className={cn(
                "mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 text-sm font-bold shadow-lg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-default disabled:opacity-60",
                visual.accentSurface,
                visual.accentForeground,
                visual.border,
              )}
            >
              <MessageSquare aria-hidden="true" size={17} />
              DM Me
            </button>
          )}

          {projects.length > 0 && (
            <nav aria-label="Featured links" className="mt-7 w-full space-y-3">
              {projects.map((project) => (
                <a
                  key={project.id}
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "group flex min-h-14 w-full items-center gap-3 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                    visual.buttonSurface,
                    visual.buttonForeground,
                    visual.border,
                  )}
                  aria-label={`Open ${project.title}`}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                      visual.accentSurface,
                      visual.accentForeground,
                      visual.border,
                    )}
                  >
                    <ExternalLink size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block break-words text-sm font-bold",
                        visual.buttonForeground,
                      )}
                    >
                      {project.title}
                    </span>
                    {project.description && (
                      <span
                        className={cn(
                          "mt-1 block break-words text-xs leading-5",
                          visual.secondaryForeground,
                        )}
                      >
                        {project.description}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    size={18}
                    className={cn(
                      "shrink-0 opacity-70 transition group-hover:opacity-100",
                      visual.iconForeground,
                    )}
                  />
                </a>
              ))}
            </nav>
          )}

          {socials.length > 0 && (
            <nav
              aria-label="Creator social links"
              className="mt-7 w-full space-y-3"
            >
              {socials.map((social) => (
                <a
                  key={social.id}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${getPlatformLabel(social.platform)}`}
                  className={cn(
                    "group flex min-h-14 w-full items-center gap-3 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                    visual.buttonSurface,
                    visual.buttonForeground,
                    visual.border,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                      visual.accentSurface,
                      visual.accentForeground,
                      visual.border,
                    )}
                  >
                    {getPlatformIcon(social.platform, { size: 19 })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm font-bold",
                        visual.buttonForeground,
                      )}
                    >
                      {getPlatformLabel(social.platform)}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-xs",
                        visual.secondaryForeground,
                      )}
                    >
                      {getSafeUrlSubtitle(social.url)}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    size={18}
                    className={cn(
                      "shrink-0 opacity-70 transition group-hover:opacity-100",
                      visual.iconForeground,
                    )}
                  />
                </a>
              ))}
            </nav>
          )}
        </section>

        <footer
          className={cn(
            "mt-8 text-xs",
            visual.footerForeground,
            hasWallpaper && !wallpaperUsesDarkText && "drop-shadow-md",
          )}
        >
          <a
            href="https://www.plugsy.ng"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-semibold tracking-wide transition hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
            aria-label="Powered by Plugsy"
          >
            <span aria-hidden="true">⚡</span>
            Powered by Plugsy
          </a>
        </footer>
      </main>
    </div>
  );
}
