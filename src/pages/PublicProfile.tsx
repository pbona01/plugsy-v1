import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "@clerk/clerk-react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, RefreshCw, UserX } from "lucide-react";
import OneLinkPublicView from "../components/OneLinkPublicView";
import { OneLinkProfile } from "../types";
import {
  normalizeOneLinkSettings,
  normalizeOneLinkUsername,
} from "../../shared/onelink.js";
import { getProductionOneLinkUrl } from "../utils/onelink";

type LoadState =
  | "loading"
  | "ready"
  | "not-found"
  | "unpublished"
  | "error";

const fallbackDescription = (profile: OneLinkProfile) =>
  profile.biography ||
  `Visit ${profile.displayName || `@${profile.username}`} on Plugsy.`;

export default function PublicProfile() {
  const { username: routeUsername } = useParams<{
    username: string;
  }>();
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>("loading");
  const [profile, setProfile] = useState<OneLinkProfile | null>(
    null,
  );
  const viewAttemptRef = useRef<string | null>(null);
  const username = normalizeOneLinkUsername(routeUsername);

  const loadProfile = useCallback(async () => {
    if (!username) {
      setProfile(null);
      setState("not-found");
      return;
    }

    setState("loading");
    try {
      const response = await fetch(
        `/api/onelink?action=public&username=${encodeURIComponent(username)}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
      );
      const payload = await response.json().catch(() => null);

      if (response.status === 404) {
        setProfile(null);
        setState("not-found");
        return;
      }
      if (
        response.status === 403 &&
        payload?.code === "ONELINK_UNPUBLISHED"
      ) {
        setProfile(null);
        setState("unpublished");
        return;
      }
      if (!response.ok || !payload?.profile) {
        throw new Error("ONELINK_LOAD_FAILED");
      }

      const loaded = payload.profile as OneLinkProfile;
      setProfile({
        username: normalizeOneLinkUsername(loaded.username),
        displayName: String(loaded.displayName || "").trim(),
        biography: String(loaded.biography || ""),
        imageUrl:
          typeof loaded.imageUrl === "string"
            ? loaded.imageUrl
            : null,
        imagePublicId: null,
        wallpaperUrl:
          typeof loaded.wallpaperUrl === "string"
            ? loaded.wallpaperUrl
            : null,
        wallpaperPublicId: null,
        wallpaperTextMode:
          loaded.wallpaperTextMode === "dark" ? "dark" : "light",
        messageUsername:
          typeof loaded.messageUsername === "string"
            ? normalizeOneLinkUsername(loaded.messageUsername)
            : null,
        settings: normalizeOneLinkSettings(
          loaded.settings,
        ) as OneLinkProfile["settings"],
      });
      setState("ready");
    } catch {
      setProfile(null);
      setState("error");
    }
  }, [username]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (state !== "ready" || !profile?.username) return;

    const utcDate = new Date().toISOString().slice(0, 10);
    const marker =
      `plugsy:onelink:page-view:v1:${profile.username}:${utcDate}`;
    if (viewAttemptRef.current === marker) return;
    viewAttemptRef.current = marker;
    try {
      if (window.localStorage.getItem(marker)) return;
    } catch {
      // Storage is optional; still attempt one request for this mount.
    }

    fetch("/api/onelink?action=view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: profile.username }),
      keepalive: true,
    })
      .then((response) => {
        if (!response.ok) return;
        try {
          window.localStorage.setItem(marker, "1");
        } catch {
          // Storage is optional and must never block public rendering.
        }
      })
      .catch(() => {
        // Page-view storage must never block public rendering.
      });
  }, [profile, state]);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4 text-brand-text">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2
            aria-hidden="true"
            className="h-7 w-7 animate-spin text-brand-accent"
          />
          <p className="text-sm text-brand-text-secondary">
            Loading this One Link…
          </p>
        </div>
      </div>
    );
  }

  if (state !== "ready" || !profile) {
    const notFound = state === "not-found";
    const unpublished = state === "unpublished";
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4 text-brand-text">
        <div className="w-full max-w-md rounded-3xl border border-brand-border bg-brand-card p-8 text-center shadow-2xl">
          <UserX
            aria-hidden="true"
            className="mx-auto mb-5 h-10 w-10 text-slate-500"
          />
          <h1 className="text-2xl font-black">
            {notFound
              ? "One Link not found"
              : unpublished
                ? "This One Link is unpublished"
                : "One Link could not be loaded"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {notFound
              ? "Check the username in the URL and try again."
              : unpublished
                ? "The creator has not made this page public."
                : "There was a temporary problem loading this page."}
          </p>
          {state === "error" && (
            <button
              type="button"
              onClick={loadProfile}
            className="mx-auto mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-text px-4 py-3 text-sm font-bold text-brand-bg transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
            >
              <RefreshCw aria-hidden="true" size={16} />
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const canonicalUrl = getProductionOneLinkUrl(profile.username);
  const seoTitle =
    profile.settings.seoTitle ||
    `${profile.displayName || `@${profile.username}`} | Plugsy`;
  const seoDescription =
    profile.settings.seoDescription ||
    fallbackDescription(profile);

  const handleMessage = () => {
    if (!profile.messageUsername) return;
    const destination = `/chats?search=${encodeURIComponent(
      profile.messageUsername,
    )}`;
    if (userId) {
      navigate(destination);
      return;
    }
    navigate(
      `/login?redirect=${encodeURIComponent(destination)}`,
    );
  };

  return (
    <>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={seoTitle} />
        <meta
          property="og:description"
          content={seoDescription}
        />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="profile" />
        {profile.imageUrl && (
          <meta property="og:image" content={profile.imageUrl} />
        )}
      </Helmet>
      <OneLinkPublicView
        profile={profile}
        onMessage={profile.messageUsername ? handleMessage : undefined}
      />
    </>
  );
}
