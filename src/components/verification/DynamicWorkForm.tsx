import React, { useState } from "react";
import { getCategoryConfig } from "../../utils/categoryConfig";
import { ComingSoonOverlay } from "./ComingSoonOverlay";
import { VPPortfolioItem } from "../../types/verification";
import { compressAndUpload } from "../../utils/uploadMedia";
import { Image } from "lucide-react";
import { showToast } from "../Toast";
import { SafeImage } from "../SafeImage";
import { YoutubeThumbnail } from "../portfolio/YoutubeThumbnail";

interface DynamicWorkFormProps {
  category: string;
  currentItem: Partial<VPPortfolioItem>;
  onChange: (updates: Partial<VPPortfolioItem>) => void;
  existingItemsCount: number;
  pdfCount?: number;
  imageCount?: number;
  videoCount?: number;
  linkCount?: number;
}

const extractYoutubeId = (url: string) => {
  if (!url) return null;
  const regExp =
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

export const DynamicWorkForm = ({
  category,
  currentItem,
  onChange,
  existingItemsCount,
  pdfCount,
  imageCount,
  videoCount,
  linkCount,
}: DynamicWorkFormProps) => {
  const config = getCategoryConfig(category);
  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [pdfUploadStatus, setPdfUploadStatus] = useState<string | null>(null);

  if (!config) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      if (
        config.maxImages &&
        (imageCount ?? existingItemsCount) >= config.maxImages &&
        !currentItem.image_url
      ) {
        showToast("File upload limit reached", "error");
        return;
      }
      try {
        setUploadStatus("Uploading...");
        const url = await compressAndUpload(
          e.dataTransfer.files[0],
          setUploadStatus,
        );
        onChange({ image_url: url, imageUrl: url, item_type: "image" });
        showToast("Screenshot uploaded successfully!", "success");
      } catch (err: any) {
        showToast(err.message, "error");
      } finally {
        setUploadStatus(null);
      }
    }
  };

  // Light and Dark adaptive styles
  const inputClassName =
    "w-full text-sm py-2.5 px-3.5 rounded-2xl outline-none border transition-all bg-white/60 border-black/10 text-slate-900 focus:border-black dark:bg-[#0A0A0C] dark:border-white/10 dark:text-white dark:focus:border-white";
  const labelClassName =
    "text-slate-500 dark:text-neutral-400 text-[11px] font-semibold tracking-wider uppercase mb-1.5 block";
  const hintClassName =
    "text-[11px] text-slate-400 dark:text-neutral-500 mt-1 mb-2 block";

  return (
    <div className="flex flex-col gap-6">
      {config.slug === "video_editing" && (
        <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl text-xs text-slate-400 dark:text-neutral-500">
          ℹ️ Video editors: use video links for work items. Your profile photo
          and cover image are set in the Identity tab.
        </div>
      )}

      {/* TITLE — always shown */}
      <div>
        <label className={labelClassName}>TITLE *</label>
        <input
          value={currentItem.title || ""}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Project title"
          className={inputClassName}
        />
      </div>

      {/* VIDEO UPLOAD — Coming Soon overlay for applicable categories */}
      {config.showVideoComingSoon && (
        <div>
          <label className={labelClassName}>VIDEO UPLOAD</label>
          <ComingSoonOverlay />
        </div>
      )}

      {/* VIDEO EMBED LINKS — for categories with videoEmbedEnabled */}
      {config.videoEmbedEnabled && (
        <div>
          <label className={labelClassName}>
            VIDEO LINK
            {config.maxVideos > 0 && (
              <span className="text-gray-400 dark:text-neutral-500 ml-1.5">
                ({videoCount ?? existingItemsCount}/{config.maxVideos} videos)
              </span>
            )}
          </label>
          <p className={hintClassName}>
            Paste a link from YouTube (e.g., youtube.com/watch?v=... or
            youtu.be/...)
          </p>

          <input
            value={currentItem.external_link || currentItem.youtube_url || ""}
            onChange={(e) => {
              if (
                config.maxVideos &&
                (videoCount ?? existingItemsCount) >= config.maxVideos &&
                !currentItem.youtube_url &&
                !currentItem.external_link &&
                e.target.value
              ) {
                showToast("Video upload limit reached", "error");
                return;
              }
              const url = e.target.value;
              onChange({
                external_link: url,
                youtube_url: url,
                link_platform: "youtube",
                item_type: "youtube",
              });
            }}
            placeholder="https://www.youtube.com/watch?v=..."
            className={inputClassName}
          />

          {/* Show cover upload after valid YouTube URL is entered */}
          {(() => {
            const ytUrlId =
              currentItem.youtube_embed_id ||
              extractYoutubeId(
                currentItem.youtube_url || currentItem.external_link || "",
              );
            return ytUrlId ? (
              <div className="mt-3.5 space-y-4">
                <div className="w-full aspect-video rounded-xl overflow-hidden">
                  <YoutubeThumbnail
                    videoId={ytUrlId}
                    style={{ pointerEvents: "none" }}
                  />
                </div>

                <div style={{ marginTop: "12px" }}>
                  <label className={labelClassName}>COVER PHOTO</label>
                  <p
                    style={{
                      color: "rgba(255,255,255,0.3)",
                      fontSize: "11px",
                      margin: "0 0 8px",
                    }}
                  >
                    Upload a custom cover that shows in your portfolio grid.
                    Replaces the YouTube auto-thumbnail.
                  </p>

                  {currentItem.custom_thumbnail_url ? (
                    <div style={{ position: "relative" }}>
                      <img
                        src={currentItem.custom_thumbnail_url}
                        style={{
                          width: "100%",
                          aspectRatio:
                            currentItem.aspect_ratio === "vertical"
                              ? "9/16"
                              : "16/9",
                          objectFit: "cover",
                          borderRadius: "8px",
                          display: "block",
                        }}
                      />
                      <button
                        onClick={async () => {
                          onChange({ custom_thumbnail_url: undefined });
                          // Save to database
                          if (currentItem.id) {
                            try {
                              const { supabase } =
                                await import("../../lib/supabase");
                              await supabase
                                .from("vp_portfolio_items")
                                .update({ custom_thumbnail_url: null })
                                .eq("id", currentItem.id);
                            } catch (e) {
                              console.error(e);
                            }
                          }
                        }}
                        style={{
                          position: "absolute",
                          top: "8px",
                          right: "8px",
                          background: "rgba(0,0,0,0.7)",
                          border: "none",
                          borderRadius: "6px",
                          color: "white",
                          padding: "4px 10px",
                          fontSize: "11px",
                          cursor: "pointer",
                        }}
                      >
                        Remove
                      </button>
                      <div
                        style={{
                          marginTop: "6px",
                          fontSize: "10px",
                          color: "rgba(255,255,255,0.3)",
                        }}
                      >
                        ✓ Custom cover set
                      </div>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        id={"cover-upload-" + (currentItem.id || "new")}
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          try {
                            setDragActive(true); // use existing state for uploading
                            const url = await compressAndUpload(
                              file,
                              (status) => console.log("[cover]", status),
                            );

                            onChange({ custom_thumbnail_url: url });

                            // Save immediately if item exists
                            if (currentItem.id) {
                              const { supabase } =
                                await import("../../lib/supabase");
                              await supabase
                                .from("vp_portfolio_items")
                                .update({ custom_thumbnail_url: url })
                                .eq("id", currentItem.id);
                            }
                          } catch (err: any) {
                            console.error("[cover] upload failed:", err);
                            showToast(err.message, "error");
                          } finally {
                            setDragActive(false);
                          }
                        }}
                      />
                      <label
                        htmlFor={"cover-upload-" + (currentItem.id || "new")}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          width: "100%",
                          padding: "14px",
                          background: "#111",
                          border: "0.5px dashed rgba(255,255,255,0.15)",
                          borderRadius: "8px",
                          color: "rgba(255,255,255,0.4)",
                          fontSize: "12px",
                          fontWeight: 500,
                          cursor: dragActive ? "not-allowed" : "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {dragActive ? (
                          <>
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <span>📷</span>
                            <span>Upload Cover Photo</span>
                          </>
                        )}
                      </label>
                    </div>
                  )}
                </div>
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* IMAGE UPLOAD — for image-enabled categories */}
      {config.imageInWorkFeed && (
        <div className="space-y-3">
          <label className={labelClassName}>
            {config.allowProjectLinks
              ? "COVER / UI SCREENSHOT"
              : "IMAGE UPLOAD"}
            {config.maxImages > 0 && (
              <span className="text-gray-400 dark:text-neutral-500 ml-1.5">
                ({imageCount ?? existingItemsCount}/{config.maxImages} images)
              </span>
            )}
          </label>

          <div
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
              dragActive
                ? "border-[#2563eb] bg-[#2563eb]/5"
                : "border-black/10 bg-white/40 dark:border-white/10 dark:bg-[#0A0A0C]/40"
            }`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            {currentItem.image_url ? (
              <div className="relative group flex flex-col items-center justify-center">
                <SafeImage
                  src={currentItem.image_url || undefined}
                  className="w-full max-w-[200px] rounded-xl shadow-md border dark:border-white/10"
                  alt="Preview"
                />
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition rounded-xl">
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ image_url: undefined, imageUrl: undefined })
                    }
                    className="text-red-400 text-xs font-bold bg-black/50 px-3 py-1.5 rounded-full hover:bg-black/80 transition mb-2"
                  >
                    Remove
                  </button>
                  <label className="cursor-pointer text-white text-xs font-bold bg-black/50 px-3 py-1.5 rounded-full hover:bg-black/80 transition">
                    Replace
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        if (e.target.files && e.target.files[0]) {
                          try {
                            setUploadStatus("Uploading...");
                            const url = await compressAndUpload(
                              e.target.files[0],
                              setUploadStatus,
                            );
                            onChange({
                              image_url: url,
                              imageUrl: url,
                              item_type: "image",
                            });
                          } catch (err: any) {
                            showToast(err.message, "error");
                          } finally {
                            setUploadStatus(null);
                          }
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <label
                className={`cursor-pointer text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-white transition flex flex-col items-center py-4 w-full h-full ${uploadStatus ? "opacity-50 pointer-events-none" : ""}`}
              >
                <Image
                  size={28}
                  className={`mb-2 ${uploadStatus ? "text-gray-400 animate-pulse" : "text-[#2563eb]"}`}
                />
                <span className="font-bold text-xs uppercase tracking-wide">
                  {uploadStatus || "Drag & Drop or Click to Upload"}
                </span>
                {!uploadStatus && (
                  <p className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1">
                    High-Res screenshots recommended
                  </p>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    if (e.target.files && e.target.files[0]) {
                      if (
                        config.maxImages &&
                        (imageCount ?? existingItemsCount) >=
                          config.maxImages &&
                        !currentItem.image_url
                      ) {
                        showToast("File upload limit reached", "error");
                        return;
                      }
                      try {
                        setUploadStatus("Uploading...");
                        const url = await compressAndUpload(
                          e.target.files[0],
                          setUploadStatus,
                        );
                        onChange({
                          image_url: url,
                          imageUrl: url,
                          item_type: "image",
                        });
                      } catch (err: any) {
                        showToast(err.message, "error");
                      } finally {
                        setUploadStatus(null);
                      }
                    }
                  }}
                />
              </label>
            )}
          </div>

          {/* Screenshot IMAGE URL Input alongside file upload */}
          <div className="mt-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-wider mb-1 block">
              Or Paste Direct Work Image URL
            </span>
            <input
              type="text"
              value={currentItem.image_url || currentItem.imageUrl || ""}
              onChange={(e) => {
                if (
                  config.maxImages &&
                  (imageCount ?? existingItemsCount) >= config.maxImages &&
                  !currentItem.image_url &&
                  !currentItem.imageUrl &&
                  e.target.value
                ) {
                  showToast("Image upload limit reached", "error");
                  return;
                }
                onChange({
                  image_url: e.target.value,
                  imageUrl: e.target.value,
                  item_type: "image",
                });
              }}
              placeholder="https://example.com/screenshot.png"
              className={inputClassName}
            />
          </div>
        </div>
      )}

      {/* LIVE PROJECT LINK */}
      {config.allowProjectLinks && (
        <div>
          <label className={labelClassName}>Live Project Link</label>
          <input
            type="text"
            value={
              currentItem.liveProjectUrl ||
              currentItem.project_url ||
              currentItem.external_link ||
              ""
            }
            onChange={(e) => {
              const val = e.target.value;
              onChange({
                liveProjectUrl: val,
                project_url: val,
                external_link: val,
              });
            }}
            placeholder="https://live-site.com"
            className={inputClassName}
          />
          <p className={hintClassName}>
            Clients clicking this image card will be securely redirected to this
            live project URL in a new tab.
          </p>
        </div>
      )}

      {/* PROJECT URL — fallback for projects that also have links configured but no explicit special link block */}
      {!config.allowProjectLinks && config.maxLinks > 0 && (
        <div>
          <label className={labelClassName}>PROJECT URL</label>
          <input
            value={currentItem.project_url || ""}
            onChange={(e) => onChange({ project_url: e.target.value })}
            placeholder="https://yourproject.com"
            className={inputClassName}
          />
        </div>
      )}

      {/* PDF UPLOAD — for copywriting */}
      {config.maxPDFs > 0 && (
        <div className="relative">
          <label className={labelClassName}>
            PDF DOCUMENT
            <span className="text-gray-400 dark:text-neutral-500 ml-1.5">
              ({pdfCount ?? existingItemsCount}/{config.maxPDFs} PDFs)
            </span>
          </label>
          <p className={hintClassName}>
            Upload writing samples, case studies, or portfolios as PDF
          </p>

          <label
            className={`cursor-pointer w-full text-sm py-2.5 px-3.5 rounded-2xl outline-none border transition-all bg-white/60 border-black/10 text-slate-900 hover:border-black dark:bg-[#0A0A0C] dark:border-white/10 dark:text-white dark:hover:border-white flex items-center justify-center gap-2 mb-2 ${pdfUploadStatus ? "opacity-50 pointer-events-none" : ""}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={pdfUploadStatus ? "animate-pulse" : ""}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
            <span className="font-medium text-xs">
              {pdfUploadStatus ||
                (currentItem.pdf_url ? "Replace PDF" : "Upload PDF File")}
            </span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={async (e) => {
                if (e.target.files && e.target.files[0]) {
                  if (
                    config.maxPDFs &&
                    (pdfCount ?? existingItemsCount) >= config.maxPDFs &&
                    !currentItem.pdf_url
                  ) {
                    showToast("File upload limit reached", "error");
                    return;
                  }
                  try {
                    setPdfUploadStatus("Uploading PDF...");
                    const url = await compressAndUpload(
                      e.target.files[0],
                      setPdfUploadStatus,
                    );
                    onChange({ pdf_url: url, item_type: "pdf" });
                    showToast("PDF uploaded successfully", "success");
                  } catch (err: any) {
                    showToast(err.message, "error");
                  } finally {
                    setPdfUploadStatus(null);
                  }
                }
              }}
            />
          </label>
          <input
            value={currentItem.pdf_url || ""}
            onChange={(e) => {
              if (
                config.maxPDFs &&
                (pdfCount ?? existingItemsCount) >= config.maxPDFs &&
                !currentItem.pdf_url &&
                e.target.value
              ) {
                showToast("File upload limit reached", "error");
                return;
              }
              onChange({ pdf_url: e.target.value, item_type: "pdf" });
            }}
            placeholder="Or Paste Direct PDF URL..."
            className={inputClassName}
          />
        </div>
      )}

      {/* DESCRIPTION — always shown */}
      <div>
        <label className={labelClassName}>DESCRIPTION</label>
        <textarea
          value={currentItem.description || ""}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Describe this project..."
          rows={3}
          className={`${inputClassName} resize-none min-h-[80px]`}
        />
      </div>

      {/* CLIENT & YEAR — always shown */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClassName}>CLIENT</label>
          <input
            value={currentItem.client_name || ""}
            onChange={(e) => onChange({ client_name: e.target.value })}
            placeholder="Client or 'Confidential'"
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName}>YEAR</label>
          <select
            value={currentItem.project_year || ""}
            onChange={(e) => onChange({ project_year: Number(e.target.value) })}
            className={inputClassName}
          >
            <option value="">Year</option>
            {Array.from({ length: 12 }, (_, i) => 2026 - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
