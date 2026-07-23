import React, { useState, useRef } from "react";
import { compressAndUpload } from "../../utils/uploadMedia";
import { UploadCloud, X, Loader2, Image as ImageIcon, Film } from "lucide-react";

interface MediaUploaderProps {
  onUpload: (url: string) => void;
  accept?: string;
  label?: string;
  value?: string;
  className?: string;
}

export function MediaUploader({ onUpload, accept = "image/*,video/*", label = "Upload Media", value, className = "" }: MediaUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file) return;

    setError(null);
    setIsUploading(true);
    setProgressText("Preparing upload...");

    try {
      const url = await compressAndUpload(file, (status) => {
        setProgressText(status);
      });
      onUpload(url);
    } catch (e: any) {
      setError(e.message || "Failed to upload file");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {value ? (
        <div className="relative group rounded-xl overflow-hidden border-2 border-brand-border bg-brand-surface group aspect-video flex-shrink-0">
          {value.match(/\.(mp4|webm|ogg)$/i) || value.includes("/video/upload") ? (
            <video src={value} className="w-full h-full object-cover" muted loop playsInline />
          ) : (
            <img src={value} alt="Preview" className="w-full h-full object-cover" />
          )}
          <button
            type="button"
            onClick={() => onUpload("")}
            className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/80 text-white rounded-full transition opacity-0 group-hover:opacity-100 backdrop-blur-sm"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors flex flex-col items-center justify-center min-h-[160px] ${
            isDragging ? "border-brand-accent bg-brand-accent/5" : "border-brand-border hover:border-brand-text/30"
          } ${isUploading ? "pointer-events-none opacity-80" : "cursor-pointer"}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
               <Loader2 className="w-8 h-8 animate-spin text-brand-accent" />
               <p className="text-sm font-bold animate-pulse text-brand-text">{progressText}</p>
            </div>
          ) : (
            <>
               <div className="flex gap-2 text-brand-text-secondary mb-3">
                 <ImageIcon className="w-6 h-6" />
                 <Film className="w-6 h-6" />
               </div>
               <p className="font-bold mb-1 text-brand-text">{label}</p>
               <p className="text-[10px] uppercase font-bold tracking-widest text-brand-text-secondary">
                 Accepts images up to 50MB, videos up to 100MB<br/>
                 High-res files auto-optimized for web
               </p>
               {error && <p className="text-red-500 text-xs mt-3 font-bold bg-red-500/10 px-3 py-1 rounded-full">{error}</p>}
            </>
          )}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept={accept}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}
    </div>
  );
}
