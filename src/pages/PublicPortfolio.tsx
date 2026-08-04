import { Helmet } from "react-helmet-async";
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { supabase } from "../lib/supabase";
import { SEO } from "../components/seo/SEO";
import { SafeImage } from "../components/SafeImage";
import {
  VPPortfolio,
  VPCustomCategory,
  VPPortfolioItem,
} from "../types/verification";
import {
  THEMES,
  FONT_PAIRINGS,
  CATEGORY_REACTIONS,
  generateFingerprint,
  getReactionCount,
  extractYoutubeId,
} from "../utils/verification";
import { compressAndUpload } from "../utils/uploadMedia";
import { MediaContentRenderer } from "../components/verification/MediaContentRenderer";
import { LiquidGlass } from "../components/ui/LiquidGlass";
import {
  Heart,
  Briefcase,
  ExternalLink,
  Instagram,
  Twitter,
  Linkedin,
  Youtube,
  Github,
  Mail,
  Phone,
  X,
  FileText,
  Play,
  Check,
  Edit2,
  Trash2,
  Plus,
  Dribbble,
  Globe,
} from "lucide-react";

const TikTokIcon = ({ size = 18, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.84 1.56V6.79a4.85 4.85 0 01-1.07-.1z" />
  </svg>
);

import { SparklesCore } from "../components/effects/sparkles";
import { GridPattern } from "../components/effects/grid-pattern";
import { AuroraBackground } from "../components/effects/aurora-background";
import { Waves } from "../components/effects/wave-background";
import { BackgroundGradientAnimation } from "../components/effects/background-gradient-animation";
import { BackgroundComponents } from "../components/effects/background-components";
import { HeroGeometric } from "../components/effects/shape-landing-hero";
import { GradientBackgrounds } from "../components/effects/gradient-backgrounds";
import { BackgroundPaths } from "../components/effects/background-paths";
import DemoComponent from "../components/effects/demo";
import { cn } from "../lib/utils";
import { motion } from "motion/react";
import { EditableText } from "../components/ui/editable-text";
import { PortfolioItemCard } from "../components/portfolio/PortfolioItemCard";
import { HorizontalDesignGallery } from "../components/portfolio/HorizontalDesignGallery";
import { WorkGrid } from "../components/portfolio/WorkGrid";
import { YoutubeThumbnail } from "../components/portfolio/YoutubeThumbnail";
import { getCategoryConfig, CATEGORY_CONFIG } from "../utils/categoryConfig";
import { showToast } from "../components/Toast";
import {
  EXTRA_CATEGORY_MAX_LENGTH,
  EXTRA_CATEGORY_MIN_LENGTH,
  ExtraCategoryValidationError,
  getPurchasedCategoryValues,
  normalizeExtraCategoryName,
  validateExtraCategoryName,
} from "../../shared/portfolioExtraCategory.js";

// Old MetaTagsUpdater removed in favor of Helmet

const getLinkLogoUrl = (url: string) => {
  if (!url) return "";
  try {
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      cleanUrl = "https://" + cleanUrl;
    }
    const parsed = new URL(cleanUrl);
    const domain = parsed.hostname.replace("www.", "");
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch (e) {
    return "";
  }
};

const HorizontalScrollHint = () => {
  const [visible, setVisible] = useState(() => {
    return !sessionStorage.getItem("scroll_hint_seen");
  });

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        setVisible(false);
        sessionStorage.setItem("scroll_hint_seen", "true");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes slideLeft {
          from { transform: translateX(0); opacity: 0.3; }
          to { transform: translateX(-4px); opacity: 1; }
        }
        @keyframes slideRight {
          from { transform: translateX(0); opacity: 0.3; }
          to { transform: translateX(4px); opacity: 1; }
        }
        .horizontal-scroll::-webkit-scrollbar {
          display: none;
        }
      `,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.5s ease",
          marginBottom: "12px",
        }}
      >
        {/* Animated scroll arrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            background: "rgba(255,255,255,0.06)",
            border: "0.5px solid rgba(255,255,255,0.1)",
            borderRadius: "999px",
            padding: "6px 14px",
          }}
        >
          {/* Left arrow */}
          <span
            style={{
              color: "rgba(255,255,255,0.3)",
              fontSize: "12px",
              animation: "slideLeft 1.2s ease-in-out infinite alternate",
            }}
          >
            ←
          </span>

          {/* Scroll icon — horizontal lines */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "3px",
              margin: "0 6px",
            }}
          >
            {[100, 70, 85].map((w, i) => (
              <div
                key={i}
                style={{
                  height: "2px",
                  width: w / 10 + "px",
                  background: "rgba(255,255,255,0.3)",
                  borderRadius: "1px",
                }}
              />
            ))}
          </div>

          {/* Right arrow */}
          <span
            style={{
              color: "rgba(255,255,255,0.3)",
              fontSize: "12px",
              animation: "slideRight 1.2s ease-in-out infinite alternate",
            }}
          >
            →
          </span>

          <span
            style={{
              color: "rgba(255,255,255,0.3)",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontFamily: "var(--vp-body-font)",
              marginLeft: "4px",
            }}
          >
            Scroll
          </span>
        </div>
      </div>
    </>
  );
};

const getItemThumbnail = (item: VPPortfolioItem): string | null => {
  const ytId = item.youtube_embed_id || extractYoutubeId(item.youtube_url || item.external_link || "");
  const targetYtId = ytId === "mock_video_id" ? null : ytId;

  return item.cover_image_url || 
         (item as any).customThumbnailUrl || 
         item.custom_thumbnail_url || 
         (item as any).imageUrl || 
         item.image_url || 
         (targetYtId ? `https://img.youtube.com/vi/${targetYtId}/maxresdefault.jpg` : null);
};

const VideoEmbed = ({ url, title }: { url?: string; title: string }) => {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  if (!url) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          backgroundColor: "black",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Play opacity={0.3} size={48} />
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: "black",
      }}
    >
      {loading && !error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span className="text-brand-text opacity-50 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            Loading video...
          </span>
        </div>
      )}
      {!error ? (
        <iframe
          src={url}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onLoad={(e) => {
            setLoading(false);
            try {
              const target = e.currentTarget;
              if (target && target.contentWindow) {
                target.contentWindow.postMessage(
                  JSON.stringify({
                    event: "command",
                    func: "playVideo",
                    args: [],
                  }),
                  "*",
                );
              }
            } catch (err) {
              console.warn("Could not autoplay on load:", err);
            }
          }}
          onError={() => {
            setError(true);
            setLoading(false);
          }}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            display: loading ? "none" : "block",
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "black",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <p className="text-brand-text opacity-50">
            Video is still processing.
            <br />
            Check back in a few minutes.
          </p>
        </div>
      )}
    </div>
  );
};

const groupItemsByCategory = (
  items: VPPortfolioItem[],
  categories: VPCustomCategory[],
) => {
  const grouped: Record<string, VPPortfolioItem[]> = {};

  // Add items to their categories
  items.forEach((item) => {
    const key = item.custom_category_id || "uncategorized";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  return grouped;
};

export function PortfolioSkeletonLoader() {
  return (
    <div className="min-h-screen bg-brand-bg flex flex-col p-6 relative overflow-hidden">
      <div className="w-full relative z-10 pt-24 pb-12 px-6 md:px-12 flex flex-col items-center sm:items-start max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 md:gap-6 mb-8 w-full">
          {/* Avatar Skeleton */}
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-slate-200 dark:bg-white/10 shadow-xl flex-shrink-0 animate-pulse" />

          <div className="flex flex-col items-center sm:items-start w-full mt-2 md:mt-0">
            {/* Name Skeleton */}
            <div className="h-10 md:h-14 w-64 bg-slate-200 dark:bg-white/10 rounded-lg animate-pulse mb-4" />

            {/* Badges Skeleton */}
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start mb-4">
              <div className="h-6 w-20 bg-slate-200 dark:bg-white/10 rounded-full animate-pulse" />
              <div className="h-6 w-24 bg-slate-200 dark:bg-white/10 rounded-full animate-pulse" />
            </div>

            {/* Tagline Skeleton */}
            <div className="h-4 w-48 bg-slate-200 dark:bg-white/10 rounded animate-pulse mt-4" />
          </div>
        </div>

        {/* Bio Skeleton */}
        <div className="flex flex-col gap-3 max-w-2xl text-center sm:text-left w-full mt-4">
          <div className="h-4 w-full bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
          <div className="h-4 w-5/6 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
          <div className="h-4 w-4/6 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
        </div>

        {/* Social Links Skeleton */}
        <div className="flex gap-5 mt-10 justify-center sm:justify-start w-full">
          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse" />
          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse" />
          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function PublicPortfolio({
  slugOrId,
  previewData,
  previewMode = false,
  isEditMode = false,
  onUpdatePortfolio,
  onExtraCategoryUpdated,
}: {
  slugOrId?: string;
  previewData?: VPPortfolio;
  previewMode?: boolean;
  isEditMode?: boolean;
  onUpdatePortfolio?: (updates: Partial<VPPortfolio>) => void;
  onExtraCategoryUpdated?: (name: string | null) => void;
}) {
  const { slug } = useParams<{ slug: string }>();
  const activeSlug = slugOrId || slug;

  const [portfolio, setPortfolio] = useState<VPPortfolio | null>(
    previewData || null,
  );
  const portfolioData = portfolio;
  const [categories, setCategories] = useState<VPCustomCategory[]>([]);
  const [items, setItems] = useState<VPPortfolioItem[]>([]);
  const [loading, setLoading] = useState(!previewData);
  const isLoading = loading;
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<VPPortfolioItem | null>(
    null,
  );
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [extraCategoryEditorOpen, setExtraCategoryEditorOpen] =
    useState(false);
  const [extraCategoryDraft, setExtraCategoryDraft] = useState("");
  const [extraCategorySaving, setExtraCategorySaving] = useState(false);
  const [extraCategoryError, setExtraCategoryError] = useState("");

  const [profileImageLoaded, setProfileImageLoaded] = useState(false);
  const [bioGraphicLoaded, setBioGraphicLoaded] = useState(false);
  const [isMobileScreen, setIsMobileScreen] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [showVideoComingSoon, setShowVideoComingSoon] = useState(false);

  const [uploadModalTargetAction, setUploadModalTargetAction] = useState<{
    categoryId: string | undefined;
  } | null>(null);
  const [uploadState, setUploadState] = useState<{
    title: string;
    url: string;
    file: File | null;
    isUploading: boolean;
  }>({ title: "", url: "", file: null, isUploading: false });
  const { getToken } = useAuth();

  const purchasedCategoryValues = getPurchasedCategoryValues({
    category: portfolio?.category,
    categories: (
      portfolio as (VPPortfolio & { categories?: string[] }) | null
    )?.categories,
  });
  const normalizedExtraCategoryDraft =
    normalizeExtraCategoryName(extraCategoryDraft);
  const extraCategoryDraftTooShort =
    !normalizedExtraCategoryDraft ||
    Array.from(normalizedExtraCategoryDraft).length < EXTRA_CATEGORY_MIN_LENGTH;

  const startExtraCategoryEdit = () => {
    setExtraCategoryDraft(portfolio?.extra_category_name || "");
    setExtraCategoryError("");
    setExtraCategoryEditorOpen(true);
  };

  const saveExtraCategory = async (name: string | null) => {
    if (!portfolio?.id || extraCategorySaving) return;
    setExtraCategorySaving(true);
    setExtraCategoryError("");
    try {
      const normalizedName = validateExtraCategoryName(
        name,
        purchasedCategoryValues,
      );
      const token = await getToken();
      if (!token) throw new Error("Your sign-in session has expired.");

      const response = await fetch(
        "/api/portfolio?action=update-extra-category",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            portfolioId: portfolio.id,
            name: normalizedName,
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.portfolio) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "The category badge could not be saved.",
        );
      }

      const savedName =
        typeof payload.portfolio.extra_category_name === "string"
          ? payload.portfolio.extra_category_name
          : null;
      setPortfolio((current) =>
        current
          ? { ...current, extra_category_name: savedName }
          : current,
      );
      onExtraCategoryUpdated?.(savedName);
      setExtraCategoryDraft(savedName || "");
      setExtraCategoryEditorOpen(false);
      showToast(
        savedName
          ? "Category badge saved."
          : "Category badge removed.",
        "success",
      );
    } catch (error) {
      const message =
        error instanceof ExtraCategoryValidationError
          ? error.message
          : error instanceof Error
            ? error.message
            : "The category badge could not be saved.";
      setExtraCategoryError(message);
      showToast(message, "error");
    } finally {
      setExtraCategorySaving(false);
    }
  };

  const removeExtraCategory = () => {
    if (!window.confirm("Remove your custom category badge?")) return;
    void saveExtraCategory(null);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portfolio?.id) return;

    setUploadState((pre) => ({ ...pre, isUploading: true }));

    let finalVidId = extractYoutubeId(uploadState.url) || "";
    let finalUrl = uploadState.url;

    // Handle YouTube API upload asynchronously if a file is provided
    if (uploadState.file) {
      try {
        const formData = new FormData();
        formData.append("file", uploadState.file);
        formData.append("title", uploadState.title || "Portfolio Video");

        const token = await getToken();
        const response = await fetch("/api/video?action=upload", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        const text = await response.text();
        const result = JSON.parse(text);

        if (result.success && result.videoId) {
          finalVidId = result.videoId;
          finalUrl = `https://www.youtube.com/watch?v=${result.videoId}`;
        }
      } catch (err) {
        console.error("YouTube API upload failed:", err);
      }
    }

    // Asynchronous Supabase INSERT
    const { data, error } = await supabase
      .from("vp_portfolio_items")
      .insert({
        portfolio_id: portfolio.id,
        title: uploadState.title || "New Video",
        description: "",
        item_type: "youtube",
        image_url: "",
        youtube_url: finalUrl,
        youtube_embed_id: finalVidId || "mock_video_id",
        client_name: "",
        custom_category_id: uploadModalTargetAction?.categoryId,
        tags: [],
        filter_tags: [],
        order_index: items.length,
      })
      .select()
      .single();

    setUploadState((pre) => ({ ...pre, isUploading: false }));

    if (error) {
      console.error(error);
      return;
    }

    if (data) {
      // Seamlessly close the upload modal, clear the form state,
      // and push the new video object directly into the local React state array
      setUploadModalTargetAction(null);
      setUploadState({ title: "", url: "", file: null, isUploading: false });
      setItems([...items, data]);
    }
  };

  const handlePlayVideo = (videoId: string) => {
    const clickedItem = items.find((item) => item.id === videoId);
    let liveProjectUrl =
      clickedItem?.liveProjectUrl ||
      clickedItem?.project_url ||
      clickedItem?.external_link;

    // In client view mode, if an image asset with a layered link is clicked, securely redirect seamlessly
    if (!isEditMode && liveProjectUrl && clickedItem?.item_type !== "youtube") {
      if (
        !liveProjectUrl.startsWith("http://") &&
        !liveProjectUrl.startsWith("https://")
      ) {
        liveProjectUrl = "https://" + liveProjectUrl;
      }
      window.open(liveProjectUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (!isEditMode && clickedItem?.pdf_url) {
      const cleanUrl = clickedItem.pdf_url.replace("/fl_attachment:false", "");
      const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(cleanUrl)}&embedded=true`;
      window.open(viewerUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setActivePlayerId(videoId);
  };
  const [editingItem, setEditingItem] = useState<VPPortfolioItem | null>(null);
  const [userReactions, setUserReactions] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    if (portfolio) {
      console.log("[public] portfolio bio_type:", portfolio?.bio_type);
      console.log("[public] portfolio bio_text:", portfolio?.bio_text);
      console.log(
        "[public] portfolio bio_graphic:",
        portfolio?.bio_graphic_url,
      );
    }
  }, [portfolio]);

  const bioType =
    portfolio?.bio_type ||
    (portfolio?.bio_text?.trim()
      ? "text"
      : portfolio?.bio_graphic_url?.trim()
        ? "graphic"
        : portfolio?.bio_video_url?.trim()
          ? "video"
          : null);

  const hasBioContent = !!(
    portfolio?.bio_text?.trim() ||
    portfolio?.bio_graphic_url?.trim() ||
    portfolio?.bio_video_url?.trim()
  );

  const hasLocation = portfolio?.location?.trim();
  const hasYears = portfolio?.years_experience > 0;
  const hasAvailable =
    portfolio?.available_for_hire !== null &&
    portfolio?.available_for_hire !== undefined;

  useEffect(() => {
    if (portfolio) {
      console.log("[public] location:", portfolio?.location);
      console.log("[public] years:", portfolio?.years_experience);
      console.log("[public] available:", portfolio?.available_for_hire);
    }
  }, [portfolio]);

  const hasGraphic =
    bioType === "graphic" && !!portfolio?.bio_graphic_url?.trim();
  const hasVideo = bioType === "video" && !!portfolio?.bio_video_url?.trim();
  const hasText = !!portfolio?.bio_text?.trim();

  const [bioVideoPlaying, setBioVideoPlaying] = useState(false);

  useEffect(() => {
    if (previewData) {
      setPortfolio(previewData);
    }
  }, [previewData]);

  useEffect(() => {
    if (portfolio?.id) {
      try {
        const saved = localStorage.getItem(`vp_reactions_${portfolio.id}`);
        if (saved) {
          setUserReactions(JSON.parse(saved));
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [portfolio?.id]);

  useEffect(() => {
    if (!previewMode) {
      loadData();
    } else {
      loadPreviewItems();
    }
  }, [activeSlug, previewMode, portfolio?.id]);

  useEffect(() => {
    let interval: any;
    if (previewMode && portfolio?.id && !isEditMode) {
      interval = setInterval(loadPreviewItems, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [previewMode, portfolio?.id, isEditMode]);

  useEffect(() => {
    const handleUpdateEvent = () => {
      console.log(
        "[events] vp-portfolio-updated received. Revalidating portfolio & items...",
      );
      if (previewMode) {
        loadPreviewItems();
      } else {
        loadData();
      }
    };
    window.addEventListener("vp-portfolio-updated", handleUpdateEvent);
    return () => {
      window.removeEventListener("vp-portfolio-updated", handleUpdateEvent);
    };
  }, [previewMode, activeSlug, portfolio?.id]);

  const loadPreviewItems = async () => {
    if (!portfolio?.id) return;
    const [catsRes, itemsRes, portRes] = await Promise.all([
      supabase
        .from("vp_custom_categories")
        .select("*")
        .eq("portfolio_id", portfolio.id)
        .order("order_index"),
      supabase
        .from("vp_portfolio_items")
        .select("*")
        .eq("portfolio_id", portfolio.id)
        .order("order_index"),
      supabase
        .from("vp_portfolios")
        .select("*")
        .eq("id", portfolio.id)
        .maybeSingle(),
    ]);
    if (catsRes.data) setCategories(catsRes.data);
    if (itemsRes.data) setItems(itemsRes.data);
    if (portRes.data) setPortfolio(portRes.data);
    setLoading(false);
  };

  const handleAddItem = async (itemTemplate: Partial<VPPortfolioItem>) => {
    if (!portfolio?.id) return;

    const supabasePayload: any = { ...itemTemplate };
    delete supabasePayload.imageUrl;
    delete supabasePayload.liveProjectUrl;
    delete supabasePayload.pdfUrl;
    delete supabasePayload.projectUrl;
    delete supabasePayload.externalLink;
    delete supabasePayload.linkPlatform;
    delete supabasePayload.customThumbnailUrl;
    delete supabasePayload.coverImageUrl;
    delete supabasePayload.youtubeEmbedId;
    delete supabasePayload.youtubeUrl;
    delete supabasePayload.clientName;
    delete supabasePayload.projectYear;
    delete supabasePayload.orderIndex;
    delete supabasePayload.filterTags;
    delete supabasePayload.aspectRatio;
    delete supabasePayload.videoReady;
    delete supabasePayload.textContent;
    delete supabasePayload.portfolioId;
    delete supabasePayload.customCategoryId;

    const { data, error } = await supabase
      .from("vp_portfolio_items")
      .insert({
        portfolio_id: portfolio.id,
        title: "New Item",
        description: "",
        item_type: "image",
        image_url: "",
        youtube_url: "",
        youtube_embed_id: "",
        client_name: "",
        tags: [],
        filter_tags: [],
        order_index: items.length,
        ...supabasePayload,
      })
      .select()
      .single();
    if (data) {
      setItems([...items, data]);
    } else {
      console.error(error);
      showToast("Failed to add item", "error");
    }
  };

  const getCombinedLabel = (categories: string[] | string | null) => {
    let catArray: string[] = [];
    if (Array.isArray(categories)) {
      catArray = categories;
    } else if (typeof categories === "string") {
      try {
        const parsed = JSON.parse(categories);
        catArray = Array.isArray(parsed) ? parsed : [categories];
      } catch (e) {
        catArray = [categories];
      }
    }

    if (!catArray || catArray.length === 0) return "Creative Professional";

    const mapped = catArray.map((c) =>
      c
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    );
    if (mapped.length === 1) return mapped[0];
    if (mapped.length === 2) return `${mapped[0]} & ${mapped[1]}`;
    return `${mapped[0]}, ${mapped[1]} & ${mapped.length - 2} more`;
  };

  const handleUpdateItem = async (
    id: string,
    updates: Partial<VPPortfolioItem>,
  ) => {
    setItems(
      items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );

    // Create clean payload for Supabase with only snake_case properties
    const supabasePayload: any = { ...updates };
    delete supabasePayload.imageUrl;
    delete supabasePayload.liveProjectUrl;
    delete supabasePayload.pdfUrl;
    delete supabasePayload.projectUrl;
    delete supabasePayload.externalLink;
    delete supabasePayload.linkPlatform;
    delete supabasePayload.customThumbnailUrl;
    delete supabasePayload.coverImageUrl;
    delete supabasePayload.youtubeEmbedId;
    delete supabasePayload.youtubeUrl;
    delete supabasePayload.clientName;
    delete supabasePayload.projectYear;
    delete supabasePayload.orderIndex;
    delete supabasePayload.filterTags;
    delete supabasePayload.aspectRatio;
    delete supabasePayload.videoReady;
    delete supabasePayload.textContent;
    delete supabasePayload.portfolioId;
    delete supabasePayload.customCategoryId;

    await supabase
      .from("vp_portfolio_items")
      .update(supabasePayload)
      .eq("id", id);
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      const res = await fetch("/api/portfolio?action=delete-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete item");
      }
      setItems(items.filter((item) => item.id !== id));
    } catch (e: any) {
      console.error("Failed to delete work item:", e);
      showToast("Could not delete item: " + e.message, "error");
    }
  };

  const handleAddCategory = async () => {
    if (!portfolio?.id) return;
    const name = window.prompt("Enter new category name:");
    if (!name) return;
    const { data } = await supabase
      .from("vp_custom_categories")
      .insert({
        portfolio_id: portfolio.id,
        name,
        order_index: categories.length,
      })
      .select()
      .single();
    if (data) {
      setCategories([...categories, data]);
    }
  };

  const loadData = async () => {
    try {
      const { data: port, error } = await supabase
        .from("vp_portfolios")
        .select("*")
        .eq("slug", activeSlug)
        .maybeSingle();

      console.log("[public] work_layout:", port?.work_layout);

      if (error || !port || port.status === "draft") {
        setLoading(false);
        return;
      }

      setPortfolio(port);

      if (port.status === "published") {
        const viewKey = "vp_viewed_" + activeSlug;
        if (!sessionStorage.getItem(viewKey)) {
          const incrementView = async () => {
            try {
              const { error: rpcError } = await supabase.rpc(
                "vp_increment_view",
                { p_slug: activeSlug },
              );

              console.log("[public] rpc error:", rpcError);

              if (rpcError) {
                // Fallback to direct update
                await supabase
                  .from("vp_portfolios")
                  .update({ view_count: ((port as any).view_count || 0) + 1 })
                  .eq("slug", activeSlug);
              }

              sessionStorage.setItem(viewKey, "true");
            } catch (e) {
              console.error("[public] view count error:", e);
            }
          };

          incrementView();
        }
      }

      const [catsRes, itemsRes] = await Promise.all([
        supabase
          .from("vp_custom_categories")
          .select("*")
          .eq("portfolio_id", port.id)
          .order("order_index"),
        supabase
          .from("vp_portfolio_items")
          .select("*")
          .eq("portfolio_id", port.id)
          .order("order_index"),
      ]);

      setCategories(catsRes.data || []);
      setItems(itemsRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleReaction = async (itemId: string, reactionType: string) => {
    if (!portfolio) return;
    const reactionKey = `${itemId}_${reactionType}`;
    const isSelected = !!userReactions[reactionKey];

    const updated = { ...userReactions, [reactionKey]: !isSelected };
    setUserReactions(updated);
    try {
      localStorage.setItem(
        `vp_reactions_${portfolio.id}`,
        JSON.stringify(updated),
      );
    } catch (e) {
      console.error(e);
    }

    setItems((prev) =>
      prev.map((it) => {
        if (it.id === itemId) {
          const countField = `${reactionType}_count`;
          const currentCount = (it[countField] as number) || 0;
          return {
            ...it,
            [countField]: isSelected
              ? Math.max(0, currentCount - 1)
              : currentCount + 1,
          };
        }
        return it;
      }),
    );

    try {
      const fp = generateFingerprint();
      if (!previewMode) {
        await supabase.rpc("vp_add_reaction", {
          p_item_id: itemId,
          p_portfolio_id: portfolio.id,
          p_reaction_type: reactionType,
          p_fingerprint: fp,
        });

        // External portfolio-reaction push is intentionally deferred until the persisted reaction-event contract is verified.
      }
    } catch (err) {
      console.error("Reaction failed:", err);
    }
  };

  if (loading) {
    return <PortfolioSkeletonLoader />;
  }
  if (!portfolio)
    return (
      <div className="min-h-screen flex items-center justify-center text-2xl text-red-500 font-bold">
        Portfolio not found.
      </div>
    );
  const theme = THEMES[portfolio.color_theme] || THEMES.modern;

  const hexToRgb = (hex: string) => {
    const cleanHex = hex.replace("#", "");
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  };

  const getMappedPairingId = (id: string): string => {
    if (id === "A") return "refined_editorial";
    if (id === "B") return "elegant_minimal";
    if (id === "C") return "warm_literary";
    if (id === "D") return "raw_high_impact";
    if (!id || !FONT_PAIRINGS[id as keyof typeof FONT_PAIRINGS])
      return "refined_editorial";
    return id;
  };

  const pairingId = getMappedPairingId(portfolio.font_pairing);
  const pairing =
    FONT_PAIRINGS[pairingId as keyof typeof FONT_PAIRINGS] ||
    FONT_PAIRINGS.refined_editorial;

  const getMutedForeground = (color: string) => {
    if (color && color.startsWith("#")) {
      const hex = color.replace("#", "");
      if (hex.length === 6) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, 0.6)`;
      } else if (hex.length === 3) {
        const r = parseInt(hex.substring(0, 1) + hex.substring(0, 1), 16);
        const g = parseInt(hex.substring(1, 2) + hex.substring(1, 2), 16);
        const b = parseInt(hex.substring(2, 3) + hex.substring(2, 3), 16);
        return `rgba(${r}, ${g}, ${b}, 0.6)`;
      }
    }
    return `color-mix(in srgb, ${color || "currentColor"} 60%, transparent)`;
  };

  const fontSpacing =
    {
      refined_editorial: "-0.02em",
      bold_futuristic: "-0.03em",
      elegant_minimal: "0.02em",
      raw_high_impact: "0.05em",
      warm_literary: "-0.01em",
    }[pairingId] || "normal";

  const isUppercase = ["raw_high_impact", "bold_futuristic"].includes(
    pairingId,
  );

  const heroNameFontStyle: React.CSSProperties = {
    fontFamily: "var(--vp-heading-font)",
    fontWeight: "var(--vp-heading-weight)" as any,
    fontSize: "clamp(3rem, 9vw, 7rem)",
    lineHeight: 1.0,
    letterSpacing: fontSpacing,
    textTransform: isUppercase ? "uppercase" : "none",
  };

  const subText = (() => {
    if (pairingId === "elegant_minimal" && !portfolio.tagline) {
      return "VISUAL STORYTELLING · IDENTITY SYSTEMS · CREATIVE DIRECTION";
    }
    if (portfolio.tagline) {
      const parts = portfolio.tagline
        .split(/[,|/•·]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length > 1) {
        return parts.join(" · ").toUpperCase();
      }
      return portfolio.tagline.toUpperCase();
    }
    return "BRAND & MOTION DESIGNER";
  })();

  const taglineStyle: React.CSSProperties = {
    fontFamily: "var(--vp-body-font)",
    fontWeight: "var(--vp-body-weight)" as any,
    fontSize: "clamp(0.9rem, 2.5vw, 1.2rem)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--vp-text-muted)",
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontFamily: "var(--vp-body-font)",
    fontWeight: 500,
    fontSize: "10px",
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    color: "var(--vp-accent)",
  };

  const bioTextStyle: React.CSSProperties = {
    fontFamily: "var(--vp-body-font)",
    fontWeight: 300,
    fontSize: "1.1rem",
    lineHeight: 1.8,
    color: "var(--vp-text)",
  };

  const headingFontStyle = {
    fontFamily: "var(--vp-heading-font)",
    fontWeight: "var(--vp-heading-weight)" as any,
  };

  const bodyFontStyle = {
    fontFamily: "var(--vp-body-font)",
  };

  // Mix a tiny bit of text color into the background color to get an elegant section highlight across ALL themes
  const bandBg = "color-mix(in srgb, var(--vp-text) 5%, var(--vp-bg))";

  const styleParams = {
    // Hard reset — override everything from parent
    all: "initial",
    display: "block",
    boxSizing: "border-box",

    backgroundColor: theme.bg,
    color: theme.text,
    fontFamily: pairing.subheading,
    minHeight: "100vh",
    width: "100%",
    position: "relative",

    // CSS variables scoped to this div only
    "--vp-bg": theme.bg,
    "--vp-text": theme.text,
    "--vp-text-muted": getMutedForeground(theme.text),
    "--vp-text-subtle": getMutedForeground(theme.text),
    "--vp-accent": pairing.accentColor,
    "--vp-border-accent": pairing.borderColor,
    "--vp-accent-rgb": hexToRgb(pairing.accentColor),
    "--vp-card": theme.cardBg,
    "--vp-border": theme.borderColor,
    "--vp-heading-color": theme.text,
    "--vp-heading-font": pairing.heading,
    "--vp-heading-weight": pairing.headingWeight.toString(),
    "--vp-body-font": pairing.subheading,
    "--vp-body-weight": pairing.subheadingWeight.toString(),

    // Backward compatibility variables
    "--bg": theme.bg,
    "--text": theme.text,
    "--card-bg": theme.cardBg,
    "--heading-font": pairing.heading,
    "--body-font": pairing.subheading,
    "--border": theme.borderColor,
    "--muted": theme.cardBg,
    "--muted-foreground": getMutedForeground(theme.text),
  } as React.CSSProperties;

  const bgPosClass = previewMode ? "absolute" : "fixed";

  // Filter main work grid items to explicitly EXCLUDE meta layout items
  const metaTypes = ["tool", "stat", "step", "testimonial"];
  const filteredItems = items.filter(
    (i) => !metaTypes.includes(i.item_type || "") && (activeCategory === "all" || i.custom_category_id === activeCategory),
  );

  const grouped = groupItemsByCategory(items, categories);

  // For the active live reactions inside the modal
  const liveSelectedItem =
    items.find((it) => it.id === selectedItem?.id) || selectedItem;

  const toExternalUrl = (url: string | null | undefined): string => {
    if (!url?.trim()) return "#";
    const u = url.trim();
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    return "https://" + u;
  };

  const socialLinks = [
    {
      key: "instagram_url",
      label: "Instagram",
      icon: <Instagram size={18} />,
      url: portfolio.instagram_url,
    },
    {
      key: "twitter_url",
      label: "Twitter",
      icon: <Twitter size={18} />,
      url: portfolio.twitter_url,
    },
    {
      key: "linkedin_url",
      label: "LinkedIn",
      icon: <Linkedin size={18} />,
      url: portfolio.linkedin_url,
    },
    {
      key: "tiktok_url",
      label: "TikTok",
      icon: <TikTokIcon size={18} />,
      url: portfolio.tiktok_url,
    },
    {
      key: "youtube_url",
      label: "YouTube",
      icon: <Youtube size={18} />,
      url: portfolio.youtube_url,
    },
    {
      key: "github_url",
      label: "GitHub",
      icon: <Github size={18} />,
      url: portfolio.github_url,
    },
    {
      key: "behance_url",
      label: "Behance",
      icon: (
        <span
          style={{
            fontFamily: "sans-serif",
            fontWeight: 700,
            fontSize: "13px",
          }}
        >
          Be
        </span>
      ),
      url: portfolio.behance_url,
    },
    {
      key: "dribbble_url",
      label: "Dribbble",
      icon: <Dribbble size={18} />,
      url: portfolio.dribbble_url,
    },
    {
      key: "website_url",
      label: "Website",
      icon: <Globe size={18} />,
      url: portfolio.website_url,
    },
  ];

  const renderSocialLinks = (isMobile: boolean = false) => {
    const validLinks = socialLinks.filter(
      (link) => link.url && link.url.trim() !== "",
    );
    if (validLinks.length === 0) return null;
    return (
      <div
        style={{
          display: "flex",
          gap: "20px",
          flexWrap: "wrap",
          ...(isMobile ? { marginTop: "16px" } : {}),
        }}
      >
        {validLinks.map((link) => (
          <a
            key={link.key}
            href={toExternalUrl(link.url)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            className="transition-colors flex items-center"
            style={{ color: "var(--vp-text-muted)", transition: "color 0.2s" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--vp-accent)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--vp-text-muted)")
            }
          >
            {link.icon}
          </a>
        ))}
      </div>
    );
  };

  const renderHelmet = () => {
    if (previewMode || !portfolio) return null;

    const displayName =
      portfolio.full_name || portfolio.username || "Portfolio";
    const title = `${displayName} | Plugsy`;

    const descriptionRaw =
      portfolio.tagline ||
      portfolio.bio_text ||
      portfolio.longBio ||
      `Check out ${displayName}'s portfolio.`;
    const description =
      typeof descriptionRaw === "string" && descriptionRaw.length > 160
        ? descriptionRaw.substring(0, 157) + "..."
        : descriptionRaw;

    const image =
      portfolio.avatarUrl ||
      portfolio.profile_image_url ||
      portfolio.profileImage ||
      portfolio.profile_image ||
      "https://i.postimg.cc/4dHFwnzr/IMG-1987.png";

    const url =
      typeof window !== "undefined"
        ? window.location.href
        : `https://plugsy.com/${portfolio.username || portfolio.slug || ""}`;

    return (
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />

        <meta property="og:type" content="profile" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:site_name" content={displayName} />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={image} />

        <meta name="twitter:creator" content={displayName} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={image} />
      </Helmet>
    );
  };

  const currentConfig = portfolio?.category
    ? getCategoryConfig(portfolio.category)
    : null;
  const isVideoEnabled = currentConfig ? (currentConfig.maxVideos > 0) : true;
  const isImageEnabled = currentConfig ? (currentConfig.maxImages > 0) : true;
  const imageCount = items.filter(
    (i) => i.item_type === "image" && i.image_url && !i.pdf_url,
  ).length;
  const videoCount = items.filter(
    (i) =>
      i.item_type === "youtube" ||
      i.link_platform === "youtube" ||
      i.youtube_url ||
      i.youtube_embed_id,
  ).length;

  return (
    <>
      {renderHelmet()}
      <style>{`
        .vp-scroll-hide::-webkit-scrollbar { display: none }
        .vp-scroll-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div
        id="vp-root"
        data-theme={portfolio.color_theme || "classic"}
        style={styleParams}
      >
        <div
          className="w-full text-left selection:bg-[var(--vp-accent)]/20 min-h-screen flex flex-col justify-between"
          style={{
            fontFamily: "var(--vp-body-font)",
            color: "var(--vp-text)",
            display: "block",
            boxSizing: "border-box",
            ...bodyFontStyle,
          }}
        >
          {/* BACKGROUND SCENE */}
          {portfolio.color_theme === "nebula" && (
            <div
              className={cn(
                bgPosClass,
                "inset-0 z-0 pointer-events-none w-full h-full",
              )}
            >
              <SparklesCore
                id="tsparticlesfullpage"
                background="transparent"
                minSize={0.6}
                maxSize={1.4}
                particleDensity={100}
                className="w-full h-full"
                particleColor={theme.accent}
                speed={1}
              />
            </div>
          )}
          {portfolio.color_theme === "obsidian" && (
            <div
              className={cn(
                bgPosClass,
                "inset-0 z-0 pointer-events-none w-full h-full overflow-hidden",
              )}
            >
              <BackgroundPaths title="" showContent={false} />
            </div>
          )}
          {portfolio.color_theme === "slate" && (
            <div
              className={cn(
                bgPosClass,
                "inset-0 z-0 pointer-events-none w-full h-full bg-transparent",
              )}
            >
              <AuroraBackground className="!bg-transparent dark:!bg-transparent h-full w-full opacity-50" />
            </div>
          )}
          {portfolio.color_theme === "dracula" && (
            <div
              className={cn(
                bgPosClass,
                "inset-0 z-0 pointer-events-none w-full h-full",
              )}
            >
              <Waves
                className="h-full w-full"
                backgroundColor="transparent"
                strokeColor={theme.accent}
              />
            </div>
          )}
          {portfolio.color_theme === "gradient" && (
            <div
              className={cn(
                bgPosClass,
                "inset-0 z-0 pointer-events-none w-full h-full bg-transparent",
              )}
            >
              <BackgroundGradientAnimation
                containerClassName="!h-full !w-full !absolute pointer-events-none opacity-30"
                interactive={false}
              />
            </div>
          )}
          {portfolio.color_theme === "glow" && (
            <div
              className={cn(
                bgPosClass,
                "inset-0 z-0 pointer-events-none w-full h-full bg-transparent",
              )}
            >
              <BackgroundComponents
                containerClassName="!h-full !w-full !absolute pointer-events-none"
                glowColor={theme.accent}
                opacity={0.35}
              />
            </div>
          )}
          {portfolio.color_theme === "geometric" && (
            <div
              className={cn(
                bgPosClass,
                "inset-0 z-0 pointer-events-none w-full h-full bg-transparent",
              )}
            >
              <HeroGeometric
                containerClassName="!h-full !w-full !absolute pointer-events-none"
                badge=""
                title1=""
                title2=""
              >
                <div className="hidden" />
              </HeroGeometric>
            </div>
          )}
          {portfolio.color_theme === "indigo_glow" && (
            <div
              className={cn(
                bgPosClass,
                "inset-0 z-0 pointer-events-none w-full h-full bg-transparent",
              )}
            >
              <GradientBackgrounds />
            </div>
          )}
          {portfolio.color_theme === "teal_glow" && (
            <div
              className={cn(
                bgPosClass,
                "inset-0 z-0 pointer-events-none w-full h-full bg-transparent",
              )}
            >
              <DemoComponent />
            </div>
          )}

          {/* PROFILE HEADER BLOCK */}
          <section className="w-full relative z-10 pt-24 pb-12 px-6 md:px-12 flex flex-col items-center sm:items-start max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 md:gap-6 mb-8 w-full">
              <SafeImage
                src={
                  portfolioData?.avatarUrl ||
                  portfolioData?.profile_image_url ||
                  portfolioData?.profileImage ||
                  portfolioData?.profile_image ||
                  "/assets/default-avatar.png"
                }
                alt={
                  portfolioData?.full_name || portfolio?.full_name || "Avatar"
                }
                className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border-2 border-white/10 shadow-xl flex-shrink-0 overflow-hidden"
                loading="eager"
              />
              <div className="flex flex-col items-center sm:items-start w-full">
                <h1
                  className="text-3xl md:text-5xl font-bold tracking-tight my-2 block"
                  style={{
                    color: "var(--vp-text)",
                    fontFamily: "var(--vp-heading-font)",
                  }}
                >
                  <EditableText
                    isEditMode={!!isEditMode}
                    value={
                      portfolioData?.full_name ||
                      portfolio?.full_name ||
                      portfolioData?.username ||
                      portfolio?.username ||
                      ""
                    }
                    onSave={(val) => onUpdatePortfolio?.({ full_name: val })}
                    placeholder="YOUR NAME"
                  />
                </h1>
                <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                  {(() => {
                    let catArray: string[] = [];
                    if (Array.isArray(portfolio.categories)) {
                      catArray = portfolio.categories;
                    } else if (typeof portfolio.category === "string") {
                      try {
                        const parsed = JSON.parse(portfolio.category);
                        catArray = Array.isArray(parsed)
                          ? parsed
                          : [portfolio.category];
                      } catch {
                        catArray = [portfolio.category];
                      }
                    }

                    return catArray.map((c) => {
                      const properName =
                        CATEGORY_CONFIG[c as keyof typeof CATEGORY_CONFIG]
                          ?.name || c.replace(/_/g, " ");
                      return (
                        <span
                          key={c}
                          className="px-3 py-1 text-[10px] uppercase font-bold bg-brand-accent/10 border border-brand-accent/20 rounded-full tracking-widest text-brand-accent"
                        >
                          {properName}
                        </span>
                      );
                    });
                  })()}
                  {portfolio.extra_category_name && (
                    <span
                      className="max-w-full break-words px-3 py-1 text-[10px] uppercase font-bold bg-brand-accent/10 border border-brand-accent/20 rounded-full tracking-widest text-brand-accent"
                      title={portfolio.extra_category_name}
                    >
                      {portfolio.extra_category_name}
                    </span>
                  )}
                  {isEditMode && !extraCategoryEditorOpen && (
                    portfolio.extra_category_name ? (
                      <span className="flex max-w-full flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={startExtraCategoryEdit}
                          disabled={extraCategorySaving}
                          className="min-h-9 rounded-lg border border-brand-accent/30 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-accent transition hover:bg-brand-accent/10 disabled:opacity-50"
                        >
                          Edit badge
                        </button>
                        <button
                          type="button"
                          onClick={removeExtraCategory}
                          disabled={extraCategorySaving}
                          className="min-h-9 rounded-lg border border-red-400/30 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-500 transition hover:bg-red-500/10 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={startExtraCategoryEdit}
                        className="min-h-9 rounded-lg border border-dashed border-brand-accent/40 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-accent transition hover:bg-brand-accent/10"
                      >
                        + Add category badge
                      </button>
                    )
                  )}
                  {isEditMode && extraCategoryEditorOpen && (
                    <div className="w-full max-w-md rounded-xl border border-brand-accent/20 bg-brand-accent/5 p-3 text-left">
                      <label className="sr-only" htmlFor="extra-category-name">
                        Custom category badge
                      </label>
                      <input
                        id="extra-category-name"
                        value={extraCategoryDraft}
                        onChange={(event) =>
                          setExtraCategoryDraft(event.target.value)
                        }
                        maxLength={EXTRA_CATEGORY_MAX_LENGTH}
                        placeholder="e.g. Drone Pilot"
                        className="min-h-11 w-full rounded-lg border border-brand-border bg-brand-card px-3 py-2 text-sm text-brand-text outline-none focus:border-brand-accent"
                        autoFocus
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void saveExtraCategory(extraCategoryDraft)}
                          disabled={extraCategorySaving || extraCategoryDraftTooShort}
                          className="min-h-10 rounded-lg bg-brand-accent px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
                        >
                          {extraCategorySaving ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setExtraCategoryEditorOpen(false);
                            setExtraCategoryError("");
                          }}
                          disabled={extraCategorySaving}
                          className="min-h-10 rounded-lg border border-brand-border px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-brand-text disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        {extraCategoryError && (
                          <p className="basis-full text-xs text-red-500">
                            {extraCategoryError}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 max-w-2xl text-center sm:text-left w-full">
              <h2
                className="text-xs font-semibold tracking-widest uppercase"
                style={{ color: "var(--vp-text-muted)" }}
              >
                <EditableText
                  isEditMode={!!isEditMode}
                  value={
                    portfolioData?.tagline ||
                    portfolio?.tagline ||
                    "Visionary Creative"
                  }
                  onSave={(val) => onUpdatePortfolio?.({ tagline: val })}
                  placeholder="Enter a tagline or description..."
                  multiline
                />
              </h2>

              {/* Metadata Row */}
              {(hasLocation || hasYears || hasAvailable) && (
                <div
                  className="text-[11px] font-semibold tracking-[0.08em] uppercase flex items-center justify-center gap-2 flex-wrap sm:justify-start mt-2"
                  style={{
                    color: "var(--vp-text-subtle)",
                    fontFamily: "var(--vp-body-font)",
                  }}
                >
                  {hasLocation && <span>{portfolio.location}</span>}
                  {hasLocation && hasYears && (
                    <span className="opacity-40">·</span>
                  )}
                  {hasYears && (
                    <span>{portfolio.years_experience} YRS EXP</span>
                  )}
                  {(hasLocation || hasYears) && hasAvailable && (
                    <span className="opacity-40">·</span>
                  )}
                  {hasAvailable && (
                    <span
                      style={{
                        color: portfolio.available_for_hire
                          ? "#4ade80"
                          : "var(--vp-text-subtle)",
                      }}
                    >
                      {portfolio.available_for_hire
                        ? "AVAILABLE"
                        : "NOT AVAILABLE"}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-5 mt-8 justify-center sm:justify-start w-full">
              {renderSocialLinks()}
            </div>
          </section>

          {/* BIO SECTION */}
          {(hasBioContent || isEditMode) && (
            <section
              className="w-full mx-auto relative z-10"
              style={{
                maxWidth: "1200px",
              }}
            >
              <div className="py-12 px-6 md:py-[80px] md:px-[48px]">
                <div className="flex items-center gap-2 mb-6">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: "var(--vp-accent)" }}
                  />
                  <span
                    className="uppercase"
                    style={{
                      fontSize: "10px",
                      letterSpacing: "0.2em",
                      color: "var(--vp-accent)",
                      fontFamily: "var(--vp-body-font)",
                    }}
                  >
                    About
                  </span>
                </div>

                {/* Graphic bio */}
                {hasGraphic && (
                  <div
                    style={{
                      maxWidth: "640px",
                      borderRadius: "12px",
                      overflow: "hidden",
                      marginBottom: hasText ? "32px" : 0,
                    }}
                  >
                    <SafeImage
                      src={portfolio.bio_graphic_url}
                      alt={portfolio.full_name + " bio"}
                      loading="eager"
                      style={{
                        width: "100%",
                        maxHeight: "400px",
                        objectFit: "cover",
                        objectPosition: "center top",
                        display: "block",
                        borderRadius: "12px",
                      }}
                    />
                  </div>
                )}

                {/* Video bio */}
                {hasVideo && (
                  <div
                    style={{
                      maxWidth: "640px",
                      marginBottom: hasText ? "32px" : 0,
                    }}
                  >
                    {!bioVideoPlaying ? (
                      <div
                        onClick={() => setBioVideoPlaying(true)}
                        style={{ position: "relative", cursor: "pointer" }}
                      >
                        <YoutubeThumbnail
                          videoId={extractYoutubeId(portfolio.bio_video_url)!}
                          style={{
                            width: "100%",
                            aspectRatio: "16/9",
                            objectFit: "cover",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <div
                            style={{
                              width: 56,
                              height: 56,
                              borderRadius: "50%",
                              background: "rgba(0,0,0,0.7)",
                              border: "2px solid rgba(255,255,255,0.8)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <span style={{ color: "white", fontSize: 20 }}>
                              ▶
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <iframe
                        src={
                          "https://www.youtube.com/embed/" +
                          extractYoutubeId(portfolio.bio_video_url) +
                          "?autoplay=1&rel=0&modestbranding=1&controls=1"
                        }
                        style={{
                          width: "100%",
                          aspectRatio: "16/9",
                          border: "none",
                        }}
                        allowFullScreen
                        allow="autoplay"
                        title="Bio Video"
                      />
                    )}
                  </div>
                )}

                {hasText && (
                  <div
                    className="text-sm md:text-base leading-relaxed mt-2 font-normal whitespace-pre-wrap max-w-2xl"
                    style={{ color: "var(--vp-text)" }}
                  >
                    <EditableText
                      isEditMode={!!isEditMode}
                      value={
                        portfolio?.bio_text || portfolioData?.bio_text || ""
                      }
                      onSave={(val) => onUpdatePortfolio?.({ bio_text: val })}
                      placeholder="Tell clients more about yourself in detail..."
                      multiline
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 4. High-Value Social Proof Stats Block */}
          {(items.filter((i) => i.item_type === "stat").length > 0 ||
            isEditMode) && (
            <section className="max-w-7xl mx-auto px-6 md:px-12 py-12 lg:py-16 w-full relative z-10">
              <div className="flex flex-col gap-4">
                {isEditMode && (
                  <button
                    onClick={() =>
                      handleAddItem({
                        item_type: "stat",
                        title: "50+",
                        description: "Projects",
                      })
                    }
                    className="self-start text-xs border px-3 py-1.5 rounded-md opacity-50 hover:opacity-100 flex items-center gap-1 mb-4"
                  >
                    + Add Stat
                  </button>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-10 items-start justify-center justify-items-center">
                  {items
                    .filter((i) => i.item_type === "stat")
                    .map((stat) => (
                      <div
                        key={stat.id}
                        className="flex flex-col items-center justify-center p-6 relative group w-full text-center"
                      >
                        <div
                          className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-3"
                          style={{
                            fontFamily: "var(--vp-heading-font)",
                            color: "var(--vp-text)",
                            lineHeight: 1,
                          }}
                        >
                          {isEditMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteItem(stat.id);
                              }}
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600 bg-red-500/10 hover:bg-red-500/20 w-8 h-8 rounded-full flex items-center justify-center text-lg transition-all"
                            >
                              &times;
                            </button>
                          )}
                          <EditableText
                            isEditMode={isEditMode}
                            value={stat.title}
                            onSave={(val) =>
                              handleUpdateItem(stat.id, { title: val })
                            }
                          />
                        </div>
                        <div
                          className="text-xs md:text-sm tracking-widest uppercase font-medium"
                          style={{
                            fontFamily: "var(--vp-body-font)",
                            color: "var(--vp-text-muted)",
                          }}
                        >
                          <EditableText
                            isEditMode={isEditMode}
                            value={stat.description}
                            onSave={(val) =>
                              handleUpdateItem(stat.id, { description: val })
                            }
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </section>
          )}

          {/* 5. Software Badges Container (6 cols) */}
          <section className="max-w-7xl mx-auto px-6 md:px-12 w-full relative z-10 flex justify-center lg:justify-start pt-4 border-t border-white/5 mb-16">
            <div className="flex flex-wrap items-center gap-4">
              <div
                className="text-[10px] font-bold tracking-wider uppercase w-full text-center lg:text-left mb-2"
                style={{
                  fontFamily: "var(--vp-body-font)",
                  color: "var(--vp-text-muted)",
                }}
              >
                Tools & Software We Use
                {isEditMode && (
                  <button
                    onClick={() =>
                      handleAddItem({ item_type: "tool", title: "New" })
                    }
                    className="ml-4 border px-2 py-0.5 rounded opacity-50 hover:opacity-100"
                  >
                    + Add Tool
                  </button>
                )}
              </div>
              {items
                .filter((i) => i.item_type === "tool")
                .map((tool) => (
                  <div
                    key={tool.id}
                    className="relative group w-16 h-16 flex items-center justify-center rounded-xl p-3 font-bold text-sm shadow-sm"
                    style={{
                      backgroundColor: "var(--vp-card)",
                      border: "1px solid var(--vp-border)",
                      color: "var(--vp-text)",
                      fontFamily: "var(--vp-heading-font)",
                    }}
                  >
                    {isEditMode && (
                      <div className="absolute top-1 right-1 flex gap-1 z-20 bg-black/50 backdrop-blur rounded p-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem(tool);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-white w-4 h-4 flex items-center justify-center text-[10px]"
                        >
                          <Edit2 size={10} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteItem(tool.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-red-400 w-4 h-4 flex items-center justify-center text-[10px]"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    )}
                    {tool.image_url ? (
                      <img
                        src={tool.image_url}
                        alt={tool.title}
                        loading="lazy"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div
                        className="w-full text-center truncate px-1"
                        title={tool.title}
                      >
                        {tool.title}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </section>

          {/* 6. Multi-Format Work Showcase Grids using Custom Categories */}
          <section
            id="work"
            className="max-w-7xl mx-auto px-6 md:px-12 py-16 lg:py-24 w-full relative z-10 space-y-24 md:space-y-32"
          >
            {/* Category filter bar */}
            {!isEditMode && categories.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-12 border-b border-gray-100 dark:border-[#222] pb-6">
                <button
                  onClick={() => setActiveCategory("all")}
                  style={{
                    fontFamily: "var(--vp-body-font)",
                    borderColor:
                      activeCategory === "all"
                        ? "var(--vp-border)"
                        : "transparent",
                    backgroundColor:
                      activeCategory === "all"
                        ? "var(--vp-card)"
                        : "transparent",
                    color:
                      activeCategory === "all"
                        ? "var(--vp-text)"
                        : "var(--vp-text-muted)",
                    opacity: activeCategory === "all" ? 1 : 0.6,
                  }}
                  className="px-3 py-1 text-xs tracking-widest uppercase inline-flex items-center gap-2 rounded-full cursor-pointer transition-all border hover:opacity-100"
                >
                  {activeCategory === "all" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                  )}
                  All Work
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    style={{
                      fontFamily: "var(--vp-body-font)",
                      borderColor:
                        activeCategory === cat.id
                          ? "var(--vp-border)"
                          : "transparent",
                      backgroundColor:
                        activeCategory === cat.id
                          ? "var(--vp-card)"
                          : "transparent",
                      color:
                        activeCategory === cat.id
                          ? "var(--vp-text)"
                          : "var(--vp-text-muted)",
                      opacity: activeCategory === cat.id ? 1 : 0.6,
                    }}
                    className="px-3 py-1 text-xs tracking-widest uppercase inline-flex items-center gap-2 rounded-full cursor-pointer transition-all border hover:opacity-100"
                  >
                    {activeCategory === cat.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                    )}
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            {categories.map((category) => {
              const categoryItems = filteredItems.filter(
                (i) => i.custom_category_id === category.id,
              );
              if (
                !isEditMode &&
                activeCategory !== "all" &&
                activeCategory !== category.id
              ) {
                return null;
              }
              return (
                <div key={category.id}>
                  <div className="flex items-center gap-4 mb-6 py-4 px-2">
                    <div
                      className="text-2xl font-bold"
                      style={{
                        fontFamily: "var(--vp-heading-font)",
                        color: "var(--vp-text)",
                      }}
                    >
                      <EditableText
                        isEditMode={isEditMode}
                        value={category.name}
                        onSave={async (val) => {
                          const newCats = categories.map((c) =>
                            c.id === category.id ? { ...c, name: val } : c,
                          );
                          setCategories(newCats);
                          await supabase
                            .from("vp_custom_categories")
                            .update({ name: val })
                            .eq("id", category.id);
                        }}
                      />
                    </div>
                    <div
                      className="h-[1px] flex-1 opacity-20"
                      style={{ backgroundColor: "var(--vp-text)" }}
                    />
                    {isEditMode && (
                      <button
                        onClick={async () => {
                          if (!window.confirm("Delete this category?")) return;
                          try {
                            const res = await fetch(
                              "/api/categories?action=delete",
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: category.id }),
                              },
                            );
                            const data = await res.json();
                            if (!res.ok || !data.success) {
                              throw new Error(
                                data.error || "Failed to delete category",
                              );
                            }
                            setCategories(
                              categories.filter((c) => c.id !== category.id),
                            );
                          } catch (e: any) {
                            console.error("Failed to delete category:", e);
                            showToast(
                              "Could not delete category: " + e.message,
                              "error",
                            );
                          }
                        }}
                        className="text-[10px] uppercase font-bold text-red-500 opacity-60 hover:opacity-100 transition px-2 py-1 rounded border border-red-500/20"
                      >
                        Delete Section
                      </button>
                    )}
                  </div>

                  {isEditMode && (
                    <div className={`grid ${isVideoEnabled && isImageEnabled ? "grid-cols-2 max-w-md" : "grid-cols-1 max-w-[200px]"} gap-3 w-full mx-auto mb-6`}>
                      {isVideoEnabled && (
                        <button
                          onClick={() => {
                            if (currentConfig?.showVideoComingSoon) {
                              setShowVideoComingSoon(true);
                              return;
                            }
                            if (
                              currentConfig?.maxVideos &&
                              videoCount >= currentConfig.maxVideos
                            ) {
                              showToast("Video upload limit reached", "error");
                              return;
                            }
                            setUploadModalTargetAction({
                              categoryId: category.id,
                            });
                          }}
                          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-2xl aspect-[4/3] text-center"
                        >
                          <span className="text-xl mb-1">+</span>
                          <span className="text-[11px] font-bold tracking-wider uppercase">
                            Add Video
                          </span>
                        </button>
                      )}
                      {isImageEnabled && (
                        <button
                          onClick={() => {
                            if (
                              currentConfig?.maxImages &&
                              imageCount >= currentConfig.maxImages
                            ) {
                              showToast("Image upload limit reached", "error");
                              return;
                            }
                            handleAddItem({
                              item_type: "image",
                              title: "New Reel",
                              custom_category_id: category.id,
                            });
                          }}
                          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-2xl aspect-[4/3] text-center"
                        >
                          <span className="text-xl mb-1">+</span>
                          <span className="text-[11px] font-bold tracking-wider uppercase">
                            Add Image/Reel
                          </span>
                        </button>
                      )}
                    </div>
                  )}

                  <WorkGrid
                    items={categoryItems}
                    workLayout={
                      (previewData || portfolio)?.work_layout || "grid"
                    }
                    onItemClick={(item) => handlePlayVideo(item.id)}
                    onReact={(itemId, reactionType) =>
                      toggleReaction(itemId, reactionType)
                    }
                  />
                </div>
              );
            })}

            {/* Uncategorized items */}
            {(() => {
              const uncategorizedItems = filteredItems.filter(
                (i) => !i.custom_category_id
              );
              if (uncategorizedItems.length === 0 && !isEditMode) return null;
              if (!isEditMode && activeCategory !== "all") return null;
              return (
                <div>
                  <div className="flex items-center gap-4 mb-6 py-4 px-2">
                    <div
                      className="text-2xl font-bold"
                      style={{
                        fontFamily: "var(--vp-heading-font)",
                        color: "var(--vp-text)",
                      }}
                    >
                      Other Work
                    </div>
                    <div
                      className="h-[1px] flex-1 opacity-20"
                      style={{ backgroundColor: "var(--vp-text)" }}
                    />
                  </div>

                  {isEditMode && (
                    <div className={`grid ${isVideoEnabled && isImageEnabled ? "grid-cols-2 max-w-md" : "grid-cols-1 max-w-[200px]"} gap-3 w-full mx-auto mb-6`}>
                      {isVideoEnabled && (
                        <button
                          onClick={() => {
                            if (currentConfig?.showVideoComingSoon) {
                              setShowVideoComingSoon(true);
                              return;
                            }
                            if (
                              currentConfig?.maxVideos &&
                              videoCount >= currentConfig.maxVideos
                            ) {
                              showToast("Video upload limit reached", "error");
                              return;
                            }
                            setUploadModalTargetAction({ categoryId: undefined });
                          }}
                          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-2xl aspect-[4/3] text-center"
                        >
                          <span className="text-xl mb-1">+</span>
                          <span className="text-[11px] font-bold tracking-wider uppercase">
                            Add Video
                          </span>
                        </button>
                      )}
                      {isImageEnabled && (
                        <button
                          onClick={() => {
                            if (
                              currentConfig?.maxImages &&
                              imageCount >= currentConfig.maxImages
                            ) {
                              showToast("Image upload limit reached", "error");
                              return;
                            }
                            handleAddItem({
                              item_type: "image",
                              title: "New Reel",
                            });
                          }}
                          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-2xl aspect-[4/3] text-center"
                        >
                          <span className="text-xl mb-1">+</span>
                          <span className="text-[11px] font-bold tracking-wider uppercase">
                            Add Image/Reel
                          </span>
                        </button>
                      )}
                    </div>
                  )}

                  <WorkGrid
                    items={uncategorizedItems}
                    workLayout={
                      (previewData || portfolio)?.work_layout || "grid"
                    }
                    onItemClick={(item) => handlePlayVideo(item.id)}
                    onReact={(itemId, reactionType) =>
                      toggleReaction(itemId, reactionType)
                    }
                  />
                </div>
              );
            })()}

            {/* Add Category Button at bottom of work section */}
            {isEditMode && (
              <button
                onClick={handleAddCategory}
                className="portfolio-btn border border-dashed rounded-xl w-full py-8 flex flex-col items-center justify-center opacity-50 hover:opacity-100 transition shadow-sm"
                style={{
                  borderColor: "var(--vp-border)",
                  color: "var(--vp-text)",
                }}
              >
                <Plus className="w-8 h-8 mb-2" />
                <span className="font-bold uppercase tracking-widest text-xs">
                  + Add New Category
                </span>
              </button>
            )}

            {/* Fallback state logic if there are no categories yet */}
            {categories.length === 0 &&
              filteredItems.filter(
                (i) =>
                  !i.custom_category_id &&
                  (i.item_type === "youtube" || i.item_type === "image"),
              ).length === 0 &&
              !isEditMode && (
                <div
                  className="text-center py-24 border rounded-xl opacity-50"
                  style={{
                    borderColor: "var(--vp-border)",
                    color: "var(--vp-text)",
                  }}
                >
                  No portfolios sections available.
                </div>
              )}
          </section>

          {/* 5. Horizontal Process Stepper Grid */}
          <section
            className="max-w-7xl mx-auto px-6 md:px-12 py-16 lg:py-24 w-full relative z-10 border-t"
            style={{ borderColor: "var(--vp-border)" }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              {/* Left Header Sticky Node (4 Cols) */}
              <div className="lg:col-span-4 lg:sticky lg:top-24 h-max">
                <div
                  className="text-xs font-bold tracking-[0.2em] uppercase mb-4"
                  style={{
                    color: "var(--vp-accent)",
                    fontFamily: "var(--vp-body-font)",
                  }}
                >
                  The Process
                </div>
                <h2
                  className="text-4xl lg:text-5xl font-bold leading-tight"
                  style={{
                    fontFamily: "var(--vp-heading-font)",
                    color: "var(--vp-text)",
                  }}
                >
                  How We
                  <br />
                  Collaborate
                </h2>
              </div>

              {/* Right Cards Stepper Matrix (8 Cols) */}
              <div className="lg:col-span-8 flex flex-col gap-4">
                {isEditMode && (
                  <button
                    onClick={() =>
                      handleAddItem({
                        item_type: "step",
                        title: "New Step",
                        description: "Describe your process here",
                      })
                    }
                    className="self-start text-xs border px-3 py-1.5 rounded-md opacity-50 hover:opacity-100 flex items-center gap-1"
                  >
                    + Add Step
                  </button>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {items
                    .filter((i) => i.item_type === "step")
                    .map((step, index) => (
                      <div
                        key={step.id}
                        className="relative group p-8 rounded-xl border flex flex-col items-start shadow-sm backdrop-blur-xl bg-brand-bg/5 dark:bg-brand-text/10 transition-colors"
                        style={{ borderColor: "var(--vp-border)" }}
                      >
                        {isEditMode && (
                          <button
                            onClick={() => handleDeleteItem(step.id)}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-red-500 text-white w-5 h-5 rounded-md flex items-center justify-center text-[10px]"
                          >
                            &times;
                          </button>
                        )}
                        <div
                          className="text-3xl font-bold opacity-20 mb-6"
                          style={{
                            fontFamily: "var(--vp-heading-font)",
                            color: "var(--vp-text)",
                          }}
                        >
                          0{index + 1}
                        </div>
                        <h3
                          className="text-xl font-bold mb-3 w-full"
                          style={{
                            fontFamily: "var(--vp-heading-font)",
                            color: "var(--vp-text)",
                          }}
                        >
                          <EditableText
                            isEditMode={isEditMode}
                            value={step.title}
                            onSave={(val) =>
                              handleUpdateItem(step.id, { title: val })
                            }
                          />
                        </h3>
                        <p
                          className="text-sm opacity-60 leading-relaxed w-full"
                          style={{
                            fontFamily: "var(--vp-body-font)",
                            color: "var(--vp-text)",
                          }}
                        >
                          <EditableText
                            isEditMode={isEditMode}
                            value={step.description}
                            onSave={(val) =>
                              handleUpdateItem(step.id, { description: val })
                            }
                            multiline
                          />
                        </p>
                      </div>
                    ))}
                  {items.filter((i) => i.item_type === "step").length === 0 &&
                    !isEditMode && (
                      <div className="opacity-50 text-sm italic">
                        No process steps added yet.
                      </div>
                    )}
                </div>
              </div>
            </div>
          </section>

          {/* 6. Double-Column Testimonials Matrix */}
          <section className="max-w-7xl mx-auto px-6 md:px-12 py-16 lg:py-24 w-full relative z-10 bg-brand-text/5 dark:bg-brand-bg/5 rounded-3xl mb-24">
            <div className="flex flex-col items-center mb-16 gap-4">
              <div className="text-center">
                <div
                  className="text-xs font-bold tracking-[0.2em] uppercase mb-4"
                  style={{
                    color: "var(--vp-accent)",
                    fontFamily: "var(--vp-body-font)",
                  }}
                >
                  Testimonials
                </div>
                <h2
                  className="text-4xl font-bold"
                  style={{
                    fontFamily: "var(--vp-heading-font)",
                    color: "var(--vp-text)",
                  }}
                >
                  Client Feedback
                </h2>
              </div>
              {isEditMode && (
                <button
                  onClick={() =>
                    handleAddItem({
                      item_type: "testimonial",
                      title: "Alex C.",
                      description: "Incredible attention to detail.",
                      client_name: "Creative Director",
                    })
                  }
                  className="text-xs border px-4 py-2 rounded-md opacity-50 hover:opacity-100 flex items-center gap-2"
                >
                  + Add Testimonial
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {items
                .filter((i) => i.item_type === "testimonial")
                .map((review) => (
                  <div
                    key={review.id}
                    className="relative group flex flex-col justify-between p-8 rounded-xl border shadow-sm backdrop-blur-xl bg-brand-bg/5 dark:bg-brand-text/10 transition-colors"
                    style={{ borderColor: "var(--vp-border)" }}
                  >
                    {isEditMode && (
                      <button
                        onClick={() => handleDeleteItem(review.id)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-red-500 text-white w-5 h-5 rounded-md flex items-center justify-center text-[10px] z-10"
                      >
                        &times;
                      </button>
                    )}

                    <p
                      className="text-base italic opacity-80 mb-8 leading-relaxed"
                      style={{
                        fontFamily: "var(--vp-body-font)",
                        color: "var(--vp-text)",
                      }}
                    >
                      "
                      <EditableText
                        isEditMode={isEditMode}
                        value={review.description}
                        onSave={(val) =>
                          handleUpdateItem(review.id, { description: val })
                        }
                        multiline
                      />
                      "
                    </p>
                    <div className="flex items-center gap-4">
                      <div
                        className="w-10 h-10 rounded-full bg-brand-surface dark:bg-brand-surface border-brand-border shrink-0 border"
                        style={{ borderColor: "var(--vp-accent)" }}
                      />
                      <div>
                        <div
                          className="font-bold text-sm"
                          style={{
                            fontFamily: "var(--vp-heading-font)",
                            color: "var(--vp-text)",
                          }}
                        >
                          <EditableText
                            isEditMode={isEditMode}
                            value={review.title}
                            onSave={(val) =>
                              handleUpdateItem(review.id, { title: val })
                            }
                          />
                        </div>
                        <div
                          className="text-[10px] uppercase tracking-wider opacity-50"
                          style={{
                            fontFamily: "var(--vp-body-font)",
                            color: "var(--vp-text)",
                          }}
                        >
                          <EditableText
                            isEditMode={isEditMode}
                            value={review.client_name || "Role"}
                            onSave={(val) =>
                              handleUpdateItem(review.id, { client_name: val })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              {items.filter((i) => i.item_type === "testimonial").length ===
                0 &&
                !isEditMode && (
                  <div className="col-span-full text-center opacity-50 italic text-sm py-8 lg:col-span-3">
                    No testimonials added yet.
                  </div>
                )}
            </div>
          </section>

          {/* CONTACT SECTION - STYLISH THEMED BAND */}
          <section
            className="py-[60px] lg:py-[100px] w-full text-center relative z-10 transition-colors border-t border-b"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--vp-bg) 95%, var(--vp-text) 5%)",
              borderColor: "var(--vp-border)",
            }}
          >
            <div className="max-w-[600px] mx-auto px-6 flex flex-col items-center">
              <h2
                className="uppercase mb-2 text-[clamp(2.5rem,5vw,4rem)] pb-2"
                style={{
                  fontFamily: "var(--vp-heading-font)",
                  fontWeight: "var(--vp-heading-weight)" as any,
                  lineHeight: 1.1,
                  color: "var(--vp-text)",
                }}
              >
                Let's Work Together
              </h2>

              {portfolio.tagline && (
                <p
                  className="mb-6 font-light text-[1rem]"
                  style={{ color: "var(--vp-text-muted)" }}
                >
                  {portfolio.tagline}
                </p>
              )}

              <div
                className="w-[60px] h-[1px] mb-[24px]"
                style={{ backgroundColor: "var(--vp-accent)" }}
              />

              <div className="flex flex-row items-center justify-center gap-3 w-full max-w-sm">
                {portfolio.whatsapp_number && (
                  <a
                    href={`https://wa.me/${portfolio.whatsapp_number.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-[14px] px-[28px] text-brand-text flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                    style={{
                      backgroundColor: "#22c55e",
                      fontFamily: "var(--vp-body-font)",
                      fontWeight: 500,
                      fontSize: "13px",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    WhatsApp
                  </a>
                )}
                {portfolio.email_contact && (
                  <a
                    href={`mailto:${portfolio.email_contact}`}
                    className="flex-1 py-[14px] px-[28px] border flex items-center justify-center gap-2 hover:bg-brand-text/5 dark:hover:bg-brand-bg/5 transition-opacity"
                    style={{
                      borderColor: "var(--vp-border)",
                      color: "var(--vp-text)",
                      fontFamily: "var(--vp-body-font)",
                      fontWeight: 500,
                      fontSize: "13px",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    Email
                  </a>
                )}
              </div>
            </div>
          </section>

          {/* MINIMAL FOOTER */}
          <footer
            className="py-[40px] px-6 text-center md:text-left relative z-10 border-t w-full"
            style={{
              borderColor: "var(--vp-border)",
              backgroundColor: "var(--vp-bg)",
            }}
          >
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
              <p
                style={{
                  fontFamily: "var(--vp-body-font)",
                  color: "var(--vp-text-muted)",
                }}
              >
                {portfolio.full_name}
              </p>
              <p
                className="flex items-center justify-center md:justify-end gap-1.5"
                style={{
                  fontFamily: "var(--vp-body-font)",
                  fontSize: "11px",
                  color: "var(--vp-text-subtle)",
                }}
              >
                Verified on Plugsy{" "}
                <span style={{ color: "var(--vp-accent)" }}>•</span>{" "}
                @TruthOverComfort
              </p>
            </div>
          </footer>
        </div>

        {/* DYNAMICS INTERACTIVE WORK ITEM MODAL */}
        {activePlayerId &&
          (() => {
            const playingItem = items.find((i) => i.id === activePlayerId);
            if (!playingItem) return null;
            const isVertical = playingItem.aspect_ratio === "vertical";

            return (
              <div
                className="fixed inset-0 z-50 bg-brand-bg/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
                onClick={() => setActivePlayerId(null)}
              >
                <LiquidGlass
                  blur={12}
                  chromaticAberration={2}
                  color="black"
                  className={`w-full ${isVertical ? "max-w-lg aspect-[9/16]" : "max-w-5xl aspect-video"} relative rounded-[30px] overflow-hidden shadow-2xl flex items-center justify-center p-3 cursor-default`}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  {/* Floating Apple-style minimalist top right close target */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActivePlayerId(null);
                    }}
                    className="absolute top-5 right-5 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-black/40 hover:bg-black/85 text-white/60 hover:text-white transition-all cursor-pointer backdrop-blur-md border border-white/10 p-3"
                    title="Close"
                  >
                    <X size={20} />
                  </button>

                  <div
                    className="w-full h-full relative rounded-[20px] overflow-hidden bg-black flex items-center justify-center pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MediaContentRenderer item={playingItem} autoplay={true} />
                  </div>
                </LiquidGlass>
              </div>
            );
          })()}

        {selectedItem && liveSelectedItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-brand-bg/95 backdrop-blur-sm shadow-2xl"
            onClick={() => setSelectedItem(null)}
          >
            <div
              className="relative w-full max-w-4xl bg-brand-card border text-brand-text overflow-y-auto max-h-[90vh] rounded-none outline-none shadow-2xl transition-all duration-300"
              style={{
                borderColor: "var(--vp-border)",
                backgroundColor: "var(--vp-card)",
                color: "var(--vp-text)",
                ...bodyFontStyle,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button with sharp edges */}
              <button
                onClick={() => setSelectedItem(null)}
                className="absolute top-4 right-4 z-50 flex items-center justify-center w-10 h-10 bg-black/60 hover:bg-black/80 text-brand-text transition cursor-pointer backdrop-blur-md border border-white/10 rounded-none"
              >
                <X size={20} />
              </button>

              {/* Media presentation block */}
              <div
                className={`w-full ${liveSelectedItem.item_type === "image" || liveSelectedItem.tags?.includes("aspect:9:16") ? "aspect-[9/16] sm:aspect-[4/5] max-h-[80vh] md:max-h-[600px] w-auto mx-auto" : "aspect-video"} bg-black relative flex items-center justify-center`}
              >
                <MediaContentRenderer
                  item={liveSelectedItem}
                  autoplay={false}
                />
              </div>

              {/* Content Details section */}
              <div className="p-8">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <h2
                    style={{
                      fontFamily: "var(--vp-heading-font)",
                      ...headingFontStyle,
                    }}
                    className="text-2xl md:text-3xl font-bold tracking-tight"
                  >
                    {liveSelectedItem.title}
                  </h2>
                  <span
                    className="text-sm uppercase tracking-widest font-black"
                    style={{ color: "var(--vp-text-muted)" }}
                  >
                    {liveSelectedItem.project_year || new Date().getFullYear()}
                  </span>
                </div>

                <p
                  className="flex items-center gap-1.5 mb-6 text-sm opacity-80"
                  style={{ color: "var(--vp-text-muted)" }}
                >
                  <Briefcase size={14} />
                  {liveSelectedItem.client_name || "Confidential"}
                </p>

                {liveSelectedItem.filter_tags &&
                  liveSelectedItem.filter_tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-8 animate-fade-in">
                      {liveSelectedItem.filter_tags.map((tag, i) => (
                        <span
                          key={i}
                          className="uppercase tracking-widest px-2 py-1 border text-xs"
                          style={{
                            borderColor: "var(--vp-border)",
                            color: "var(--vp-text-muted)",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                {(liveSelectedItem.project_url || liveSelectedItem.liveProjectUrl || liveSelectedItem.external_link) && (
                  <div className="mb-8">
                    <a
                      href={toExternalUrl(
                        liveSelectedItem.project_url || 
                        liveSelectedItem.liveProjectUrl || 
                        liveSelectedItem.external_link || ""
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold uppercase tracking-widest transition-all"
                      style={{
                        backgroundColor: "var(--vp-text)",
                        color: "var(--vp-bg)",
                      }}
                    >
                      View Live Project
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    </a>
                  </div>
                )}

                {/* Interactive large reactions buttons inside details modal */}
                <div
                  className="border-t pt-8 mt-8 flex flex-col items-center"
                  style={{ borderColor: "var(--vp-border)" }}
                >
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.2em] mb-4 text-center"
                    style={{ color: "var(--vp-text-muted)" }}
                  >
                    Leave a reaction
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {(CATEGORY_REACTIONS[portfolio.category] || []).map(
                      (reaction, i) => {
                        const reactionKey = `${liveSelectedItem.id}_${reaction.type}`;
                        const isSelected = !!userReactions[reactionKey];
                        const count = getReactionCount(
                          liveSelectedItem,
                          reaction.type,
                        );

                        return (
                          <motion.button
                            whileTap={{ scale: 0.92 }}
                            whileHover={{ scale: 1.05 }}
                            transition={{
                              type: "spring",
                              stiffness: 300,
                              damping: 25,
                            }}
                            key={i}
                            onClick={() =>
                              toggleReaction(liveSelectedItem.id, reaction.type)
                            }
                            className={cn(
                              "flex items-center justify-center gap-3 px-6 py-3 rounded-full transition-all duration-300 relative group cursor-pointer overflow-hidden",
                            )}
                            style={{
                              border: `1px solid ${isSelected ? "var(--vp-accent)" : "var(--vp-border)"}`,
                              backgroundColor: isSelected
                                ? "rgba(var(--vp-accent-rgb), 0.1)"
                                : "var(--vp-bg)",
                              color: isSelected
                                ? "var(--vp-accent)"
                                : "var(--vp-text)",
                              boxShadow: isSelected
                                ? "0 8px 20px -8px var(--vp-accent)"
                                : "shadow-sm",
                            }}
                          >
                            <motion.span
                              key={isSelected ? "selected" : "unselected"}
                              initial={{
                                scale: 0.8,
                                rotate: isSelected ? -10 : 10,
                              }}
                              animate={{ scale: 1, rotate: 0 }}
                              transition={{
                                type: "spring",
                                stiffness: 400,
                                damping: 10,
                              }}
                              className="text-2xl filter drop-shadow-sm group-hover:scale-110 transition-transform duration-300"
                            >
                              {reaction.emoji}
                            </motion.span>
                            <span className="text-sm font-bold tracking-widest uppercase">
                              {count}
                            </span>
                          </motion.button>
                        );
                      },
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* UPLOAD MODAL COMPONENT */}
        {uploadModalTargetAction && (
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-brand-text/50"
            onClick={() => setUploadModalTargetAction(null)}
          >
            <LiquidGlass
              blur={16}
              chromaticAberration={2}
              className="w-full max-w-md bg-brand-surface/70 border border-neutral-800 p-6 rounded-[30px] shadow-xl flex flex-col gap-4 text-left pointer-events-auto"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              style={{ color: "var(--vp-text)" }}
            >
              <div className="flex justify-between items-center border-b border-neutral-800 pb-4 mb-2">
                <h3 className="font-bold text-lg text-brand-text">
                  Upload Video
                </h3>
                <button
                  onClick={() => setUploadModalTargetAction(null)}
                  className="opacity-50 hover:opacity-100"
                >
                  <X size={20} />
                </button>
              </div>

              <form
                onSubmit={handleUploadSubmit}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-widest font-bold opacity-60">
                    Title
                  </label>
                  <input
                    required
                    autoFocus
                    placeholder="My Video Title"
                    className="bg-brand-surface border-brand-border border-none rounded-md p-3 outline-none text-brand-text text-sm"
                    value={uploadState.title}
                    onChange={(e) =>
                      setUploadState({ ...uploadState, title: e.target.value })
                    }
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-widest font-bold opacity-60">
                    YouTube URL
                  </label>
                  <input
                    placeholder="https://youtube.com/watch?v=..."
                    className="bg-brand-surface border-brand-border border-none rounded-md p-3 outline-none text-brand-text text-sm"
                    value={uploadState.url}
                    onChange={(e) =>
                      setUploadState({ ...uploadState, url: e.target.value })
                    }
                  />
                </div>

                <div className="text-xs uppercase tracking-widest font-bold opacity-60 text-center">
                  - OR -
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-widest font-bold opacity-60">
                    Upload Video File
                  </label>
                  <input
                    type="file"
                    accept="video/*"
                    className="text-sm"
                    onChange={(e) =>
                      setUploadState({
                        ...uploadState,
                        file: e.target.files?.[0] || null,
                      })
                    }
                  />
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setUploadModalTargetAction(null)}
                    className="px-4 py-2 font-bold text-sm text-gray-500 hover:text-brand-text"
                    disabled={uploadState.isUploading}
                  >
                    Cancel
                  </button>
                  <LiquidGlass
                    button
                    color="black"
                    type="submit"
                    chromaticAberration={2}
                    disabled={uploadState.isUploading}
                    className="px-6 py-2 shadow-sm rounded-[30px] transition disabled:opacity-50"
                  >
                    {uploadState.isUploading ? "Uploading..." : "Save Video"}
                  </LiquidGlass>
                </div>
              </form>
            </LiquidGlass>
          </div>
        )}

        {/* COMING SOON MODAL OVERLAY */}
        {showVideoComingSoon && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.85)",
              backdropFilter: "blur(8px)",
              zIndex: 350,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
            onClick={() => setShowVideoComingSoon(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#0A0A0C",
                border: "0.5px solid rgba(255,255,255,0.1)",
                borderRadius: "20px",
                padding: "32px 24px",
                maxWidth: "320px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.04)",
                  border: "0.5px solid rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                  fontSize: "20px",
                }}
              >
                🔒
              </div>
              <div
                style={{
                  display: "inline-flex",
                  background: "rgba(255,255,255,0.04)",
                  border: "0.5px solid rgba(255,255,255,0.08)",
                  borderRadius: "999px",
                  padding: "4px 14px",
                  marginBottom: "12px",
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.2em",
                    color: "rgba(255,255,255,0.4)",
                  }}
                >
                  COMING SOON
                </span>
              </div>
              <p
                style={{
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 600,
                  margin: "0 0 8px",
                }}
              >
                Direct Video Upload
              </p>
              <p
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "12px",
                  lineHeight: 1.5,
                  margin: "0 0 20px",
                }}
              >
                This feature is launching soon. For now, use "Add Image/Reel"
                to paste a video link from YouTube instead.
              </p>
              <button
                onClick={() => setShowVideoComingSoon(false)}
                style={{
                  background: "#EF4444",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 24px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Got it
              </button>
            </div>
          </div>
        )}

        {/* EDITING ITEM MODAL */}
        {editingItem && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setEditingItem(null)}
          >
            <div
              className="w-full max-w-lg bg-white dark:bg-[#0F0F12] border border-black/10 dark:border-zinc-800 p-6 rounded-2xl shadow-2xl flex flex-col gap-4 text-left transition-all"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b border-black/5 dark:border-zinc-800 pb-4 mb-2">
                <h3 className="font-extrabold text-lg text-slate-900 dark:text-white tracking-tight">
                  Edit Portfolio Item
                </h3>
                <button
                  onClick={() => setEditingItem(null)}
                  className="text-slate-400 hover:text-slate-900 dark:text-neutral-500 dark:hover:text-white transition"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Title Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400">
                  Title
                </label>
                <input
                  className="w-full text-sm py-2.5 px-3.5 rounded-xl border outline-none transition-all bg-white/60 border-black/10 text-slate-900 focus:border-slate-400 dark:bg-[#0A0A0C] dark:border-white/10 dark:text-white dark:focus:border-white/30"
                  value={editingItem.title}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, title: e.target.value })
                  }
                  placeholder="Project Title"
                />
              </div>

              {/* Description Tag */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400">
                  Description
                </label>
                <textarea
                  className="w-full text-sm py-2.5 px-3.5 rounded-xl border outline-none transition-all bg-white/60 border-black/10 text-slate-900 focus:border-slate-400 dark:bg-[#0A0A0C] dark:border-white/10 dark:text-white dark:focus:border-white/30 resize-none min-h-[70px]"
                  value={editingItem.description || ""}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      description: e.target.value,
                    })
                  }
                  placeholder="Describe your design or video masterpiece..."
                  rows={3}
                />
              </div>

              {/* Live Project URL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400">
                  Live Project URL / Link
                </label>
                <input
                  className="w-full text-sm py-2.5 px-3.5 rounded-xl border outline-none transition-all bg-white/60 border-black/10 text-slate-900 focus:border-slate-400 dark:bg-[#0A0A0C] dark:border-white/10 dark:text-white dark:focus:border-white/30"
                  value={
                    editingItem.liveProjectUrl ||
                    editingItem.project_url ||
                    editingItem.external_link ||
                    ""
                  }
                  onChange={(e) => {
                    const urlVal = e.target.value;
                    setEditingItem({
                      ...editingItem,
                      liveProjectUrl: urlVal,
                      project_url: urlVal,
                      external_link: urlVal,
                    });
                  }}
                  placeholder="https://live-project-website.com"
                />
              </div>

              {/* YouTube video option support */}
              {editingItem.item_type === "youtube" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400">
                    YouTube URL (Video items only)
                  </label>
                  <input
                    className="w-full text-sm py-2.5 px-3.5 rounded-xl border outline-none transition-all bg-white/60 border-black/10 text-slate-900 focus:border-slate-400 dark:bg-[#0A0A0C] dark:border-white/10 dark:text-white dark:focus:border-white/30"
                    placeholder="https://youtube.com/watch?v=..."
                    value={editingItem.youtube_url || ""}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        youtube_url: e.target.value,
                      })
                    }
                  />
                </div>
              )}

              {/* Image Preview & Upload zone */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400">
                  Cover Photo / Image Screenshot
                </label>

                <div className="grid grid-cols-5 gap-3 items-center">
                  {/* Upload preview frame */}
                  <div className="col-span-2 relative group aspect-square bg-slate-100 dark:bg-[#16161a] rounded-xl overflow-hidden border border-black/10 dark:border-zinc-800 flex items-center justify-center">
                    {editingItem.image_url ? (
                      <SafeImage
                        src={editingItem.image_url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 dark:text-zinc-600">
                        No Image
                      </span>
                    )}
                  </div>

                  {/* Upload button option */}
                  <div className="col-span-3 flex flex-col gap-2">
                    <label className="cursor-pointer border border-dashed border-black/10 dark:border-white/10 rounded-xl p-3 flex flex-col items-center justify-center bg-white/40 dark:bg-[#0A0A0C]/40 hover:border-blue-500 hover:bg-blue-500/5 transition-all text-center">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#2563eb]">
                        Replace File
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          if (e.target.files && e.target.files[0]) {
                            try {
                              const url = await compressAndUpload(
                                e.target.files[0],
                              );
                              setEditingItem({
                                ...editingItem,
                                image_url: url,
                              });
                            } catch (err: any) {
                              showToast(
                                "Upload failed: " + err.message,
                                "error",
                              );
                            }
                          }
                        }}
                      />
                    </label>

                    <input
                      className="w-full text-xs py-2 px-2.5 rounded-lg border outline-none transition-all bg-white/60 border-black/10 text-slate-900 focus:border-slate-400 dark:bg-[#0A0A0C] dark:border-white/10 dark:text-white dark:focus:border-white/30"
                      placeholder="Or Paste Image URL..."
                      value={editingItem.image_url || ""}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          image_url: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-black/5 dark:border-zinc-800">
                <button
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 font-bold text-sm text-slate-400 hover:text-slate-900 dark:text-neutral-500 dark:hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const chosenLink =
                      editingItem.liveProjectUrl ||
                      editingItem.project_url ||
                      editingItem.external_link ||
                      "";
                    const changes = {
                      title: editingItem.title,
                      description: editingItem.description || "",
                      liveProjectUrl: chosenLink,
                      project_url: chosenLink,
                      external_link: chosenLink,
                      youtube_url: editingItem.youtube_url || "",
                      youtube_embed_id: editingItem.youtube_url
                        ? extractYoutubeId(editingItem.youtube_url) || ""
                        : "",
                      image_url: editingItem.image_url || "",
                      imageUrl: editingItem.image_url || "",
                      item_type: editingItem.item_type,
                    };
                    handleUpdateItem(editingItem.id, changes);
                    setEditingItem(null);
                  }}
                  className="px-6 py-2 bg-slate-950 text-white dark:bg-white dark:text-black hover:opacity-90 font-bold rounded-xl shadow-lg transition-transform duration-200 active:scale-[0.98]"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Branded Footer */}
        <div className="w-full py-12 text-center border-t border-[var(--vp-border)]">
          <span className="text-[10px] tracking-widest font-black uppercase opacity-60">Powered by Plugsy</span>
        </div>
      </div>
    </>
  );
}
