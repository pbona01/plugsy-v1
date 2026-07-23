import React, { useState } from 'react';
import { VPCustomCategory, VPPortfolioItem, VPPortfolio } from '../../types/verification';
import { Edit2, Trash2 } from "lucide-react";
import { WorkGrid } from '../portfolio/WorkGrid';
import { extractYoutubeId } from "../../utils/verification";

interface CategoryBlockProps {
  category: VPCustomCategory
  items: VPPortfolioItem[]
  portfolio: VPPortfolio
  onItemClick: (item: VPPortfolioItem) => void
  isEditMode?: boolean
  hideHeader?: boolean
  onEditItem?: (item: VPPortfolioItem) => void
  onDeleteItem?: (id: string) => void
}

export const CategoryBlock = ({ 
  category, 
  items, 
  portfolio,
  onItemClick,
  isEditMode = false,
  hideHeader = false,
  onEditItem,
  onDeleteItem
}: CategoryBlockProps) => {

  // Split items by aspect ratio
  const horizontalItems = items.filter(
    item => !item.aspect_ratio || item.aspect_ratio === "horizontal"
  )
  const verticalItems = items.filter(
    item => item.aspect_ratio === "vertical"
  )

  const getThumb = (item: VPPortfolioItem) => {
    const ytId = item.youtube_embed_id || extractYoutubeId(item.youtube_url || item.external_link || "");
    const targetYtId = ytId === "mock_video_id" ? null : ytId;

    return item.cover_image_url || 
           (item as any).customThumbnailUrl || 
           item.custom_thumbnail_url || 
           (item as any).imageUrl || 
           item.image_url || 
           (targetYtId ? `https://img.youtube.com/vi/${targetYtId}/maxresdefault.jpg` : null);
  }

  return (
    <div style={{ marginBottom: "80px" }}>
      
      {/* Category header */}
      {!hideHeader && (
        <div style={{ 
          marginBottom: "32px",
          paddingBottom: "16px",
          borderBottom: "1px solid var(--vp-border)"
        }}>
          <h3 style={{
            fontFamily: "var(--vp-heading-font)",
            fontSize: "clamp(1.2rem, 3vw, 1.8rem)",
            fontWeight: "var(--vp-heading-weight)" as any,
            color: "var(--vp-heading-color)",
            margin: 0,
            lineHeight: 1.1
          }}>
            {category.name}
          </h3>
          {category.description && (
            <p style={{
              fontFamily: "var(--vp-body-font)",
              fontSize: "13px",
              color: "var(--vp-text-subtle)",
              margin: "6px 0 0",
              fontWeight: 300
            }}>
              {category.description}
            </p>
          )}
        </div>
      )}

      <WorkGrid 
        items={items} 
        workLayout={portfolio.work_layout || "grid"}
        onItemClick={onItemClick}
      />

    </div>
  )
}

const HorizontalCard = ({ 
  item, 
  thumb, 
  onClick,
  isEditMode,
  onEditItem,
  onDeleteItem
}: { 
  key?: any,
  item: VPPortfolioItem, 
  thumb: string | null, 
  onClick: () => void,
  isEditMode?: boolean,
  onEditItem?: (item: VPPortfolioItem) => void,
  onDeleteItem?: (id: string) => void
}) => {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="portfolio-btn transition-transform duration-200"
      style={{
        cursor: "pointer",
        overflow: "hidden",
        position: "relative"
      }}
    >
      {/* Edit Mode Buttons with Touch Scale Feedback */}
      {isEditMode && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          style={{ 
            position: "absolute", 
            top: "12px", 
            right: "12px", 
            zIndex: 30, 
            display: "flex", 
            gap: "8px" 
          }}
        >
          <button 
            onClick={(e) => { e.stopPropagation(); onEditItem?.(item); }} 
            className="portfolio-btn bg-brand-text text-brand-bg w-8 h-8 flex items-center justify-center rounded-lg hover:scale-105 transition shadow-lg border border-neutral-800"
          >
            <Edit2 size={12} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onDeleteItem?.(item.id); }} 
            className="portfolio-btn bg-red-500 text-white w-8 h-8 flex items-center justify-center rounded-lg hover:scale-105 transition shadow-lg"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
      {/* Media container with glass / border enhancements */}
      <div 
        className="shadow-xl"
        style={{
          position: "relative",
          aspectRatio: "16/9",
          overflow: "hidden",
          borderRadius: "16px",
          background: "rgba(255, 255, 255, 0.03)",
          border: "0.5px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 10px 30px -10px rgba(0,0,0,0.3)"
        }}
      >
        
        {thumb ? (
          <img
            src={thumb}
            alt={item.title}
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              transform: hovered ? "scale(1.03)" : "scale(1)",
              transition: "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
            }}
          />
        ) : (
          <div style={{
            width: "100%",
            height: "100%",
            background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px"
          }}>
            <span style={{ 
              color: "white", 
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              textAlign: "center"
            }}>
              {item.title}
            </span>
          </div>
        )}

        {/* Video indicator with high physical padding */}
        {item.item_type === "youtube" && (
          <div style={{
            position: "absolute",
            bottom: "14px",
            left: "14px",
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            border: "0.5px solid rgba(255,255,255,0.15)",
            borderRadius: "6px",
            padding: "4px 10px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            zIndex: 10
          }}>
            <span style={{ 
              color: "white", 
              fontSize: "8px" 
            }}>▶</span>
            {item.duration_seconds && (
              <span style={{ 
                color: "white", 
                fontSize: "10px",
                fontFamily: "var(--vp-body-font)",
                fontWeight: 700
              }}>
                {Math.floor(item.duration_seconds / 60)}:
                {String(item.duration_seconds % 60).padStart(2, "0")}
              </span>
            )}
          </div>
        )}

        {/* Hover play scale overlay */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.25s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 5
        }}>
          <div style={{
            background: "rgba(255,255,255,0.2)",
            border: "1px solid rgba(255,255,255,0.3)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            borderRadius: "50%",
            width: "48px",
            height: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: hovered ? "scale(1.1)" : "scale(0.9)",
            transition: "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
          }}>
            <span style={{ color: "white", fontSize: "14px" }}>▶</span>
          </div>
        </div>

      </div>

      {/* Metadata BELOW the frame with 12px safety margin */}
      <div style={{
        padding: "12px 6px 0",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        transition: "transform 0.3s ease"
      }}>
        <h4 style={{
          fontFamily: "var(--vp-heading-font)",
          fontSize: "0.9rem",
          fontWeight: 700,
          color: "var(--vp-heading-color)",
          margin: "0 0 6px",
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}>
          {item.title}
        </h4>
        <div style={{
          display: "flex",
          gap: "8px",
          alignItems: "center"
        }}>
          {item.client_name && (
            <span style={{
              fontFamily: "var(--vp-body-font)",
              fontSize: "11px",
              color: "var(--vp-text-subtle)",
              fontWeight: 500,
              letterSpacing: "0.03em"
            }}>
              {item.client_name}
            </span>
          )}
          {item.client_name && item.project_year && (
            <span style={{ color: "var(--vp-text-subtle)", fontSize: "10px" }}>
              ·
            </span>
          )}
          {item.project_year && (
            <span style={{
              fontFamily: "var(--vp-body-font)",
              fontSize: "11px",
              color: "var(--vp-text-subtle)",
              fontWeight: 300
            }}>
              {item.project_year}
            </span>
          )}
        </div>
      </div>

    </div>
  )
}

const VerticalCard = ({ 
  item, 
  thumb, 
  onClick,
  isEditMode,
  onEditItem,
  onDeleteItem
}: { 
  key?: any,
  item: VPPortfolioItem, 
  thumb: string | null, 
  onClick: () => void,
  isEditMode?: boolean,
  onEditItem?: (item: VPPortfolioItem) => void,
  onDeleteItem?: (id: string) => void
}) => {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="portfolio-btn transition-transform duration-200"
      style={{ cursor: "pointer", position: "relative" }}
    >
      {/* Edit Mode Buttons with Touch Scale Feedback */}
      {isEditMode && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          style={{ 
            position: "absolute", 
            top: "12px", 
            right: "12px", 
            zIndex: 30, 
            display: "flex", 
            gap: "8px" 
          }}
        >
          <button 
            onClick={(e) => { e.stopPropagation(); onEditItem?.(item); }} 
            className="portfolio-btn bg-brand-text text-brand-bg w-8 h-8 flex items-center justify-center rounded-lg hover:scale-105 transition shadow-lg border border-neutral-800"
          >
            <Edit2 size={12} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onDeleteItem?.(item.id); }} 
            className="portfolio-btn bg-red-500 text-white w-8 h-8 flex items-center justify-center rounded-lg hover:scale-105 transition shadow-lg"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
      {/* Media container with glass / border enhancements */}
      <div 
        className="shadow-xl"
        style={{
          position: "relative",
          aspectRatio: "9/16",
          overflow: "hidden",
          borderRadius: "16px",
          background: "rgba(255, 255, 255, 0.03)",
          border: "0.5px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 10px 30px -10px rgba(0,0,0,0.3)"
        }}
      >

        {thumb ? (
          <img
            src={thumb}
            alt={item.title}
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              transform: hovered ? "scale(1.04)" : "scale(1)",
              transition: "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
            }}
          />
        ) : (
          <div style={{
            width: "100%",
            height: "100%",
            background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}>
            <span style={{ 
              color: "white", 
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              textAlign: "center",
              lineHeight: 1.3
            }}>
              {item.title}
            </span>
          </div>
        )}

        {/* Video indicator with deep blur backing */}
        {item.item_type === "youtube" && (
          <div style={{
            position: "absolute",
            top: "14px",
            right: "14px",
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            borderRadius: "50%",
            width: "28px",
            height: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <span style={{ color: "white", fontSize: "8px" }}>▶</span>
          </div>
        )}

        {/* Gradient Blur Overlay bottom text */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent 50%)",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.25s ease"
        }}>
          <div style={{
            position: "absolute",
            bottom: "16px",
            left: "16px",
            right: "16px"
          }}>
            <p style={{
              fontFamily: "var(--vp-heading-font)",
              fontSize: "0.8rem",
              fontWeight: 700,
              color: "white",
              margin: 0,
              lineHeight: 1.2,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical"
            }}>
              {item.title}
            </p>
          </div>
        </div>

      </div>

      {/* Metadata below with 8px safety margins — clean, never overlapping */}
      <div style={{ padding: "8px 4px 0" }}>
        <h4 style={{
          fontFamily: "var(--vp-heading-font)",
          fontSize: "0.8rem",
          fontWeight: 700,
          color: "var(--vp-heading-color)",
          margin: "0 0 4px",
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}>
          {item.title}
        </h4>
        {(item.client_name || item.project_year) && (
          <span style={{
            fontFamily: "var(--vp-body-font)",
            fontSize: "10px",
            color: "var(--vp-text-subtle)",
            fontWeight: 400
          }}>
            {[item.client_name, item.project_year]
              .filter(Boolean).join(" · ")}
          </span>
        )}
      </div>

    </div>
  )
}

export default CategoryBlock;
