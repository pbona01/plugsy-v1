import React, { useState, useRef } from "react";
import {
  Upload,
  X,
  Loader2,
  Video,
  CheckCircle2,
  Link as LinkIcon,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { extractYoutubeId } from "../../utils/verification";
import { YoutubeThumbnail } from "../portfolio/YoutubeThumbnail";
import { useAuth } from "@clerk/clerk-react";

interface VideoUploaderProps {
  onUpload: (
    videoId: string,
    embedUrl: string,
    isReady?: boolean,
    originalUrl?: string,
  ) => void;
  onClear: () => void;
  existingVideoId?: string | null;
  workTitle?: string;
  workDescription?: string;
}

export function VideoUploader({
  onUpload,
  onClear,
  existingVideoId,
  workTitle,
  workDescription,
}: VideoUploaderProps) {
  const { getToken } = useAuth();
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "processing" | "success" | "error"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [videoId, setVideoId] = useState<string | null>(
    existingVideoId || null,
  );
  const [showNote, setShowNote] = useState(!existingVideoId);
  const [linkInput, setLinkInput] = useState("");
  const [dots, setDots] = useState(".");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLinkInput(val);
    const id = extractYoutubeId(val);
    if (id) {
      setVideoId(id);
      onUpload(
        id,
        `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`,
        undefined,
        val,
      );
    } else {
      setVideoId(null);
      onClear();
    }
  };

  const uploadVideo = async (file: File) => {
    console.log("[upload] starting:", file.name, file.size, file.type);

    // Validate file
    const validTypes = [
      "video/mp4",
      "video/quicktime",
      "video/x-msvideo",
      "video/mpeg",
      "video/webm",
    ];
    if (!validTypes.includes(file.type)) {
      setUploadState("error");
      setErrorMessage("Invalid file type. Use MP4, MOV, or WebM.");
      return;
    }

    setUploadState("uploading");
    setProgress(0);
    setErrorMessage("");

    try {
      // STEP 1: Get resumable upload URL from our backend
      // This sends only metadata — not the file
      // So it is tiny and never hits the 4.5MB limit
      console.log("[upload] getting upload URL from backend...");

      const token = await getToken();
      const sessionRes = await fetch("/api/video?action=upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: workTitle || file.name || "Portfolio Video",
          description: workDescription || "",
          mimeType: file.type,
        }),
      });

      const sessionText = await sessionRes.text();
      console.log("[upload] session response:", sessionText);

      let sessionData;
      try {
        sessionData = JSON.parse(sessionText);
      } catch {
        throw new Error("Invalid server response");
      }

      if (!sessionData.success || !sessionData.uploadUrl) {
        throw new Error(sessionData.error || "Failed to get upload URL");
      }

      const uploadUrl = sessionData.uploadUrl;
      console.log("[upload] got upload URL, uploading file directly...");

      // STEP 2: Upload file DIRECTLY to YouTube from browser
      // This bypasses Vercel completely — no size limit
      const ytResponseData = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setProgress(pct);
            console.log("[upload] progress:", pct + "%");
          }
        });

        xhr.onload = () => {
          console.log("[upload] XHR status:", xhr.status);
          console.log("[upload] XHR response:", xhr.responseText.slice(0, 500));

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (err) {
              resolve({});
            }
          } else {
            reject(new Error("Upload failed with status: " + xhr.status));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.ontimeout = () => reject(new Error("Upload timed out"));

        // Upload directly to YouTube resumable URL
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      console.log("[upload] file uploaded to YouTube successfully");

      // STEP 3: Extract video ID from the upload URL
      // YouTube resumable upload URL contains the video ID
      // Format: ...?upload_id=xxx&videoId=yyy
      // OR we need to parse the response
      let videoId = ytResponseData?.id;

      if (!videoId) {
        const urlParams = new URLSearchParams(uploadUrl.split("?")[1] || "");
        videoId = urlParams.get("videoId") || urlParams.get("video_id");
      }

      if (!videoId) {
        throw new Error("Could not determine video ID after upload.");
      }

      console.log("[upload] success videoId:", videoId);

      // SET SUCCESS IMMEDIATELY — NO PROCESSING CHECK
      setVideoId(videoId);
      setUploadState("success");

      // Tell parent immediately
      onUpload(
        videoId,
        "https://www.youtube.com/embed/" +
          videoId +
          "?rel=0&modestbranding=1&controls=1&playsinline=1",
        undefined,
        `https://www.youtube.com/watch?v=${videoId}`,
      );
    } catch (error: any) {
      console.error("[upload] error:", error.message);
      setUploadState("error");
      setErrorMessage(error.message || "Upload failed");
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadVideo(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadVideo(e.target.files[0]);
    }
  };

  return (
    <div className="w-full bg-[#1a1a1a] border border-[#333] mb-4 rounded-xl p-4 sm:p-6 overflow-hidden">
      <div className="flex bg-[#0f0f0f] rounded-lg p-1 mb-6 border border-[#222]">
        <button
          onClick={() => setMode("upload")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-medium text-sm transition-colors ${
            mode === "upload"
              ? "bg-[#2563eb] text-white"
              : "text-[#888] hover:text-white"
          }`}
        >
          <Upload size={16} /> Upload Video
        </button>
        <button
          onClick={() => setMode("link")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-medium text-sm transition-colors ${
            mode === "link"
              ? "bg-[#2563eb] text-white"
              : "text-[#888] hover:text-white"
          }`}
        >
          <LinkIcon size={16} /> Paste URL
        </button>
      </div>

      {mode === "upload" && (
        <div className="space-y-4">
          {uploadState === "idle" && !videoId && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className="bg-[#0f0f0f] border-2 border-dashed border-[#333] hover:border-[#2563eb] hover:bg-[#0a1628] rounded-xl p-10 text-center cursor-pointer transition-all duration-200 group"
            >
              <Upload className="mx-auto h-12 w-12 text-[#555] group-hover:text-[#2563eb] mb-4 transition-colors" />
              <p className="text-white font-medium mb-1">
                Drop your video here
              </p>
              <p className="text-[#888] mb-4">or click to browse</p>
              <div className="text-[#555] text-xs space-y-1">
                <p>MP4, MOV, AVI, WebM — Max 500MB</p>
                <p>Video will be uploaded securely</p>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="video/mp4,video/quicktime,video/x-msvideo,video/mpeg,video/webm"
                onChange={handleFileSelect}
              />
            </div>
          )}

          {uploadState === "uploading" && (
            <div className="bg-[#111] border border-[#222] rounded-xl p-5">
              <div className="flex justify-between items-center mb-3">
                <span className="text-white text-sm font-medium truncate pr-4">
                  Uploading video
                </span>
                <span className="text-[#888] text-xs font-mono">
                  {progress}%
                </span>
              </div>
              <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-[#2563eb] to-[#60a5fa] transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center text-[#888] text-xs">
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                Uploading video...
              </div>
            </div>
          )}

          {uploadState === "error" && (
            <div
              style={{
                background: "#1a0a0a",
                border: "1px solid #dc2626",
                borderRadius: "8px",
                padding: "16px",
              }}
            >
              <p
                style={{
                  color: "#fca5a5",
                  fontSize: "13px",
                  margin: "0 0 12px",
                }}
              >
                ✗ {errorMessage}
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setUploadState("idle")}
                  style={{
                    background: "#1a1a1a",
                    border: "1px solid #333",
                    color: "#888",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  Try Again
                </button>
                <button
                  onClick={() => {
                    setUploadState("idle");
                    setMode("link");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#60a5fa",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  Paste URL Instead
                </button>
              </div>
            </div>
          )}

          {(uploadState === "success" || videoId) &&
            uploadState !== "error" &&
            uploadState !== "uploading" && (
              <div key={"video-success-" + videoId}>
                <div style={{ position: "relative", aspectRatio: "16/9" }}>
                  <iframe
                    src={
                      "https://www.youtube.com/embed/" +
                      videoId +
                      "?rel=0&modestbranding=1&controls=1&playsinline=1"
                    }
                    style={{
                      width: "100%",
                      height: "100%",
                      border: "none",
                      borderRadius: "8px",
                    }}
                    allowFullScreen
                  />
                </div>
                <div
                  style={{
                    marginTop: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "#22c55e", fontSize: "12px" }}>
                    ✅ Video uploaded
                  </span>
                  <button
                    onClick={() => {
                      setVideoId(null);
                      setUploadState("idle");
                      onClear();
                    }}
                    style={{
                      color: "#888",
                      fontSize: "12px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
        </div>
      )}

      {mode === "link" && (
        <div className="space-y-4">
          <div>
            <label className="block text-[#888] text-xs font-medium mb-2">
              Video URL
            </label>
            <input
              type="text"
              placeholder="https://youtube.com/watch?v=..."
              value={linkInput}
              onChange={handleLinkChange}
              className="w-full bg-[#111] border border-[#333] text-white rounded-lg p-3 text-sm focus:outline-none focus:border-[#2563eb] transition-colors font-mono"
            />
          </div>

          {linkInput &&
            (videoId ? (
              <div className="animate-in fade-in slide-in-from-top-2">
                <p className="text-green-500 text-xs font-medium flex items-center mb-3">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Valid video
                </p>
                <div className="aspect-video w-full rounded-lg overflow-hidden border border-[#333] bg-black">
                  <YoutubeThumbnail videoId={videoId!} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </div>
            ) : (
              <p className="text-red-500 text-xs font-medium flex items-center animate-in fade-in">
                <X className="w-3 h-3 mr-1" /> ✗ Invalid video URL
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
