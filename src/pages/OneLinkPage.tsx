import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Loader2, RefreshCw } from "lucide-react";
import OneLinkEditor from "../components/OneLinkEditor";
import {
  OneLinkAnalytics,
  OneLinkProfile,
  OneLinkSettings,
} from "../types";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  OneLinkImageKind,
  uploadOneLinkImage,
} from "../utils/uploadOneLinkImage";
import {
  normalizeOneLinkSettings,
  normalizeOneLinkUsername,
} from "../../shared/onelink.js";

interface OneLinkDraft {
  displayName: string;
  biography: string;
  imageUrl: string | null;
  imagePublicId: string | null;
  wallpaperUrl: string | null;
  wallpaperPublicId: string | null;
  wallpaperTextMode: "light" | "dark";
  settings: OneLinkSettings;
}

const normalizeOwnerProfile = (value: any): OneLinkProfile => ({
  username: normalizeOneLinkUsername(value?.username),
  displayName: String(value?.displayName || "").trim(),
  biography: String(value?.biography || ""),
  imageUrl:
    typeof value?.imageUrl === "string" ? value.imageUrl : null,
  imagePublicId:
    typeof value?.imagePublicId === "string"
      ? value.imagePublicId
      : null,
  wallpaperUrl:
    typeof value?.wallpaperUrl === "string"
      ? value.wallpaperUrl
      : null,
  wallpaperPublicId:
    typeof value?.wallpaperPublicId === "string"
      ? value.wallpaperPublicId
      : null,
  wallpaperTextMode:
    value?.wallpaperTextMode === "dark" ? "dark" : "light",
  messageUsername:
    typeof value?.messageUsername === "string"
      ? value.messageUsername
      : null,
  settings: normalizeOneLinkSettings(
    value?.settings,
  ) as OneLinkSettings,
});

export default function OneLinkPage() {
  useDocumentTitle("One Link Editor | Plugsy");
  const { getToken } = useAuth();
  const [profile, setProfile] = useState<OneLinkProfile | null>(
    null,
  );
  const [state, setState] = useState<
    "loading" | "ready" | "error"
  >("loading");

  const getVerifiedToken = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      throw new Error("Your session has expired. Sign in again.");
    }
    return token;
  }, [getToken]);

  const loadOwnerProfile = useCallback(async () => {
    setState("loading");
    try {
      const token = await getVerifiedToken();
      const response = await fetch("/api/onelink?action=owner", {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.profile) {
        throw new Error("Your One Link could not be loaded.");
      }
      setProfile(normalizeOwnerProfile(payload.profile));
      setState("ready");
    } catch {
      setProfile(null);
      setState("error");
    }
  }, [getVerifiedToken]);

  useEffect(() => {
    loadOwnerProfile();
  }, [loadOwnerProfile]);

  const saveProfile = async (
    draft: OneLinkDraft,
  ): Promise<OneLinkProfile> => {
    const token = await getVerifiedToken();
    const response = await fetch("/api/onelink?action=save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(draft),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.profile) {
      throw new Error(
        typeof payload?.error === "string"
          ? payload.error
          : "One Link changes could not be saved.",
      );
    }
    const saved = normalizeOwnerProfile(payload.profile);
    setProfile(saved);
    return saved;
  };

  const loadAnalytics = async (): Promise<OneLinkAnalytics> => {
    const token = await getVerifiedToken();
    const response = await fetch(
      "/api/onelink?action=analytics",
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.analytics) {
      throw new Error("One Link analytics could not be loaded.");
    }
    return payload.analytics as OneLinkAnalytics;
  };

  const uploadImage = (
    file: File,
    kind: OneLinkImageKind,
    onProgress: (status: string) => void,
  ) =>
    uploadOneLinkImage({
      file,
      kind,
      getToken: getVerifiedToken,
      onProgress,
    });

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08080b] px-4 text-white">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2
            aria-hidden="true"
            className="h-7 w-7 animate-spin text-red-400"
          />
          <p className="text-sm text-white/50">
            Loading your One Link editor…
          </p>
        </div>
      </div>
    );
  }

  if (state === "error" || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08080b] px-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <h1 className="text-2xl font-black">
            One Link could not be loaded
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/45">
            Your existing settings were not changed. Retry when your
            connection is available.
          </p>
          <button
            type="button"
            onClick={loadOwnerProfile}
            className="mx-auto mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-slate-200"
          >
            <RefreshCw aria-hidden="true" size={16} />
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <OneLinkEditor
      initialProfile={profile}
      onSave={saveProfile}
      loadAnalytics={loadAnalytics}
      onUploadImage={uploadImage}
    />
  );
}
