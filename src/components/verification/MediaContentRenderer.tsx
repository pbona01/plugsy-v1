import React from "react";
import { VPPortfolioItem } from "../../types/verification";
import { FileText } from "lucide-react";
import { extractYoutubeId } from "../../utils/verification";

interface Props {
  item: VPPortfolioItem;
  autoplay?: boolean;
}

export function MediaContentRenderer({ item, autoplay = true }: Props) {
  const ytId = item.youtube_embed_id || extractYoutubeId(item.youtube_url || item.external_link || "");

  if (ytId) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&enablejsapi=1`}
        title={item.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full border-none absolute inset-0"
      />
    );
  }

  // Image
  if (item.item_type === "image" && (item.image_url || item.imageUrl)) {
    return (
      <img
        src={item.image_url || item.imageUrl}
        alt={item.title}
        className="w-full h-full object-contain absolute inset-0"
      />
    );
  }

  // PDF
  if (item.pdf_url) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center absolute inset-0" style={{ backgroundColor: "var(--vp-bg)" }}>
        <FileText className="w-16 h-16 mb-4 opacity-50" style={{ color: "var(--vp-text)" }} />
        <h3 className="text-xl font-bold mb-6 text-center px-4" style={{ color: "var(--vp-text)" }}>
          {item.title || "PDF Document"}
        </h3>
        <a 
          href={`https://docs.google.com/viewer?url=${encodeURIComponent(item.pdf_url.replace("/fl_attachment:false", ""))}&embedded=true`}
          target="_blank" 
          rel="noopener noreferrer" 
          className="px-6 py-3 rounded-full font-bold text-sm tracking-wide transition shadow-lg hover:scale-105"
          style={{ backgroundColor: "var(--vp-text)", color: "var(--vp-bg)" }}
        >
          View PDF Document
        </a>
      </div>
    );
  }

  const toExternalUrl = (url: string | null | undefined): string => {
    if (!url?.trim()) return "#"
    const u = url.trim()
    if (u.startsWith("http://") || u.startsWith("https://")) return u
    return "https://" + u
  }

  const projectLink = item.project_url || item.external_link || item.liveProjectUrl;

  // Project URL or Text
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-8 text-center absolute inset-0"
      style={{ backgroundColor: "var(--vp-card)" }}
    >
      <FileText className="w-16 h-16 mb-4 opacity-50 text-white" />
      <span className="text-sm font-bold uppercase tracking-widest text-white">
        Case Study
      </span>
      <h3 className="text-xl font-bold mt-4 text-white">
        {item.title}
      </h3>
      {projectLink && (
         <a filter="noopener noreferrer" target="_blank" href={toExternalUrl(projectLink)} className="mt-6 px-6 py-3 rounded-full bg-white text-black font-bold text-sm tracking-wide">
           View Live Project
         </a>
      )}
    </div>
  );
}
