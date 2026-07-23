import React from "react";
import { motion } from "framer-motion";
import { VPPortfolioItem } from "../../types/verification";
import { Edit2, Trash2, Play, FileText, ExternalLink } from "lucide-react";
import { extractYoutubeId } from "../../utils/verification";
import { SafeImage } from "../SafeImage";
import { YoutubeThumbnail } from "./YoutubeThumbnail";

export const getItemThumbnailImage = (item: VPPortfolioItem): string | null => {
  if (item.custom_thumbnail_url) return item.custom_thumbnail_url;
  if (item.item_type === "image" && item.image_url) return item.image_url;
  return null;
};

export const getYoutubeId = (item: VPPortfolioItem): string | null => {
  const ytId = item.youtube_embed_id || extractYoutubeId(item.youtube_url || item.external_link || "");
  if ((item.item_type === "youtube" || item.link_platform === "youtube") && ytId) {
    return ytId;
  }
  return null;
};

interface PortfolioItemCardProps {
  item: VPPortfolioItem;
  isEditMode: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact?: (itemId: string, reactionType: string) => void;
}

export const PortfolioItemCard: React.FC<PortfolioItemCardProps> = ({
  item,
  isEditMode,
  onClick,
  onEdit,
  onDelete,
  onReact,
}) => {
  const isVertical = item.aspect_ratio === "vertical";
  const ratioClass = isVertical ? "aspect-[3/4]" : (item.item_type === "youtube" ? "aspect-video" : "aspect-[4/3]");

  const hasLiveLink = !!(item.liveProjectUrl || item.project_url || item.external_link);
  const isImageOrLink = item.item_type !== "youtube" && item.link_platform !== "youtube";
  
  const targetYtId = item.youtube_embed_id || (item as any).youtubeEmbedId || getYoutubeId(item);
  const displayImage = 
    (item as any).customThumbnailUrl || 
    item.custom_thumbnail_url || 
    (item as any).imageUrl || 
    item.image_url || 
    (targetYtId ? `https://img.youtube.com/vi/${targetYtId}/maxresdefault.jpg` : null);

  const handleCardClick = (e: React.MouseEvent) => {
    if (isEditMode) {
      if (onClick) onClick();
      return;
    }
    
    const toExternalUrl = (url: string | null | undefined): string => {
      if (!url?.trim()) return "#"
      const u = url.trim()
      if (u.startsWith("http://") || u.startsWith("https://")) return u
      return "https://" + u
    }

    if (hasLiveLink && isImageOrLink) {
      const targetUrl = item.liveProjectUrl || item.project_url || item.external_link;
      window.open(toExternalUrl(targetUrl), '_blank', 'noopener,noreferrer');
    } else {
      if (onClick) onClick();
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes premiumPulse {
          0% { box-shadow: 0 0 10px rgba(37, 99, 235, 0.05); border-color: rgba(37, 99, 235, 0.1); }
          50% { box-shadow: 0 0 18px rgba(37, 99, 235, 0.2); border-color: rgba(37, 99, 235, 0.3); }
          100% { box-shadow: 0 0 10px rgba(37, 99, 235, 0.05); border-color: rgba(37, 99, 235, 0.1); }
        }
        .premium-link-card-pulse:hover {
          animation: premiumPulse 2s infinite ease-in-out;
        }
      `}} />
      <div
        onClick={handleCardClick}
        className={`flex flex-col gap-4 group cursor-pointer relative col-span-1 border border-transparent rounded-2xl p-2.5 transition-all duration-300 bg-black/[0.01] dark:bg-white/[0.01] ${
          !isEditMode && hasLiveLink && isImageOrLink
            ? "hover:scale-[1.02] hover:bg-white/[0.02] dark:hover:bg-white/5 premium-link-card-pulse"
            : "hover:scale-[1.01]"
        }`}
      >
        {/* Media Container with Premium Crystalline Lens Styling */}
        <div style={{
          position: "relative",
          aspectRatio: isVertical ? "9/16" : "16/9",
          overflow: "hidden",
          background: "var(--vp-card)",
          cursor: "pointer",
          borderRadius: "16px"
        }}>
          {isEditMode && (
            <div className="absolute top-3 right-3 z-20 flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="portfolio-btn bg-black text-white dark:bg-white dark:text-black w-8 h-8 flex items-center justify-center rounded-lg hover:scale-105 transition shadow-lg border border-white/10"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="portfolio-btn bg-red-500 text-white w-8 h-8 flex items-center justify-center rounded-lg hover:scale-105 transition shadow-lg"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity bg-black/40 backdrop-blur-xs z-10">
            <div className="bg-white/20 border border-white/30 rounded-full p-3 shadow-2xl">
              {isImageOrLink && hasLiveLink ? (
                <ExternalLink className="w-8 h-8 text-white font-bold" />
              ) : (
                <Play className="w-8 h-8 text-white fill-white" />
              )}
            </div>
          </div>

          {displayImage ? (
            <img
              loading="lazy"
              src={displayImage}
              alt={item.title || ""}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover"
              }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black/5 dark:bg-white/[0.02] backdrop-blur-xl p-6 text-center border-t border-white/5 absolute inset-0">
              <div className="p-3 bg-black/10 dark:bg-white/10 rounded-2xl mb-2.5">
                <FileText className="w-6 h-6 opacity-60 text-brand-text" />
              </div>
              <span className="text-[10px] font-black tracking-widest uppercase opacity-80 text-brand-text max-w-[85%] truncate">
                {item.title}
              </span>
            </div>
          )}

          {/* Crystalline Category Meta Placement with High Safety Margins */}
          {item.item_type === "youtube" && (
            <div className="absolute bottom-3.5 left-3.5 bg-black/80 dark:bg-black/90 text-white text-[9px] px-3 py-1 rounded-md font-extrabold tracking-widest z-10 pointer-events-none border border-white/10 backdrop-blur-md uppercase">
              ▶ VIDEO
            </div>
          )}
        </div>

        {/* Metadata BELOW the frame with consistent spacing */}
        <div className="flex flex-col px-1.5 py-1">
          <h3
            className="text-sm font-bold truncate tracking-tight"
            style={{
              fontFamily: "var(--vp-heading-font)",
              color: "var(--vp-text)",
            }}
          >
            {item.title}
          </h3>
          <div className="flex items-center justify-between mt-1">
            {item.client_name && (
              <p className="text-[11px] font-medium tracking-wide" style={{ color: "var(--vp-text-muted)" }}>
                {item.client_name}
              </p>
            )}
            
            {/* Reactions Summary inline */}
            <div className="flex items-center gap-1.5 ml-auto opacity-70">
              {((item.fire_count || 0) + (item.mind_blown_count || 0) + (item.hire_count || 0) + (item.love_this_count || 0) + (item.clean_work_count || 0) > 0) ? (
                <motion.div
                  whileTap={{ scale: 0.8 }}
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  className="flex items-center gap-1 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onReact) onReact(item.id, 'fire');
                  }}
                >
                  <span className="text-xs">🔥</span>
                  <span className="text-[10px] font-bold text-white/60">
                    {(item.fire_count || 0) + (item.mind_blown_count || 0) + (item.hire_count || 0) + (item.love_this_count || 0) + (item.clean_work_count || 0)}
                  </span>
                </motion.div>
              ) : (
                <motion.div
                  whileTap={{ scale: 0.8 }}
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  className="flex items-center gap-1 bg-white/5 hover:bg-white/10 transition-colors px-2 py-0.5 rounded-full border border-white/5 cursor-pointer" 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onReact) onReact(item.id, 'fire');
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                  <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest leading-none">React</span>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
