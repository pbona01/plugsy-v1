import React, { useRef, useState, useEffect } from 'react';
import { VPPortfolioItem } from '../../types/verification';
import { YoutubeThumbnail } from './YoutubeThumbnail';
import { extractYoutubeId } from '../../utils/verification';
import { ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import gsap from 'gsap';

const getPDFViewUrl = (url: string): string => {
  if (!url) return "#";
  // Cloudinary raw URLs force downloads, and fl_attachment:false causes a 401 Unauthorized
  // error on strict accounts. The most reliable way to view the PDF inline across browsers
  // safely is to proxy it through the Google Docs viewer.
  const cleanUrl = url.replace("/fl_attachment:false", "");
  return `https://docs.google.com/viewer?url=${encodeURIComponent(cleanUrl)}`;
};

const PDFItem = ({ url, title }: { url: string, title: string }) => (
  <div style={{
    background: "var(--vp-card)",
    border: "0.5px solid var(--vp-border)",
    borderRadius: "12px",
    padding: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    width: "100%",
    height: "100%"
  }} onClick={(e) => { e.stopPropagation(); window.open(getPDFViewUrl(url), '_blank', 'noopener,noreferrer'); }}>
    <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
      <div style={{
        width: "40px",
        height: "40px",
        borderRadius: "8px",
        background: "rgba(239,68,68,0.1)",
        border: "0.5px solid rgba(239,68,68,0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "18px",
        flexShrink: 0
      }}>
        📄
      </div>
      <div style={{ minWidth: 0, overflow: "hidden" }}>
        <p style={{
          color: "var(--vp-text)",
          fontSize: "14px",
          fontWeight: 600,
          margin: "0 0 2px",
          fontFamily: "var(--vp-body-font)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }}>
          {title || "Document"}
        </p>
        <p style={{
          color: "var(--vp-text-subtle)",
          fontSize: "11px",
          margin: 0,
          fontFamily: "var(--vp-body-font)"
        }}>
          PDF Document
        </p>
      </div>
    </div>
    
    <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
      <a
        href={getPDFViewUrl(url)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--vp-accent)",
          color: "white",
          border: "none",
          borderRadius: "8px",
          padding: "8px 14px",
          fontSize: "12px",
          fontWeight: 600,
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          cursor: "pointer",
          whiteSpace: "nowrap"
        }}
      >
        View
      </a>
      
      <a
        href={url + "?dl=1"}
        download
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "transparent",
          color: "var(--vp-text-muted)",
          border: "0.5px solid var(--vp-border)",
          borderRadius: "8px",
          padding: "8px 14px",
          fontSize: "12px",
          fontWeight: 500,
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          whiteSpace: "nowrap"
        }}
      >
        ↓
      </a>
    </div>
  </div>
)

const HorizontalScrollHint = () => {
  const [visible, setVisible] = React.useState(() => {
    return !sessionStorage.getItem("scroll_hint_seen");
  });

  React.useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        setVisible(false);
        sessionStorage.setItem("scroll_hint_seen", "true");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideLeft {
          from { transform: translateX(0); opacity: 0.3; }
          to { transform: translateX(-4px); opacity: 1; }
        }
        @keyframes slideRight {
          from { transform: translateX(0); opacity: 0.3; }
          to { transform: translateX(4px); opacity: 1; }
        }
      `}} />
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease",
        marginTop: "12px",
        marginBottom: "12px"
      }}>
        {/* Animated scroll arrow */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          background: "var(--vp-card)",
          border: "1px solid var(--vp-border)",
          borderRadius: "999px",
          padding: "6px 14px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
        }}>
          {/* Left arrow */}
          <span style={{
            color: "var(--vp-text-subtle)",
            fontSize: "12px",
            animation: "slideLeft 1.2s ease-in-out infinite alternate"
          }}>
            ←
          </span>
          
          <span style={{
            color: "var(--vp-text-subtle)",
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily: "var(--vp-body-font)",
            marginLeft: "4px",
            marginRight: "4px"
          }}>
            Swipe to explore
          </span>

          {/* Right arrow */}
          <span style={{
            color: "var(--vp-text-subtle)",
            fontSize: "12px",
            animation: "slideRight 1.2s ease-in-out infinite alternate"
          }}>
            →
          </span>
        </div>
      </div>
    </>
  );
};

const WorkCard = ({
  asset,
  isHorizontal,
  onItemClick,
  getThumbnail,
  getYoutubeId,
  onReact
}: {
  asset: VPPortfolioItem;
  isHorizontal: boolean;
  onItemClick: (item: VPPortfolioItem) => void;
  getThumbnail: (item: VPPortfolioItem) => string | null;
  getYoutubeId: (item: VPPortfolioItem) => string | null;
  onReact?: (itemId: string, reactionType: string) => void;
}) => {
  const thumb = getThumbnail(asset);
  
  return (
    <div
      onClick={() => onItemClick(asset)}
      className={
        isHorizontal
          ? "w-[85vw] sm:w-[340px] aspect-video shrink-0 snap-start rounded-2xl overflow-hidden relative group border border-black/5 dark:border-white/10 cursor-pointer bg-white dark:bg-[#0A0A0C]"
          : "w-full aspect-video rounded-2xl overflow-hidden relative group border border-black/5 dark:border-white/10 cursor-pointer bg-white dark:bg-[#0A0A0C]"
      }
    >
      {thumb ? (
        <img
          src={thumb}
          alt={asset.title || ""}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transition: "transform 0.5s ease"
          }}
          className="group-hover:scale-105"
        />
      ) : getYoutubeId(asset) ? (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <YoutubeThumbnail videoId={getYoutubeId(asset)!} />
        </div>
      ) : asset.pdf_url ? (
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--vp-text-subtle)",
          background: "color-mix(in srgb, var(--vp-bg) 50%, transparent)",
          fontSize: "12px",
          gap: "8px"
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          PDF Document
        </div>
      ) : (
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--vp-text-subtle)",
          fontSize: "12px"
        }}>
          No preview
        </div>
      )}
      
      {/* Overlay Gradient */}
      <div 
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)",
          opacity: 0.8,
          transition: "opacity 0.3s ease"
        }}
        className="group-hover:opacity-100"
      />

      {asset.item_type === "youtube" && (
        <div style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
          borderRadius: "6px",
          padding: "4px 8px",
          fontSize: "10px",
          color: "white",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          fontWeight: 600,
          border: "1px solid rgba(255,255,255,0.1)"
        }}>
          ▶ {asset.duration_seconds ? (
             <span>
               {Math.floor(asset.duration_seconds / 60)}:
               {String(asset.duration_seconds % 60).padStart(2, "0")}
             </span>
          ) : "VIDEO"}
        </div>
      )}

      {/* Info Container */}
      <div style={{ 
        position: "absolute", 
        bottom: 0, 
        left: 0, 
        right: 0, 
        padding: "16px",
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "flex-end", 
        gap: "12px",
        zIndex: 10
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: "var(--vp-heading-font)",
            fontSize: "1.1rem",
            fontWeight: 600,
            color: "white",
            margin: "0 0 4px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textShadow: "0 2px 4px rgba(0,0,0,0.5)"
          }}>
            {asset.title}
          </p>
          {(asset.client_name || asset.project_year) && (
            <p style={{
              fontFamily: "var(--vp-body-font)",
              fontSize: "12px",
              color: "rgba(255,255,255,0.8)",
              margin: 0,
              fontWeight: 400,
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}>
              {[asset.client_name, asset.project_year]
                .filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div style={{ flexShrink: 0 }}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (onReact) onReact(asset.id, 'fire');
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(255,255,255,0.15)",
              backdropFilter: "blur(8px)",
              padding: "6px 10px",
              borderRadius: "999px",
              fontSize: "11px",
              cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.1)",
              transition: "transform 0.2s ease, background 0.2s ease"
            }}
            className="hover:scale-105 hover:bg-white/20"
          >
            <span>🔥</span>
            <span style={{ fontWeight: "700", color: "white" }}>
              {(asset.fire_count || 0) + (asset.mind_blown_count || 0) + (asset.hire_count || 0) + (asset.love_this_count || 0) + (asset.clean_work_count || 0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const WorkGrid = ({ 
  items, 
  workLayout,
  onItemClick,
  isEditMode,
  onEditItem,
  onDeleteItem,
  onReact,
  onMoveItem
}: {
  items: VPPortfolioItem[]
  workLayout: string
  onItemClick: (item: VPPortfolioItem) => void
  isEditMode?: boolean
  onEditItem?: (item: VPPortfolioItem) => void
  onDeleteItem?: (id: string) => void
  onReact?: (itemId: string, reactionType: string) => void
  onMoveItem?: (itemId: string, direction: "up" | "down") => void
}) => {
  
  console.log("[WorkGrid] workLayout:", workLayout, "items:", items.length)

  const getYoutubeVideoId = (item: VPPortfolioItem): string | null => {
    const id = item.youtube_embed_id || extractYoutubeId(item.youtube_url || item.external_link || "");
    return id === "mock_video_id" ? null : id;
  }

  const getItemThumbnail = (item: VPPortfolioItem): string | null => {
    const targetYtId = item.youtube_embed_id || (item as any).youtubeEmbedId || getYoutubeVideoId(item);
    return (item as any).customThumbnailUrl || 
           item.custom_thumbnail_url || 
           (item as any).imageUrl || 
           item.image_url || 
           (targetYtId ? `https://img.youtube.com/vi/${targetYtId}/maxresdefault.jpg` : null);
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [showArrow, setShowArrow] = useState(true)

  useEffect(() => {
    if (!containerRef.current || items.length === 0) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.work-card-element',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: "power3.out" }
      );
    }, containerRef);
    return () => ctx.revert();
  }, [items, workLayout]);

  const handleScroll = () => {
    if (scrollRef.current) {
      if (scrollRef.current.scrollLeft > 20) {
        setShowArrow(false)
      } else {
        setShowArrow(true)
      }
    }
  }

  if (workLayout === "horizontal") {
    return (
      <div className="relative w-full" ref={containerRef}>
        <AnimatePresence>
          {showArrow && items.length > 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-12 h-12 rounded-full bg-black/70 backdrop-blur-md border border-white/20 shadow-2xl pointer-events-none md:hidden"
            >
              <motion.div
                animate={{ x: [0, 5, 0], opacity: [0.7, 1, 0.7] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              >
                <ChevronRight className="w-6 h-6 text-white drop-shadow-lg" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            display: "flex",
            flexDirection: "row",
            overflowX: "auto",
            overflowY: "hidden",
            gap: "12px",
            paddingBottom: "12px",
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            msOverflowStyle: "none"
          }}
          className="vp-scroll-hide"
        >
          {items.map(item => {
          const isVertical = item.aspect_ratio === "vertical"
          const thumb = getItemThumbnail(item)
          
          return (
            <div
              key={item.id}
              className="work-card-element relative"
              onClick={() => onItemClick(item)}
              style={{
                flexShrink: 0,
                flexGrow: 0,
                width: isVertical ? "180px" : "320px",
                scrollSnapAlign: "start",
                cursor: "pointer"
              }}
            >
              {isEditMode && onMoveItem && (
                <div className="absolute right-2 top-2 z-30 flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button type="button" aria-label="Move item up" className="rounded-full bg-black/80 p-2.5 text-white shadow-lg touch-manipulation" onClick={() => onMoveItem(item.id, "up")}><ChevronUp size={18} /></button>
                  <button type="button" aria-label="Move item down" className="rounded-full bg-black/80 p-2.5 text-white shadow-lg touch-manipulation" onClick={() => onMoveItem(item.id, "down")}><ChevronDown size={18} /></button>
                </div>
              )}
              {item.pdf_url || item.item_type === "pdf" ? (
                <PDFItem url={(item.pdf_url || item.external_link || "") as string} title={item.title} />
              ) : (
                <>
                  <div style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: isVertical ? "9/16" : "16/9",
                    overflow: "hidden",
                    background: "var(--vp-card)"
                  }}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={item.title || ""}
                        loading="lazy"
                        style={{
                          position: "absolute",
                          inset: "0",
                          width: "100%",
                          height: "100%",
                          objectFit: "cover"
                        }}
                      />
                    ) : getYoutubeVideoId(item) ? (
                      <div style={{
                        position: "absolute",
                        inset: "0"
                      }}>
                        <YoutubeThumbnail 
                          videoId={getYoutubeVideoId(item)!} 
                        />
                      </div>
                    ) : (
                      <div style={{
                        position: "absolute",
                        inset: "0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}>
                        <span style={{ 
                          color: "var(--vp-text-subtle)", 
                          fontSize: "11px" 
                        }}>
                          No preview
                        </span>
                      </div>
                    )}

                    {/* Video badge */}
                    {(item.item_type === "youtube" || 
                      item.external_link) && (
                      <div style={{
                        position: "absolute",
                        bottom: "6px",
                        left: "6px",
                        background: "rgba(0,0,0,0.75)",
                        borderRadius: "3px",
                        padding: "2px 7px",
                        fontSize: "9px",
                        color: "white",
                        fontWeight: 700,
                        letterSpacing: "0.05em"
                      }}>
                        ▶
                      </div>
                    )}
                  </div>

                  {/* Title below card */}
                  <div style={{ padding: "8px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontFamily: "var(--vp-heading-font)",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "var(--vp-heading-color)",
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                        {item.title}
                      </p>
                    </div>
                    {onReact && (
                      <div style={{ flexShrink: 0, opacity: 0.8 }}>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            onReact(item.id, 'fire');
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            background: "rgba(255,255,255,0.05)",
                            padding: "2px 6px",
                            borderRadius: "12px",
                            fontSize: "9px",
                            cursor: "pointer"
                          }}
                        >
                          <span>🔥</span>
                          <span style={{ fontWeight: "bold", color: "white" }}>
                            {(item.fire_count || 0) + (item.mind_blown_count || 0) + (item.hire_count || 0) + (item.love_this_count || 0) + (item.clean_work_count || 0)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
      </div>
    )
  }

  // GRID layout (default)
  const horizontalItems = items.filter(
    i => i.aspect_ratio !== "vertical"
  )
  const verticalItems = items.filter(
    i => i.aspect_ratio === "vertical"
  )

  return (
    <div ref={containerRef} style={{ 
      display: "flex", 
      flexDirection: "column", 
      gap: "32px" 
    }}>
      
      {horizontalItems.length > 0 && (
        <div>
          {verticalItems.length > 0 && (
            <p style={{
              fontSize: "10px",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--vp-text-subtle)",
              fontFamily: "var(--vp-body-font)",
              fontWeight: 600,
              margin: "0 0 12px"
            }}>
              Long-Form
            </p>
          )}
          <div style={{
            display: "grid",
            gridTemplateColumns: 
              "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
            gap: "8px"
          }}>
            {horizontalItems.map(item => {
              const thumb = getItemThumbnail(item)
              return (
                <div
                  key={item.id}
                  className="work-card-element relative"
                  onClick={() => onItemClick(item)}
                  style={{ cursor: "pointer" }}
                >
                  {isEditMode && onMoveItem && (
                    <div className="absolute right-2 top-2 z-30 flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button type="button" aria-label="Move item up" className="rounded-full bg-black/80 p-2.5 text-white shadow-lg touch-manipulation" onClick={() => onMoveItem(item.id, "up")}><ChevronUp size={18} /></button>
                      <button type="button" aria-label="Move item down" className="rounded-full bg-black/80 p-2.5 text-white shadow-lg touch-manipulation" onClick={() => onMoveItem(item.id, "down")}><ChevronDown size={18} /></button>
                    </div>
                  )}
                  {item.pdf_url || item.item_type === "pdf" ? (
                    <PDFItem url={(item.pdf_url || item.external_link || "") as string} title={item.title} />
                  ) : (
                    <>
                      <div style={{
                        position: "relative",
                        aspectRatio: "16/9",
                        overflow: "hidden",
                        background: "var(--vp-card)",
                        borderRadius: "4px"
                      }}>
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={item.title || ""}
                            loading="lazy"
                            style={{
                              position: "absolute",
                              inset: "0",
                              width: "100%",
                              height: "100%",
                              objectFit: "cover"
                            }}
                          />
                        ) : getYoutubeVideoId(item) ? (
                          <div style={{ position: "absolute", inset: "0" }}>
                            <YoutubeThumbnail videoId={getYoutubeVideoId(item)!} />
                          </div>
                        ) : null}
                        {(item.item_type === "youtube" || item.external_link) && (
                          <div style={{
                            position: "absolute",
                            bottom: "8px",
                            left: "8px",
                            background: "rgba(0,0,0,0.7)",
                            borderRadius: "3px",
                            padding: "3px 8px",
                            fontSize: "9px",
                            color: "white"
                          }}>▶</div>
                        )}
                      </div>
                      <div style={{ padding: "10px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontFamily: "var(--vp-heading-font)",
                            fontSize: "0.9rem",
                            fontWeight: 600,
                            color: "var(--vp-heading-color)",
                            margin: "0 0 3px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}>
                            {item.title}
                          </p>
                          {(item.client_name || item.project_year) && (
                            <p style={{
                              fontFamily: "var(--vp-body-font)",
                              fontSize: "11px",
                              color: "var(--vp-text-subtle)",
                              margin: 0,
                              fontWeight: 300
                            }}>
                              {[item.client_name, item.project_year]
                                .filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        {onReact && (
                          <div style={{ flexShrink: 0, opacity: 0.8 }}>
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                onReact(item.id, 'fire');
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                background: "rgba(255,255,255,0.05)",
                                padding: "2px 6px",
                                borderRadius: "12px",
                                fontSize: "9px",
                                cursor: "pointer"
                              }}
                            >
                              <span>🔥</span>
                              <span style={{ fontWeight: "bold", color: "white" }}>
                                {(item.fire_count || 0) + (item.mind_blown_count || 0) + (item.hire_count || 0) + (item.love_this_count || 0) + (item.clean_work_count || 0)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {verticalItems.length > 0 && (
        <div>
          {horizontalItems.length > 0 && (
            <p style={{
              fontSize: "10px",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--vp-text-subtle)",
              fontFamily: "var(--vp-body-font)",
              fontWeight: 600,
              margin: "0 0 12px"
            }}>
              Short-Form
            </p>
          )}
          <div style={{
            display: "grid",
            gridTemplateColumns: 
              "repeat(auto-fill, minmax(150px, 1fr))",
            gap: "8px"
          }}>
            {verticalItems.map(item => {
              const thumb = getItemThumbnail(item)
              return (
                <div
                  key={item.id}
                  className="work-card-element relative"
                  onClick={() => onItemClick(item)}
                  style={{ cursor: "pointer" }}
                >
                  {isEditMode && onMoveItem && (
                    <div className="absolute right-2 top-2 z-30 flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button type="button" aria-label="Move item up" className="rounded-full bg-black/80 p-2.5 text-white shadow-lg touch-manipulation" onClick={() => onMoveItem(item.id, "up")}><ChevronUp size={18} /></button>
                      <button type="button" aria-label="Move item down" className="rounded-full bg-black/80 p-2.5 text-white shadow-lg touch-manipulation" onClick={() => onMoveItem(item.id, "down")}><ChevronDown size={18} /></button>
                    </div>
                  )}
                  {item.pdf_url || item.item_type === "pdf" ? (
                    <PDFItem url={(item.pdf_url || item.external_link || "") as string} title={item.title} />
                  ) : (
                    <>
                      <div style={{
                        position: "relative",
                        aspectRatio: "9/16",
                        overflow: "hidden",
                        background: "var(--vp-card)",
                        borderRadius: "4px"
                      }}>
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={item.title || ""}
                            loading="lazy"
                            style={{
                              position: "absolute",
                              inset: "0",
                              width: "100%",
                              height: "100%",
                              objectFit: "cover"
                            }}
                          />
                        ) : getYoutubeVideoId(item) ? (
                          <div style={{ position: "absolute", inset: "0" }}>
                            <YoutubeThumbnail videoId={getYoutubeVideoId(item)!} />
                          </div>
                        ) : null}
                        {(item.item_type === "youtube" || item.external_link) && (
                          <div style={{
                            position: "absolute",
                            top: "8px",
                            right: "8px",
                            background: "rgba(0,0,0,0.7)",
                            borderRadius: "50%",
                            width: "24px",
                            height: "24px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "8px",
                            color: "white"
                          }}>▶</div>
                        )}
                      </div>
                      <div style={{ padding: "8px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontFamily: "var(--vp-heading-font)",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            color: "var(--vp-heading-color)",
                            margin: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}>
                            {item.title}
                          </p>
                        </div>
                        {onReact && (
                          <div style={{ flexShrink: 0, opacity: 0.8 }}>
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                onReact(item.id, 'fire');
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                background: "rgba(255,255,255,0.05)",
                                padding: "2px 6px",
                                borderRadius: "12px",
                                fontSize: "9px",
                                cursor: "pointer"
                              }}
                            >
                              <span>🔥</span>
                              <span style={{ fontWeight: "bold", color: "white" }}>
                                {(item.fire_count || 0) + (item.mind_blown_count || 0) + (item.hire_count || 0) + (item.love_this_count || 0) + (item.clean_work_count || 0)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
