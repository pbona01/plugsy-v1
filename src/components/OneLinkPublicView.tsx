import React from "react";
import { ExternalLink, MessageSquare } from "lucide-react";
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
          "mx-auto flex w-full max-w-xl flex-col items-center px-4 text-center",
          preview ? "py-8" : "min-h-screen py-12 sm:py-16",
        )}
      >
        <section
          aria-label={`${displayName}'s One Link`}
          className={cn(
            "w-full rounded-[2rem] border px-5 py-8 shadow-2xl backdrop-blur-xl sm:px-8",
            theme.cardBg,
          )}
        >
          <div className="mx-auto mb-5 h-24 w-24 overflow-hidden rounded-full border border-current/10 bg-black/10 shadow-xl">
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

          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            {displayName}
          </h1>
          <p
            className={cn(
              "mt-1 text-sm font-semibold",
              theme.textSecondary,
            )}
          >
            @{profile.username}
          </p>

          {profile.biography && (
            <p
              className={cn(
                "mx-auto mt-5 max-w-md whitespace-pre-wrap text-sm leading-6",
                theme.textSecondary,
              )}
            >
              {profile.biography}
            </p>
          )}

          {socials.length > 0 && (
            <nav
              aria-label="Creator social links"
              className="mt-6 flex flex-wrap justify-center gap-2.5"
            >
              {socials.map((social) => (
                <a
                  key={social.id}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${social.platform}`}
                  title={social.platform}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-2xl border transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                    theme.accent,
                  )}
                >
                  {getPlatformIcon(social.platform, { size: 19 })}
                </a>
              ))}
            </nav>
          )}

          {projects.length > 0 && (
            <div className="mt-7 space-y-3">
              {projects.map((project) => (
                <a
                  key={project.id}
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "group flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                    theme.buttonBg,
                  )}
                  aria-label={`Open ${project.title}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {project.title}
                    </span>
                    {project.description && (
                      <span
                        className={cn(
                          "mt-1 block text-xs leading-5",
                          theme.textSecondary,
                        )}
                      >
                        {project.description}
                      </span>
                    )}
                  </span>
                  <ExternalLink
                    aria-hidden="true"
                    size={16}
                    className="shrink-0 opacity-70 transition group-hover:opacity-100"
                  />
                </a>
              ))}
            </div>
          )}

          {profile.settings.messageEnabled && (
            <button
              type="button"
              onClick={onMessage}
              disabled={!onMessage}
              className="mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-90"
            >
              <MessageSquare aria-hidden="true" size={17} />
              Message on Plugsy
            </button>
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
