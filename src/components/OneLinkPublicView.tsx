import React from "react";
import { ChevronRight, ExternalLink, MessageSquare } from "lucide-react";
import { OneLinkProfile } from "../types";
import { getOneLinkTheme } from "../constants/onelink-themes";
import { getPlatformIcon } from "../utils/onelink";
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
        theme.textPrimary,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 -z-10",
          theme.glow,
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
            theme.cardBg,
          )}
        >
          <div
            className={cn(
              "mx-auto mb-5 h-24 w-24 overflow-hidden rounded-full border-2 shadow-xl ring-4 ring-current/10",
              theme.accent,
            )}
          >
            {profile.imageUrl ? (
              <img
                src={profile.imageUrl}
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

          <h1 className="break-words text-2xl font-black tracking-tight sm:text-3xl">
            {displayName}
          </h1>
          <p
            className={cn(
              "mt-1 break-all text-sm font-semibold",
              theme.textSecondary,
            )}
          >
            @{profile.username}
          </p>

          {profile.biography && (
            <p
              className={cn(
                "mx-auto mt-5 max-w-md whitespace-pre-wrap break-words text-sm leading-6",
                theme.textSecondary,
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
                theme.accent,
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
                    theme.buttonBg,
                  )}
                  aria-label={`Open ${project.title}`}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                      theme.accent,
                    )}
                  >
                    <ExternalLink size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-bold">
                      {project.title}
                    </span>
                    {project.description && (
                      <span
                        className={cn(
                          "mt-1 block break-words text-xs leading-5",
                          theme.textSecondary,
                        )}
                      >
                        {project.description}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    size={18}
                    className="shrink-0 opacity-70 transition group-hover:opacity-100"
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
                    theme.buttonBg,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                      theme.accent,
                    )}
                  >
                    {getPlatformIcon(social.platform, { size: 19 })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {getPlatformLabel(social.platform)}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-xs",
                        theme.textSecondary,
                      )}
                    >
                      {getSafeUrlSubtitle(social.url)}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    size={18}
                    className="shrink-0 opacity-70 transition group-hover:opacity-100"
                  />
                </a>
              ))}
            </nav>
          )}
        </section>

        <footer className={cn("mt-8 text-xs", theme.textSecondary)}>
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
