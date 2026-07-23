import React from "react";
import { VPPortfolioItem } from "../../types/verification";
import { Edit2, Trash2, Play, FileText, ChevronRight, ChevronLeft, ExternalLink } from "lucide-react";
import { extractYoutubeId } from "../../utils/verification";
import { motion } from "motion/react";
import { StaggerContainer, StaggerItem } from "../PageTransition";

export const getItemThumbnail = (item: VPPortfolioItem): string | null => {
  const ytId = item.youtube_embed_id || extractYoutubeId(item.youtube_url || item.external_link || "");
  const targetYtId = ytId === "mock_video_id" ? null : ytId;

  return item.cover_image_url || 
         (item as any).customThumbnailUrl || 
         item.custom_thumbnail_url || 
         (item as any).imageUrl || 
         item.image_url || 
         (targetYtId ? `https://img.youtube.com/vi/${targetYtId}/maxresdefault.jpg` : null);
};

interface HorizontalDesignGalleryProps {
  items: VPPortfolioItem[];
  isEditMode?: boolean;
  onEdit?: (item: VPPortfolioItem) => void;
  onDelete?: (id: string) => void;
  onClickItem?: (item: VPPortfolioItem) => void;
  onReact?: (itemId: string, reactionType: string) => void;
}

export const HorizontalDesignGallery: React.FC<
  HorizontalDesignGalleryProps
> = ({ items, isEditMode = false, onEdit, onDelete, onClickItem, onReact }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = React.useState(false);
  const [showRightArrow, setShowRightArrow] = React.useState(items.length > 2);

  const checkScroll = () => {
    if (containerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
      setShowLeftArrow(scrollLeft > 10);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  React.useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll);
      // Run once on load
      checkScroll();
    }
    return () => {
      if (el) el.removeEventListener("scroll", checkScroll);
    };
  }, [items]);

  const scroll = (direction: "left" | "right") => {
    if (containerRef.current) {
      const scrollAmount = containerRef.current.clientWidth * 0.75;
      containerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  // Motion variants for stagger entry
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.98 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 70,
        damping: 14,
      },
    },
  };

  return (
    <div className="w-full relative group/gallery">
      {/* Scroll controls */}
      {showLeftArrow && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-4 top-1/2 -translate-y-12 z-20 bg-black/60 hover:bg-black/90 text-white p-3 rounded-full backdrop-blur-md opacity-0 group-hover/gallery:opacity-100 transition shadow-lg border border-white/10 flex items-center justify-center cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {showRightArrow && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-4 top-1/2 -translate-y-12 z-20 bg-black/60 hover:bg-black/90 text-white p-3 rounded-full backdrop-blur-md opacity-0 group-hover/gallery:opacity-100 transition shadow-lg border border-white/10 flex items-center justify-center cursor-pointer"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      <StaggerContainer
        staggerDelay={0.08}
        className="flex overflow-x-auto snap-x snap-mandatory gap-6 pb-8 scrollbar-hide scroll-smooth"
      >
        <div ref={containerRef} className="flex overflow-x-auto w-full snap-x snap-mandatory gap-6 pb-8 scrollbar-hide scroll-smooth" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        <style
          dangerouslySetInnerHTML={{
            __html: `
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
        `,
          }}
        />
        {items.map((item) => {
          const hasLiveLink = !!(item.liveProjectUrl || item.project_url || item.external_link);
          const isImageOrLink = item.item_type !== "youtube" && item.link_platform !== "youtube";
          const isPlayable = item.item_type === "youtube" || item.link_platform === "youtube" || item.item_type === "image" || item.pdf_url || (!item.project_url && !item.external_link);
          const extUrl = item.project_url || item.external_link;
          
          const toExternalUrl = (url: string | null | undefined): string => {
            if (!url?.trim()) return "#"
            const u = url.trim()
            if (u.startsWith("http://") || u.startsWith("https://")) return u
            return "https://" + u
          }

          return (
          <StaggerItem
            key={item.id}
            className="snap-center shrink-0 w-[85vw] sm:w-[55vw] md:w-[42vw] lg:w-[32vw] relative group cursor-pointer"
          >
            <div
            onClick={() => {
              if (isEditMode) return;
              if (hasLiveLink && isImageOrLink) {
                const targetUrl = item.liveProjectUrl || item.project_url || item.external_link;
                window.open(toExternalUrl(targetUrl), '_blank', 'noopener,noreferrer');
              } else if (isPlayable) {
                if (onClickItem) onClickItem(item);
              } else if (extUrl) {
                window.open(toExternalUrl(extUrl), '_blank', 'noopener,noreferrer');
              } else if (onClickItem) {
                onClickItem(item); // fallback
              }
            }}
            >
            {isEditMode && (
              <div className="absolute top-3 right-3 z-30 flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onEdit) onEdit(item);
                  }}
                  className="bg-black/80 hover:bg-black border border-white/10 text-white w-9 h-9 flex items-center justify-center rounded-lg hover:scale-110 transition shadow-lg"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onDelete) onDelete(item.id);
                  }}
                  className="bg-red-500/90 hover:bg-red-600 text-white w-9 h-9 flex items-center justify-center rounded-lg hover:scale-110 transition shadow-lg"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}

            <div style={{
              position: "relative",
              aspectRatio: item.aspect_ratio === "vertical" ? "9/16" : "16/9",
              overflow: "hidden",
              background: "var(--vp-card)",
              cursor: "pointer",
              borderRadius: "16px"
            }}>
              {/* Top-level floating badge title */}
              <div className="absolute top-4 left-4 z-20">
                <div className="bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-semibold text-white/90 border border-white/10">
                  {item.title}
                </div>
              </div>
              
              {/* Play / Inspect Overlay */}
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover/thumb:opacity-100 transition-all duration-300 z-10 flex items-center justify-center">
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  whileHover={{ scale: 1.1 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="bg-white/10 border border-white/20 hover:bg-white/20 text-white p-5 rounded-full backdrop-blur-xl flex items-center justify-center shadow-2xl"
                >
                  {isImageOrLink && hasLiveLink ? (
                    <ExternalLink className="w-10 h-10 text-white" />
                  ) : isPlayable ? (
                    <Play className="w-10 h-10 text-white fill-white translate-x-0.5" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white opacity-90"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>
                  )}
                </motion.div>
              </div>

              {/* Bottom right Play Mute Indicator */}
              <div className="absolute bottom-4 right-4 z-20 bg-black/40 backdrop-blur-md p-2 rounded-full border border-white/10 text-white/70">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-volume-x"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" x2="17" y1="9" y2="15"/><line x1="17" x2="23" y1="9" y2="15"/></svg>
              </div>

              {getItemThumbnail(item) ? (
                <img
                  loading="lazy"
                  alt={item.title || ""}
                  src={getItemThumbnail(item) || undefined}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover"
                  }}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-brand-text/5 gap-3 group-hover/thumb:scale-105 transition-transform duration-300">
                  <FileText className="w-14 h-14 opacity-25 text-neutral-400" />
                  <span className="text-xs uppercase tracking-widest text-white/30 font-bold">No Preview</span>
                </div>
              )}
            </div>
            
            {/* Keeping just client name text below the poster if they have it, but removing normal title since it's floating */}
            <div className="pt-4 px-2 text-left flex items-center justify-between">
              {item.client_name ? (
                <p
                  className="text-sm opacity-60 font-mono"
                  style={{ color: "var(--vp-text)" }}
                >
                  {item.client_name}
                </p>
              ) : <div />}

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
                    className="flex items-center gap-1 bg-white/5 hover:bg-white/10 transition-colors px-2 py-1 rounded-full border border-white/5 cursor-pointer" 
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
          </StaggerItem>
          );
        })}
        </div>
      </StaggerContainer>
    </div>
  );
};
