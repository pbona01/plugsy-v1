import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Copy,
  ExternalLink,
  Eye,
  Link2,
  Loader2,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Share2,
  Smartphone,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "motion/react";
import OneLinkPublicView from "./OneLinkPublicView";
import {
  OneLinkAnalytics,
  OneLinkMutationAction,
  OneLinkOwnerState,
  OneLinkProfile,
  OneLinkProject,
  OneLinkSettings,
  OneLinkSocial,
} from "../types";
import { THEME_PRESETS } from "../constants/onelink-themes";
import {
  createOneLinkItemId,
  getCanonicalOneLinkUrl,
  getOneLinkPath,
} from "../utils/onelink";
import {
  getOneLinkPlatform,
  getOneLinkPlatformLabel,
  ONE_LINK_PLATFORMS,
  OneLinkPlatformId,
} from "../utils/onelinkPlatforms";
import { cn } from "../lib/utils";
import {
  getOneLinkImageDeliveryUrl,
  OneLinkImageKind,
  OneLinkUploadResult,
} from "../utils/uploadOneLinkImage";
import {
  ONE_LINK_LIMITS,
  normalizeExternalUrl,
  validateOneLinkSavePayload,
} from "../../shared/onelink.js";
import {
  buildOneLinkSocialUrl,
  findDuplicateOneLinkSocialUrls,
  getOneLinkSocialPreset,
  parseOneLinkSocialUrl,
  supportsOneLinkSocialHandle,
} from "../../shared/onelinkSocialPresets.js";

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

interface OneLinkEditorProps {
  initialProfile: OneLinkProfile;
  revision: string | null;
  published: boolean;
  liveConfirmed: boolean;
  onMutate: (
    action: OneLinkMutationAction,
    draft?: OneLinkDraft,
  ) => Promise<OneLinkOwnerState>;
  onReload: () => Promise<void>;
  verifyPublicPage: (username: string) => Promise<boolean>;
  loadAnalytics: () => Promise<OneLinkAnalytics>;
  onUploadImage: (
    file: File,
    kind: OneLinkImageKind,
    onProgress: (status: string) => void,
  ) => Promise<OneLinkUploadResult>;
}

type SocialInputMode = "preset" | "url";
type SocialEditorState = Record<string, { mode: SocialInputMode; input: string }>;

type SectionId =
  | "page"
  | "design"
  | "links"
  | "analytics"
  | "settings";

const SECTIONS: Array<{
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: "page", label: "My Page", icon: User },
  { id: "design", label: "Design", icon: Palette },
  { id: "links", label: "Links & Socials", icon: Link2 },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

const toDraft = (profile: OneLinkProfile): OneLinkDraft => ({
  displayName: profile.displayName,
  biography: profile.biography,
  imageUrl: profile.imageUrl,
  imagePublicId: profile.imagePublicId,
  wallpaperUrl: profile.wallpaperUrl,
  wallpaperPublicId: profile.wallpaperPublicId,
  wallpaperTextMode: profile.wallpaperTextMode,
  settings: {
    ...profile.settings,
    socials: profile.settings.socials.map((social) => ({
      ...social,
    })),
    projects: profile.settings.projects.map((project) => ({
      ...project,
    })),
  },
});

const moveItem = <T,>(
  items: T[],
  index: number,
  direction: -1 | 1,
) => {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

const safeErrorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "One Link changes could not be saved.";

const createSocialEditorState = (socials: OneLinkSocial[]): SocialEditorState =>
  Object.fromEntries(socials.map((social) => {
    const parsed = parseOneLinkSocialUrl(social.platform, social.url);
    return [social.id, { mode: parsed !== null ? "preset" : "url", input: parsed ?? social.url }];
  }));

export default function OneLinkEditor({
  initialProfile,
  revision,
  published,
  liveConfirmed,
  onMutate,
  onReload,
  verifyPublicPage,
  loadAnalytics,
  onUploadImage,
}: OneLinkEditorProps) {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] =
    useState<SectionId>("page");
  const [draft, setDraft] = useState<OneLinkDraft>(() =>
    toDraft(initialProfile),
  );
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(toDraft(initialProfile)),
  );
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [mutationAction, setMutationAction] =
    useState<OneLinkMutationAction | null>(null);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [checkingPublication, setCheckingPublication] = useState(false);
  const [publicationFailed, setPublicationFailed] = useState(false);
  const [socialPickerOpen, setSocialPickerOpen] = useState(false);
  const addSocialButtonRef = useRef<HTMLButtonElement>(null);
  const socialPickerRef = useRef<HTMLDivElement>(null);
  const socialOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const socialUrlRefs = useRef(new Map<string, HTMLInputElement>());
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const mobilePreviewCloseRef = useRef<HTMLButtonElement>(null);
  const mobilePreviewDialogRef = useRef<HTMLDivElement>(null);
  const [analyticsState, setAnalyticsState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [analytics, setAnalytics] =
    useState<OneLinkAnalytics | null>(null);
  const [uploadingKind, setUploadingKind] =
    useState<OneLinkImageKind | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [socialEditorState, setSocialEditorState] = useState<SocialEditorState>(() => createSocialEditorState(initialProfile.settings.socials));

  useEffect(() => {
    const next = toDraft(initialProfile);
    setDraft(next);
    setSavedSnapshot(JSON.stringify(next));
    setSocialEditorState(createSocialEditorState(next.settings.socials));
    setRevisionConflict(false);
    setPublicationFailed(
      initialProfile.settings.published && !liveConfirmed,
    );
  }, [initialProfile, liveConfirmed]);

  const currentSnapshot = useMemo(
    () => JSON.stringify(draft),
    [draft],
  );
  const isDirty = currentSnapshot !== savedSnapshot;
  const duplicateSocialUrls = useMemo(() => findDuplicateOneLinkSocialUrls(draft.settings.socials), [draft.settings.socials]);
  const socialSaveBlocked = draft.settings.socials.some((social) => social.invalid || (normalizeExternalUrl(social.url) && duplicateSocialUrls.has(normalizeExternalUrl(social.url)!)));

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () =>
      window.removeEventListener(
        "beforeunload",
        warnBeforeUnload,
      );
  }, [isDirty]);

  useEffect(() => {
    if (!socialPickerOpen) return;
    const closePicker = (returnFocus = true) => {
      setSocialPickerOpen(false);
      if (returnFocus) {
        window.requestAnimationFrame(() => addSocialButtonRef.current?.focus());
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !socialPickerRef.current?.contains(target) &&
        !addSocialButtonRef.current?.contains(target)
      ) {
        closePicker();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => socialOptionRefs.current[0]?.focus());
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [socialPickerOpen]);

  useEffect(() => {
    if (!showMobilePreview) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowMobilePreview(false);
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        mobilePreviewDialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) || [],
      ) as HTMLElement[];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    mobilePreviewCloseRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [showMobilePreview]);

  const previewProfile: OneLinkProfile = useMemo(
    () => ({
      username: initialProfile.username,
      displayName: draft.displayName,
      biography: draft.biography,
      imageUrl: draft.imageUrl,
      imagePublicId: draft.imagePublicId,
      wallpaperUrl: draft.wallpaperUrl,
      wallpaperPublicId: draft.wallpaperPublicId,
      wallpaperTextMode: draft.wallpaperTextMode,
      messageUsername: initialProfile.messageUsername,
      settings: draft.settings,
    }),
    [draft, initialProfile.messageUsername, initialProfile.username],
  );

  const handleImageUpload = async (
    kind: OneLinkImageKind,
    file: File | null,
  ) => {
    if (!file || uploadingKind) return;
    setUploadingKind(kind);
    setUploadStatus("Preparing image…");
    try {
      const uploaded = await onUploadImage(
        file,
        kind,
        setUploadStatus,
      );
      setDraft((current) =>
        kind === "avatar"
          ? {
              ...current,
              imageUrl: uploaded.secureUrl,
              imagePublicId: uploaded.publicId,
            }
          : {
              ...current,
              wallpaperUrl: uploaded.secureUrl,
              wallpaperPublicId: uploaded.publicId,
              wallpaperTextMode:
                uploaded.detectedTextMode || "light",
            },
      );
      if (kind === "wallpaper" && uploaded.contrastDetectionFailed) {
        toast("Wallpaper added with the safe Light Text fallback.");
      } else {
        toast.success(
          kind === "avatar"
            ? "One Link profile image is ready to save."
            : "Wallpaper is ready to save.",
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "This image could not be uploaded.",
      );
    } finally {
      setUploadingKind(null);
      setUploadStatus("");
    }
  };

  const updateSettings = (
    update:
      | Partial<OneLinkSettings>
      | ((current: OneLinkSettings) => OneLinkSettings),
  ) => {
    setDraft((current) => ({
      ...current,
      settings:
        typeof update === "function"
          ? update(current.settings)
          : { ...current.settings, ...update },
    }));
  };

  const copyPublicUrl = async () => {
    if (!initialProfile.username) {
      toast.error("Set up your One Link handle before sharing.");
      return;
    }
    try {
      await navigator.clipboard.writeText(
        getCanonicalOneLinkUrl(initialProfile.username),
      );
      toast.success("One Link URL copied.");
    } catch {
      toast.error("The One Link URL could not be copied.");
    }
  };

  const sharePublicUrl = async () => {
    if (!initialProfile.username) {
      toast.error("Set up your One Link handle before sharing.");
      return;
    }
    const url = getCanonicalOneLinkUrl(initialProfile.username);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${draft.displayName}'s One Link`,
          text: `Visit ${draft.displayName} on Plugsy.`,
          url,
        });
        return;
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
      }
    }
    await copyPublicUrl();
  };

  const applyConfirmedOwner = (owner: OneLinkOwnerState) => {
    const savedDraft = toDraft(owner.profile);
    setDraft(savedDraft);
    setSavedSnapshot(JSON.stringify(savedDraft));
    setRevisionConflict(false);
  };

  const handleMutationError = (error: unknown) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ONELINK_REVISION_CONFLICT"
    ) {
      setRevisionConflict(true);
    }
    toast.error(safeErrorMessage(error));
  };

  const runDraftMutation = async (
    action: "save" | "publish",
  ) => {
    if (savingRef.current || socialSaveBlocked) return null;
    savingRef.current = true;
    setSaving(true);
    setMutationAction(action);
    try {
      const validated = validateOneLinkSavePayload({
        ...draft,
        expectedRevision: revision,
      });
      const saved = await onMutate(action, validated as OneLinkDraft);
      if (action === "publish") {
        if (!saved.published || !saved.liveConfirmed) {
          throw new Error("Publication could not be confirmed.");
        }
        setPublicationFailed(false);
        toast.success("Your One Link is live.");
      } else {
        toast.success("One Link changes saved.");
      }
      applyConfirmedOwner(saved);
      return saved;
    } catch (error) {
      if (action === "publish") setPublicationFailed(true);
      handleMutationError(error);
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
      setMutationAction(null);
    }
  };

  const saveChanges = () => runDraftMutation("save");
  const publishOneLink = () => runDraftMutation("publish");

  const unpublishOneLink = async () => {
    if (
      isDirty ||
      savingRef.current ||
      !window.confirm(
        "Unpublish your One Link? Visitors will no longer be able to open the public page.",
      )
    ) {
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setMutationAction("unpublish");
    try {
      const result = await onMutate("unpublish");
      if (result.published || result.liveConfirmed) {
        throw new Error("Unpublishing could not be confirmed.");
      }
      applyConfirmedOwner(result);
      setPublicationFailed(false);
      toast.success("Your One Link is now private.");
    } catch (error) {
      handleMutationError(error);
    } finally {
      savingRef.current = false;
      setSaving(false);
      setMutationAction(null);
    }
  };

  const viewLive = async () => {
    if (!published || !liveConfirmed || !initialProfile.username) return;
    let liveWindow: Window | null = null;
    try {
      liveWindow = window.open("about:blank", "_blank");
      if (liveWindow) liveWindow.opener = null;
    } catch {
      liveWindow = null;
    }

    if (!liveWindow || liveWindow.closed) {
      toast.error("Your browser blocked the new tab. Allow pop-ups and try again.");
      return;
    }
    setCheckingPublication(true);
    try {
      const confirmed = await verifyPublicPage(initialProfile.username);
      if (!confirmed) throw new Error("Publication could not be confirmed.");
      liveWindow.location.replace(getOneLinkPath(initialProfile.username));
    } catch (error) {
      if (!liveWindow.closed) liveWindow.close();
      toast.error(safeErrorMessage(error));
    } finally {
      setCheckingPublication(false);
    }
  };

  const goBack = () => {
    if (
      isDirty &&
      !window.confirm(
        "You have unsaved One Link changes. Leave anyway?",
      )
    ) {
      return;
    }
    navigate(-1);
  };

  const refreshAnalytics = async () => {
    setAnalyticsState("loading");
    try {
      const result = await loadAnalytics();
      setAnalytics(result);
      setAnalyticsState("ready");
    } catch {
      setAnalytics(null);
      setAnalyticsState("error");
    }
  };

  const selectSection = (section: SectionId) => {
    setActiveSection(section);
    if (
      section === "analytics" &&
      analyticsState === "idle"
    ) {
      refreshAnalytics();
    }
  };

  const updateSocial = (
    id: string,
    patch: Partial<OneLinkSocial>,
  ) => {
    updateSettings((settings) => ({
      ...settings,
      socials: settings.socials.map((social) => {
        if (social.id !== id) return social;
        const next = { ...social, ...patch };
        if (patch.url !== undefined) {
          const valid = Boolean(normalizeExternalUrl(patch.url));
          next.invalid = !valid;
          if (!valid) next.enabled = false;
        }
        return next;
      }),
    }));
  };

  const updateSocialPreset = (id: string, input: string) => {
    setSocialEditorState((current) => ({ ...current, [id]: { mode: "preset", input } }));
    const social = draft.settings.socials.find((entry) => entry.id === id);
    if (!social) return;
    const built = buildOneLinkSocialUrl(social.platform, input);
    updateSocial(id, built.valid
      ? { url: built.url, invalid: false, ...(social.invalid ? { enabled: true } : {}) }
      : { url: "", invalid: true, enabled: false });
  };

  const updateSocialUrl = (id: string, input: string) => {
    setSocialEditorState((current) => ({ ...current, [id]: { mode: "url", input } }));
    const valid = Boolean(normalizeExternalUrl(input));
    updateSocial(id, { url: input, invalid: !valid, ...(valid ? {} : { enabled: false }) });
  };

  const changeSocialMode = (id: string, mode: SocialInputMode) => {
    const social = draft.settings.socials.find((entry) => entry.id === id);
    if (!social) return;
    setSocialEditorState((current) => ({ ...current, [id]: { mode, input: mode === "url" ? social.url : (parseOneLinkSocialUrl(social.platform, social.url) || "") } }));
  };

  const selectExistingSocialPlatform = (id: string, platform: string) => {
    if (draft.settings.socials.some((social) => social.id !== id && social.platform === platform)) return;
    setSocialEditorState((current) => ({ ...current, [id]: { mode: supportsOneLinkSocialHandle(platform) ? "preset" : "url", input: "" } }));
    updateSocial(id, { platform, url: "", invalid: true, enabled: false });
  };

  const selectSocialPlatform = (platform: OneLinkPlatformId) => {
    if (draft.settings.socials.length >= ONE_LINK_LIMITS.socialLinks || draft.settings.socials.some((social) => social.platform === platform)) return;
    const id = createOneLinkItemId("social");
    updateSettings((settings) => ({
      ...settings,
      socials: [
        ...settings.socials,
        { id, platform, url: "", enabled: false, invalid: true },
      ],
    }));
    setSocialEditorState((current) => ({ ...current, [id]: { mode: supportsOneLinkSocialHandle(platform) ? "preset" : "url", input: "" } }));
    setSocialPickerOpen(false);
    window.requestAnimationFrame(() => socialUrlRefs.current.get(id)?.focus());
  };

  const handleSocialPickerKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex = index;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = (index + 1) % ONE_LINK_PLATFORMS.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex =
        (index - 1 + ONE_LINK_PLATFORMS.length) %
        ONE_LINK_PLATFORMS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = ONE_LINK_PLATFORMS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    socialOptionRefs.current[nextIndex]?.focus();
  };

  const updateProject = (
    id: string,
    patch: Partial<OneLinkProject>,
  ) => {
    updateSettings((settings) => ({
      ...settings,
      projects: settings.projects.map((project) => {
        if (project.id !== id) return project;
        const next = { ...project, ...patch };
        if (patch.url !== undefined) {
          const valid = Boolean(normalizeExternalUrl(patch.url));
          next.invalid = !valid;
          if (!valid) next.enabled = false;
        }
        return next;
      }),
    }));
  };

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#08080b] text-white lg:flex-row">
      <aside className="order-2 flex min-h-0 flex-1 flex-col border-white/10 bg-[#0d0d11] lg:order-1 lg:h-screen lg:w-[430px] lg:flex-none lg:border-r">
        <header className="border-b border-white/10 p-5">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-bold text-white/70 transition hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ArrowLeft aria-hidden="true" size={16} />
              One Link
            </button>
            {isDirty && (
              <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                Unsaved
              </span>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2.5">
            <span className="min-w-0 flex-1 truncate pl-1 text-xs text-white/55">
              {initialProfile.username
                ? `plugsy.ng/one/${initialProfile.username}`
                : "Set up your One Link handle to publish"}
            </span>
            <button
              type="button"
              onClick={copyPublicUrl}
              aria-label="Copy public One Link URL"
              className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Copy aria-hidden="true" size={15} />
            </button>
            <button
              type="button"
              onClick={sharePublicUrl}
              aria-label="Share public One Link URL"
              className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Share2 aria-hidden="true" size={15} />
            </button>
          </div>
        </header>

        <nav
          aria-label="One Link editor sections"
          className="flex gap-1 overflow-x-auto border-b border-white/10 px-3 py-3 lg:grid lg:grid-cols-5"
        >
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => selectSection(section.id)}
                className={cn(
                  "flex min-w-[76px] flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white",
                  activeSection === section.id
                    ? "bg-red-500/15 text-red-300"
                    : "text-white/45 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon size={16} />
                {section.label}
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-28 lg:pb-5">
          {revisionConflict && (
            <div className="mb-5 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-xs leading-5 text-amber-100">
              <p className="font-bold">
                Your One Link changed in another tab. Your unsaved draft is still here.
              </p>
              <button
                type="button"
                onClick={() => void onReload()}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-200/20 px-3 py-2 font-bold hover:bg-amber-200/10"
              >
                <RefreshCw aria-hidden="true" size={15} />
                Reload latest version
              </button>
            </div>
          )}
          {activeSection === "page" && (
            <div className="space-y-5">
              <SectionHeading
                title="My Page"
                description="Your creator identity across this mini-site."
              />

              <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="h-16 w-16 overflow-hidden rounded-full border border-white/10 bg-white/5">
                  {draft.imageUrl ? (
                    <img
                      src={getOneLinkImageDeliveryUrl(
                        draft.imageUrl,
                        "avatar",
                      )}
                      alt="One Link profile preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl font-black">
                      {(draft.displayName || "?")
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">Profile image</p>
                  <p className="mt-1 text-xs leading-5 text-white/45">
                    Independent from your Chat profile image.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-bold transition hover:bg-white/10",
                        uploadingKind && "pointer-events-none opacity-50",
                      )}
                    >
                      {uploadingKind === "avatar" ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Upload size={13} />
                      )}
                      {draft.imageUrl ? "Replace" : "Upload"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        className="sr-only"
                        disabled={Boolean(uploadingKind)}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0] || null;
                          event.currentTarget.value = "";
                          void handleImageUpload("avatar", file);
                        }}
                      />
                    </label>
                    {draft.imageUrl && (
                      <button
                        type="button"
                        disabled={Boolean(uploadingKind)}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            imageUrl: null,
                            imagePublicId: null,
                          }))
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {uploadingKind === "avatar" && uploadStatus && (
                <p role="status" className="text-[11px] text-white/55">
                  {uploadStatus}
                </p>
              )}

              <Field
                label="Display name"
                value={draft.displayName}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    displayName: value,
                  }))
                }
                maxLength={ONE_LINK_LIMITS.displayName}
              />
              <TextAreaField
                label="Biography"
                value={draft.biography}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    biography: value,
                  }))
                }
                maxLength={ONE_LINK_LIMITS.biography}
                rows={5}
              />
              <div>
                <label className="mb-2 block text-xs font-bold text-white/65">
                  One Link handle
                </label>
                <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3 text-sm text-white/45">
                  @{initialProfile.username || "unclaimed"}
                </div>
                <p className="mt-2 text-[11px] leading-5 text-white/35">
                  Read-only in this release and independent from Chat and Wallet.
                </p>
              </div>
            </div>
          )}

          {activeSection === "design" && (
            <div className="space-y-5">
              <SectionHeading
                title="Design"
                description="Theme changes appear in the live preview immediately."
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Object.entries(THEME_PRESETS).map(
                  ([themeId, theme]) => (
                    <button
                      key={themeId}
                      type="button"
                      onClick={() =>
                        updateSettings({
                          theme:
                            themeId as OneLinkSettings["theme"],
                        })
                      }
                      className={cn(
                        "rounded-2xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white",
                        theme.background,
                        theme.textPrimary,
                        draft.settings.theme === themeId
                          ? "border-red-400 ring-1 ring-red-400"
                          : "border-white/10 hover:border-white/25",
                      )}
                    >
                      <span className="block text-sm font-bold">
                        {theme.name}
                      </span>
                      <span
                        className={cn(
                          "mt-1 block text-[11px]",
                          theme.textSecondary,
                        )}
                      >
                        Preview theme
                      </span>
                    </button>
                  ),
                )}
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div>
                  <p className="text-sm font-bold">Wallpaper</p>
                  <p className="mt-1 text-xs leading-5 text-white/45">
                    Adds a full-page image while keeping your selected theme accents.
                  </p>
                </div>
                {draft.wallpaperUrl && (
                  <img
                    src={getOneLinkImageDeliveryUrl(
                      draft.wallpaperUrl,
                      "wallpaper",
                    )}
                    alt="Current One Link wallpaper"
                    className="h-32 w-full rounded-xl border border-white/10 object-cover object-center"
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <label
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-bold transition hover:bg-white/10",
                      uploadingKind && "pointer-events-none opacity-50",
                    )}
                  >
                    {uploadingKind === "wallpaper" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Upload size={13} />
                    )}
                    {draft.wallpaperUrl ? "Replace wallpaper" : "Upload wallpaper"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      className="sr-only"
                      disabled={Boolean(uploadingKind)}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0] || null;
                        event.currentTarget.value = "";
                        void handleImageUpload("wallpaper", file);
                      }}
                    />
                  </label>
                  {draft.wallpaperUrl && (
                    <button
                      type="button"
                      disabled={Boolean(uploadingKind)}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          wallpaperUrl: null,
                          wallpaperPublicId: null,
                          wallpaperTextMode: "light",
                        }))
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </div>
                {uploadingKind === "wallpaper" && uploadStatus && (
                  <p role="status" className="text-[11px] text-white/55">
                    {uploadStatus}
                  </p>
                )}
                {draft.wallpaperUrl && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-white/55">
                      Contrast result: {draft.wallpaperTextMode === "light" ? "Light Text" : "Dark Text"}
                    </p>
                    <div className="grid grid-cols-2 gap-2" aria-label="Wallpaper text contrast override">
                      {(["light", "dark"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              wallpaperTextMode: mode,
                            }))
                          }
                          className={cn(
                            "rounded-xl border px-3 py-2 text-[11px] font-bold transition",
                            draft.wallpaperTextMode === mode
                              ? "border-red-400 bg-red-500/15 text-red-200"
                              : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08]",
                          )}
                        >
                          {mode === "light" ? "Light Text" : "Dark Text"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === "links" && (
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <SectionHeading
                    title="Social links"
                    description={`${draft.settings.socials.length}/${ONE_LINK_LIMITS.socialLinks} used`}
                  />
                  <div className="relative shrink-0">
                    <button
                      ref={addSocialButtonRef}
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={socialPickerOpen}
                      disabled={
                        draft.settings.socials.length >=
                        ONE_LINK_LIMITS.socialLinks
                      }
                      onClick={() => setSocialPickerOpen((open) => !open)}
                      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus aria-hidden="true" size={14} />
                      Add Social
                    </button>
                    {socialPickerOpen && (
                      <div
                        ref={socialPickerRef}
                        role="listbox"
                        aria-label="Choose a social platform"
                        className="absolute right-0 z-30 mt-2 grid max-h-80 w-64 grid-cols-1 overflow-y-auto rounded-2xl border border-white/15 bg-[#17171d] p-2 shadow-2xl sm:grid-cols-2 sm:w-80"
                      >
                        {ONE_LINK_PLATFORMS.map((platform, index) => {
                          const Icon = platform.icon;
                          const alreadyAdded = draft.settings.socials.some((social) => social.platform === platform.id);
                          return (
                            <button
                              key={platform.id}
                              ref={(element) => {
                                socialOptionRefs.current[index] = element;
                              }}
                              type="button"
                              role="option"
                              aria-selected="false"
                              aria-disabled={alreadyAdded}
                              disabled={alreadyAdded}
                              onKeyDown={(event) =>
                                handleSocialPickerKeyDown(event, index)
                              }
                              onClick={() => selectSocialPlatform(platform.id)}
                              className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold text-white/80 outline-none transition hover:bg-white/10 focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-red-400"
                            >
                              <Icon size={18} className="shrink-0" />
                              {platform.label}
                              {alreadyAdded && <span className="ml-auto text-[10px] text-white/45">Added</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {draft.settings.socials.length === 0 ? (
                  <EmptyState text="Add the places where people can find you." />
                ) : (
                  <div className="space-y-3">
                    {draft.settings.socials.map((social, index) => (
                      <div
                        key={social.id}
                        className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-xs font-bold">
                            <input
                              type="checkbox"
                              checked={social.enabled}
                              disabled={social.invalid}
                              onChange={(event) =>
                                updateSocial(social.id, {
                                  enabled: event.target.checked,
                                })
                              }
                              className="h-4 w-4 accent-red-500"
                            />
                            Enabled
                          </label>
                          <ItemActions
                            index={index}
                            length={draft.settings.socials.length}
                            onMove={(direction) =>
                              updateSettings((settings) => ({
                                ...settings,
                                socials: moveItem(
                                  settings.socials,
                                  index,
                                  direction,
                                ),
                              }))
                            }
                            onDelete={() =>
                              (() => {
                                setSocialEditorState((current) => {
                                  const next = { ...current };
                                  delete next[social.id];
                                  return next;
                                });
                                updateSettings((settings) => ({
                                  ...settings,
                                  socials: settings.socials.filter((entry) => entry.id !== social.id),
                                }));
                              })()
                            }
                          />
                        </div>
                        <div className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3">
                          {React.createElement(
                            getOneLinkPlatform(social.platform)?.icon ||
                              ONE_LINK_PLATFORMS[14].icon,
                            { size: 18, className: "shrink-0 text-white/60" },
                          )}
                          <select
                            value={social.platform}
                            onChange={(event) =>
                              selectExistingSocialPlatform(social.id, event.target.value)
                            }
                            aria-label="Social platform"
                            className="min-h-11 w-full bg-transparent text-sm outline-none"
                          >
                            {!ONE_LINK_PLATFORMS.some(
                              (platform) => platform.id === social.platform,
                            ) && (
                              <option value={social.platform}>
                                {getOneLinkPlatformLabel(social.platform)} (legacy)
                              </option>
                            )}
                            {ONE_LINK_PLATFORMS.map((platform) => (
                              <option key={platform.id} value={platform.id}>
                                {platform.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        {social.invalid && (
                          <p id={`social-error-${social.id}`} role="alert" className="text-xs text-amber-300">
                            {socialEditorState[social.id]?.mode === "preset" ? "Enter a valid username or handle." : "This URL is invalid and stays hidden until corrected."}
                          </p>
                        )}
                        {supportsOneLinkSocialHandle(social.platform) && (
                          <div className="flex gap-2" role="group" aria-label="Social link input mode">
                            {(["preset", "url"] as const).map((mode) => (
                              <button key={mode} type="button" onClick={() => changeSocialMode(social.id, mode)} aria-pressed={(socialEditorState[social.id]?.mode || "url") === mode} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-white/70 focus-visible:ring-2 focus-visible:ring-red-400">
                                {mode === "preset" ? "Username / Handle" : "Use username instead"}
                              </button>
                            ))}
                          </div>
                        )}
                        <label htmlFor={`social-input-${social.id}`} className="text-xs font-bold text-white/75">
                          {socialEditorState[social.id]?.mode === "preset" && getOneLinkSocialPreset(social.platform)?.label
                            ? getOneLinkSocialPreset(social.platform)?.label
                            : `${social.platform} URL`}
                        </label>
                        {socialEditorState[social.id]?.mode === "preset" && social.platform === "whatsapp" && (
                          <p className="text-[11px] text-white/50">Include your country code.</p>
                        )}
                        <input
                          ref={(element) => {
                            if (element) socialUrlRefs.current.set(social.id, element);
                            else socialUrlRefs.current.delete(social.id);
                          }}
                          id={`social-input-${social.id}`}
                          type={socialEditorState[social.id]?.mode === "preset" && social.platform === "whatsapp" ? "tel" : "text"}
                          value={socialEditorState[social.id]?.input ?? social.url}
                          onChange={(event) => socialEditorState[social.id]?.mode === "preset" ? updateSocialPreset(social.id, event.target.value) : updateSocialUrl(social.id, event.target.value)}
                          maxLength={socialEditorState[social.id]?.mode === "preset" ? 64 : ONE_LINK_LIMITS.url}
                          aria-label={getOneLinkSocialPreset(social.platform)?.label || `${social.platform} URL`}
                          aria-describedby={social.invalid ? `social-error-${social.id}` : `social-preview-${social.id}`}
                          aria-invalid={social.invalid}
                          placeholder={socialEditorState[social.id]?.mode === "preset" ? (social.platform === "whatsapp" ? "+234 801 234 5678" : "username") : "https://example.com/you"}
                          className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-white/30"
                        />
                        {socialEditorState[social.id]?.mode === "preset" && (
                          <button type="button" onClick={() => changeSocialMode(social.id, "url")} className="text-left text-[11px] font-bold text-blue-300 underline focus-visible:ring-2 focus-visible:ring-blue-300">Paste full URL instead</button>
                        )}
                        {social.url && !social.invalid && (
                          <p id={`social-preview-${social.id}`} className="min-w-0 truncate text-[11px] text-white/55" title={social.url}>Generated link: {social.url.replace(/^https?:\/\//, "")}</p>
                        )}
                        {duplicateSocialUrls.has(normalizeExternalUrl(social.url) || "") && (
                          <p role="alert" className="text-xs text-amber-300">This destination is duplicated by another social link.</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4 border-t border-white/10 pt-7">
                <div className="flex items-start justify-between gap-3">
                  <SectionHeading
                    title="Featured links"
                    description={`${draft.settings.projects.length}/${ONE_LINK_LIMITS.featuredLinks} used`}
                  />
                  <button
                    type="button"
                    disabled={
                      draft.settings.projects.length >=
                      ONE_LINK_LIMITS.featuredLinks
                    }
                    onClick={() =>
                      updateSettings((settings) => ({
                        ...settings,
                        projects: [
                          ...settings.projects,
                          {
                            id: createOneLinkItemId("link"),
                            title: "",
                            description: "",
                            url: "",
                            enabled: true,
                          },
                        ],
                      }))
                    }
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus aria-hidden="true" size={14} />
                    Add
                  </button>
                </div>

                {draft.settings.projects.length === 0 ? (
                  <EmptyState text="Feature your best project, product, or page." />
                ) : (
                  <div className="space-y-3">
                    {draft.settings.projects.map((project, index) => (
                      <div
                        key={project.id}
                        className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-xs font-bold">
                            <input
                              type="checkbox"
                              checked={project.enabled}
                              disabled={project.invalid}
                              onChange={(event) =>
                                updateProject(project.id, {
                                  enabled: event.target.checked,
                                })
                              }
                              className="h-4 w-4 accent-red-500"
                            />
                            Enabled
                          </label>
                          <ItemActions
                            index={index}
                            length={draft.settings.projects.length}
                            onMove={(direction) =>
                              updateSettings((settings) => ({
                                ...settings,
                                projects: moveItem(
                                  settings.projects,
                                  index,
                                  direction,
                                ),
                              }))
                            }
                            onDelete={() =>
                              updateSettings((settings) => ({
                                ...settings,
                                projects: settings.projects.filter(
                                  (entry) => entry.id !== project.id,
                                ),
                              }))
                            }
                          />
                        </div>
                        <input
                          value={project.title}
                          onChange={(event) =>
                            updateProject(project.id, {
                              title: event.target.value,
                            })
                          }
                          maxLength={ONE_LINK_LIMITS.featuredTitle}
                          aria-label="Featured link title"
                          placeholder="Featured link title"
                          className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-white/30"
                        />
                        {project.invalid && (
                          <p className="text-xs text-amber-300">
                            This legacy URL is invalid and stays hidden until corrected.
                          </p>
                        )}
                        <textarea
                          value={project.description}
                          onChange={(event) =>
                            updateProject(project.id, {
                              description: event.target.value,
                            })
                          }
                          maxLength={
                            ONE_LINK_LIMITS.featuredDescription
                          }
                          aria-label="Featured link description"
                          placeholder="Short description (optional)"
                          rows={2}
                          className="w-full resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-white/30"
                        />
                        <input
                          type="url"
                          value={project.url}
                          onChange={(event) =>
                            updateProject(project.id, {
                              url: event.target.value,
                            })
                          }
                          maxLength={ONE_LINK_LIMITS.url}
                          aria-label="Featured link URL"
                          placeholder="https://example.com/project"
                          className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-white/30"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === "analytics" && (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <SectionHeading
                  title="Page views"
                  description="Privacy-conscious daily page-view totals."
                />
                <button
                  type="button"
                  onClick={refreshAnalytics}
                  disabled={analyticsState === "loading"}
                  aria-label="Refresh One Link analytics"
                  className="rounded-xl border border-white/10 p-2 text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
                >
                  <RefreshCw
                    aria-hidden="true"
                    size={15}
                    className={
                      analyticsState === "loading"
                        ? "animate-spin"
                        : ""
                    }
                  />
                </button>
              </div>

              {analyticsState === "loading" && (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 py-12 text-sm text-white/50">
                  <Loader2
                    aria-hidden="true"
                    className="animate-spin"
                    size={17}
                  />
                  Loading analytics…
                </div>
              )}
              {analyticsState === "error" && (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/5 p-5">
                  <p className="text-sm font-bold">
                    Analytics could not be loaded.
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/50">
                    No placeholder values are being shown.
                  </p>
                  <button
                    type="button"
                    onClick={refreshAnalytics}
                    className="mt-4 rounded-xl bg-white px-3 py-2 text-xs font-bold text-black"
                  >
                    Try again
                  </button>
                </div>
              )}
              {analyticsState === "ready" && analytics && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric
                      label="Total"
                      value={analytics.totalViews}
                    />
                    <Metric
                      label="Today"
                      value={analytics.todayViews}
                    />
                    <Metric
                      label="7 days"
                      value={analytics.sevenDayViews}
                    />
                  </div>
                  <div className="h-64 rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={analytics.daily}>
                        <CartesianGrid
                          stroke="rgba(255,255,255,0.06)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) =>
                            String(value).slice(5)
                          }
                          stroke="rgba(255,255,255,0.25)"
                          fontSize={10}
                          minTickGap={18}
                        />
                        <YAxis
                          allowDecimals={false}
                          stroke="rgba(255,255,255,0.25)"
                          fontSize={10}
                          width={28}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#111116",
                            border: "1px solid rgba(255,255,255,.12)",
                            borderRadius: 12,
                            color: "white",
                            fontSize: 12,
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="views"
                          stroke="#f87171"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] leading-5 text-white/35">
                    Counts page views only. No visitor identity,
                    location, device, referrer, or link clicks are
                    collected.
                  </p>
                </>
              )}
            </div>
          )}

          {activeSection === "settings" && (
            <div className="space-y-6">
              <SectionHeading
                title="Settings"
                description="Control search previews and public availability."
              />
              <div
                aria-live="polite"
                className={cn(
                  "rounded-2xl border p-4",
                  checkingPublication || mutationAction === "publish"
                    ? "border-blue-400/20 bg-blue-500/10"
                    : publicationFailed || (published && !liveConfirmed)
                      ? "border-amber-400/25 bg-amber-400/10"
                      : published && liveConfirmed
                        ? "border-emerald-400/25 bg-emerald-400/10"
                        : "border-white/10 bg-white/[0.03]",
                )}
              >
                <p className="text-sm font-black">
                  {checkingPublication || mutationAction === "publish"
                    ? "Checking publication"
                    : publicationFailed || (published && !liveConfirmed)
                      ? "Publication could not be confirmed"
                      : published && liveConfirmed
                        ? "Live"
                        : "Draft"}
                </p>
                <p className="mt-1 text-xs text-white/55">
                  {checkingPublication || mutationAction === "publish"
                    ? "Verifying the public page and its owner."
                    : publicationFailed || (published && !liveConfirmed)
                      ? "The public page is not available as confirmed live."
                      : published && liveConfirmed
                        ? "Public"
                        : "Not public"}
                </p>
              </div>
              <ToggleRow
                label="Message on Plugsy"
                description="Let visitors find your separate Chat profile."
                checked={draft.settings.messageEnabled}
                onChange={(messageEnabled) =>
                  updateSettings({ messageEnabled })
                }
              />
              <Field
                label="SEO title"
                value={draft.settings.seoTitle}
                onChange={(seoTitle) =>
                  updateSettings({ seoTitle })
                }
                maxLength={ONE_LINK_LIMITS.seoTitle}
                placeholder="Optional custom page title"
              />
              <TextAreaField
                label="SEO description"
                value={draft.settings.seoDescription}
                onChange={(seoDescription) =>
                  updateSettings({ seoDescription })
                }
                maxLength={ONE_LINK_LIMITS.seoDescription}
                placeholder="Optional search and social description"
                rows={3}
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={copyPublicUrl}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs font-bold transition hover:bg-white/[0.08]"
                >
                  <Copy aria-hidden="true" size={15} />
                  Copy URL
                </button>
                <button
                  type="button"
                  onClick={viewLive}
                  disabled={
                    saving ||
                    checkingPublication ||
                    !published ||
                    !liveConfirmed
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs font-bold transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  <ExternalLink aria-hidden="true" size={15} />
                  View Live
                </button>
              </div>
              <div className="rounded-2xl border border-blue-400/15 bg-blue-500/5 p-4 text-xs leading-5 text-blue-100/70">
                Powered by Plugsy is always displayed on every public
                One Link page.
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 grid grid-cols-2 gap-3 border-t border-white/10 bg-[#0d0d11]/95 p-4 backdrop-blur">
          <button
            type="button"
            onClick={() => setShowMobilePreview(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs font-bold transition hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-white lg:hidden"
          >
            <Smartphone aria-hidden="true" size={15} />
            Preview
          </button>
          {published && (
          <button
            type="button"
            onClick={viewLive}
            disabled={
              saving ||
              checkingPublication ||
              !published ||
              !liveConfirmed
            }
            className="hidden items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs font-bold transition hover:bg-white/[0.08] disabled:opacity-50 lg:inline-flex"
          >
            <Eye aria-hidden="true" size={15} />
            View Live
          </button>
          )}
          <button
            type="button"
            onClick={saveChanges}
            disabled={
              saving ||
              Boolean(uploadingKind) ||
              !isDirty ||
              revisionConflict ||
              socialSaveBlocked
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-3 py-3 text-xs font-bold transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutationAction === "save" ? (
              <Loader2
                aria-hidden="true"
                className="animate-spin"
                size={15}
              />
            ) : (
              <Save aria-hidden="true" size={15} />
            )}
            {mutationAction === "save"
              ? "Saving..."
              : "Save Changes"}
          </button>
          {!published ? (
            <button
              type="button"
              onClick={publishOneLink}
              disabled={saving || Boolean(uploadingKind) || revisionConflict || socialSaveBlocked}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-3 text-xs font-bold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mutationAction === "publish" ? (
                <Loader2 aria-hidden="true" className="animate-spin" size={15} />
              ) : (
                <ExternalLink aria-hidden="true" size={15} />
              )}
              {mutationAction === "publish" ? "Publishing…" : "Publish One Link"}
            </button>
          ) : (
            <button
              type="button"
              onClick={unpublishOneLink}
              disabled={saving || isDirty || revisionConflict}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-3 text-xs font-bold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mutationAction === "unpublish" ? (
                <Loader2 aria-hidden="true" className="animate-spin" size={15} />
              ) : (
                <Trash2 aria-hidden="true" size={15} />
              )}
              {mutationAction === "unpublish" ? "Unpublishing…" : "Unpublish One Link"}
            </button>
          )}
        </div>
      </aside>

      <section
        aria-label="One Link live preview"
        className="hidden flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.1),transparent_55%)] p-8 lg:flex"
      >
        <div className="h-[720px] w-[390px] overflow-hidden rounded-[3rem] border-[9px] border-black bg-black shadow-2xl">
          <div className="h-full overflow-y-auto">
            <OneLinkPublicView
              profile={previewProfile}
              preview
            />
          </div>
        </div>
      </section>

      <AnimatePresence>
      {showMobilePreview && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/85 p-3 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="One Link preview"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowMobilePreview(false);
            }
          }}
        >
          <motion.div
            ref={mobilePreviewDialogRef}
            className="flex h-[min(88dvh,800px)] max-h-[calc(100dvh-1.5rem)] w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#111116] px-4 py-3">
              <span className="text-sm font-bold">Live Preview</span>
              <button
                ref={mobilePreviewCloseRef}
                type="button"
                onClick={() => setShowMobilePreview(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-white/60 hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <OneLinkPublicView profile={previewProfile} preview />
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-base font-black">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-white/45">
        {description}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-xs font-bold text-white/65">
          {label}
        </label>
        <span className="text-[10px] text-white/30">
          {value.length}/{maxLength}
        </span>
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3 text-sm outline-none transition placeholder:text-white/25 focus:border-white/30"
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  rows: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-xs font-bold text-white/65">
          {label}
        </label>
        <span className="text-[10px] text-white/30">
          {value.length}/{maxLength}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3 text-sm leading-6 outline-none transition placeholder:text-white/25 focus:border-white/30"
      />
    </div>
  );
}

function ItemActions({
  index,
  length,
  onMove,
  onDelete,
}: {
  index: number;
  length: number;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        aria-label="Move item up"
        className="rounded-lg p-1.5 text-white/45 hover:bg-white/5 hover:text-white disabled:opacity-20"
      >
        <ArrowUp aria-hidden="true" size={14} />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === length - 1}
        aria-label="Move item down"
        className="rounded-lg p-1.5 text-white/45 hover:bg-white/5 hover:text-white disabled:opacity-20"
      >
        <ArrowDown aria-hidden="true" size={14} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete item"
        className="rounded-lg p-1.5 text-red-300/70 hover:bg-red-500/10 hover:text-red-300"
      >
        <Trash2 aria-hidden="true" size={14} />
      </button>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-white/45">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-red-500"
      />
    </label>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">
        {label}
      </p>
      <p className="mt-1 text-xl font-black">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-xs leading-5 text-white/35">
      {text}
    </div>
  );
}
