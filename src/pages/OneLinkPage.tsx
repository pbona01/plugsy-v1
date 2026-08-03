import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Loader2, RefreshCw } from "lucide-react";
import OneLinkEditor from "../components/OneLinkEditor";
import {
  OneLinkAnalytics,
  OneLinkMutationAction,
  OneLinkOwnerState,
  OneLinkProfile,
  OneLinkSettings,
} from "../types";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  OneLinkImageKind,
  uploadOneLinkImage,
} from "../utils/uploadOneLinkImage";
import {
  isVerifiedOneLinkPublicResponse,
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

const normalizeOwnerState = (value: any): OneLinkOwnerState => {
  if (
    !value?.profile ||
    (value.revision !== null && typeof value.revision !== "string") ||
    typeof value.published !== "boolean" ||
    typeof value.liveConfirmed !== "boolean"
  ) {
    throw new Error("Your One Link could not be loaded.");
  }
  const profile = normalizeOwnerProfile(value.profile);
  profile.settings.published = value.published;
  return {
    profile,
    revision: value.revision,
    published: value.published,
    liveConfirmed: value.liveConfirmed,
  };
};

class OneLinkRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OneLinkRequestError";
    this.code = code;
  }
}

export default function OneLinkPage() {
  useDocumentTitle("One Link Editor | Plugsy");
  const { getToken } = useAuth();
  const [ownerState, setOwnerState] = useState<OneLinkOwnerState | null>(
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
      if (!response.ok) {
        throw new Error("Your One Link could not be loaded.");
      }
      setOwnerState(normalizeOwnerState(payload));
      setState("ready");
    } catch {
      setOwnerState(null);
      setState("error");
    }
  }, [getVerifiedToken]);

  useEffect(() => {
    loadOwnerProfile();
  }, [loadOwnerProfile]);

  const mutateProfile = async (
    action: OneLinkMutationAction,
    draft?: OneLinkDraft,
  ): Promise<OneLinkOwnerState> => {
    if (!ownerState) {
      throw new Error("Your One Link could not be loaded.");
    }
    const token = await getVerifiedToken();
    const response = await fetch(`/api/onelink?action=${action}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(
        action === "unpublish"
          ? { expectedRevision: ownerState.revision }
          : { ...draft, expectedRevision: ownerState.revision },
      ),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new OneLinkRequestError(
        typeof payload?.code === "string" ? payload.code : "ONELINK_REQUEST_FAILED",
        typeof payload?.error === "string"
          ? payload.error
          : "One Link changes could not be saved.",
      );
    }
    const saved = normalizeOwnerState(payload);
    setOwnerState(saved);
    return saved;
  };

  const verifyPublicPage = async (username: string) => {
    const expectedUsername = normalizeOneLinkUsername(username);
    if (!expectedUsername) return false;
    const response = await fetch(
      `/api/onelink?action=public&username=${encodeURIComponent(expectedUsername)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) return false;
    const payload = await response.json().catch(() => null);
    return isVerifiedOneLinkPublicResponse(
      payload,
      response.ok,
      expectedUsername,
    );
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

  if (state === "error" || !ownerState) {
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
      initialProfile={ownerState.profile}
      revision={ownerState.revision}
      published={ownerState.published}
      liveConfirmed={ownerState.liveConfirmed}
      onMutate={mutateProfile}
      onReload={loadOwnerProfile}
      verifyPublicPage={verifyPublicPage}
      loadAnalytics={loadAnalytics}
      onUploadImage={uploadImage}
    />
  );
}
