import React, { useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { PORTFOLIO_PREVIEWS } from "../../utils/portfolioPreviews"

interface PreviewModalProps {
  category: string
  categoryName: string
  price: number
  onClose: () => void
  onSelect: () => void
}

const PreviewModal = ({ 
  category, 
  categoryName, 
  price, 
  onClose, 
  onSelect 
}: PreviewModalProps) => {
  const preview = PORTFOLIO_PREVIEWS[category]
  const [currentImage, setCurrentImage] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft
    const width = e.currentTarget.clientWidth
    if (width > 0) {
      const index = Math.round(scrollLeft / width)
      if (index !== currentImage && index >= 0 && index < (preview?.images?.length || 0)) {
        setCurrentImage(index)
      }
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 200,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          padding: "20px"
        }}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          onClick={e => e.stopPropagation()}
          style={{
            background: "#0a0a0c",
            border: "0.5px solid rgba(255,255,255,0.1)",
            borderRadius: "20px 20px 16px 16px",
            width: "100%",
            maxWidth: "480px",
            overflow: "hidden",
            maxHeight: "85vh",
            display: "flex",
            flexDirection: "column"
          }}
        >
          {/* Handle bar */}
          <div style={{
            width: "36px",
            height: "4px",
            background: "rgba(255,255,255,0.15)",
            borderRadius: "2px",
            margin: "12px auto 0"
          }} />

          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 12px"
          }}>
            <div>
              <p style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                margin: "0 0 2px"
              }}>
                PORTFOLIO PREVIEW
              </p>
              <h3 style={{
                color: "white",
                fontSize: "16px",
                fontWeight: 700,
                margin: 0
              }}>
                {categoryName}
              </h3>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "0.5px solid rgba(255,255,255,0.1)",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                color: "rgba(255,255,255,0.6)",
                cursor: "pointer",
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              ✕
            </button>
          </div>

          {/* Preview area — scrollable */}
          <div style={{ 
            flex: 1, 
            overflowY: "auto",
            padding: "0 20px"
          }}>
            {/* Disclaimer */}
            <div style={{
              background: "rgba(37, 99, 235, 0.1)",
              border: "1px solid rgba(37, 99, 235, 0.2)",
              borderRadius: "8px",
              padding: "10px 14px",
              marginBottom: "16px",
              marginTop: "8px",
              display: "flex",
              gap: "8px",
              alignItems: "center"
            }}>
              <span style={{ fontSize: "16px" }}>🎨</span>
              <p style={{
                color: "#60a5fa",
                fontSize: "12px",
                margin: 0,
                fontWeight: 600,
                lineHeight: 1.4
              }}>
                This is just a preview. You can fully customize and design the final portfolio to fit your taste!
              </p>
            </div>

            {/* Image carousel or placeholder */}
            {preview?.images && preview.images.length > 0 ? (
              <div>
                {/* Main image carousel */}
                <div 
                  ref={scrollRef}
                  onScroll={handleScroll}
                  style={{
                    display: "flex",
                    overflowX: "auto",
                    scrollSnapType: "x mandatory",
                    marginBottom: "12px",
                    WebkitOverflowScrolling: "touch",
                    scrollbarWidth: "none", // Firefox
                    msOverflowStyle: "none" // IE/Edge
                  }}
                  className="[&::-webkit-scrollbar]:hidden"
                >
                  {preview.images.map((imgSrc, i) => (
                    <div 
                      key={i}
                      style={{
                        flex: "0 0 100%",
                        scrollSnapAlign: "center",
                        aspectRatio: "9/16",
                        maxHeight: "340px",
                        borderRadius: "12px",
                        overflow: "hidden",
                        background: "rgba(0,0,0,0.2)",
                        border: "0.5px solid rgba(255,255,255,0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "4px"
                      }}
                    >
                      <img
                        src={imgSrc}
                        alt={`${categoryName} preview ${i + 1}`}
                        loading="eager"
                        decoding="async"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain"
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Dot indicators */}
                {preview.images.length > 1 && (
                  <div style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: "6px",
                    marginBottom: "16px"
                  }}>
                    {preview.images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setCurrentImage(i)
                          if (scrollRef.current) {
                            const width = scrollRef.current.clientWidth
                            scrollRef.current.scrollTo({ left: width * i, behavior: 'smooth' })
                          }
                        }}
                        style={{
                          width: i === currentImage ? "20px" : "6px",
                          height: "6px",
                          borderRadius: "3px",
                          background: i === currentImage 
                            ? "#EF4444" 
                            : "rgba(255,255,255,0.2)",
                          border: "none",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                          padding: 0
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Beautiful placeholder when no images yet */
              <div style={{
                aspectRatio: "9/16",
                maxHeight: "320px",
                borderRadius: "12px",
                overflow: "hidden",
                marginBottom: "16px",
                background: "linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%)",
                border: "0.5px solid rgba(255,255,255,0.06)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                padding: "24px"
              }}>
                {/* Mock portfolio UI */}
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "rgba(239,68,68,0.15)",
                  border: "0.5px solid rgba(239,68,68,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px"
                }}>
                  {category === "graphic_design" ? "🎨" :
                   category === "video_editing" ? "🎬" :
                   category === "web_development" ? "💻" :
                   category === "uiux_design" ? "✨" :
                   category === "copywriting" ? "✍️" :
                   category === "digital_marketing" ? "📈" :
                   category === "photography" ? "📸" :
                   category === "ai_automation" ? "🤖" :
                   category === "cybersecurity" ? "🛡️" :
                   category === "three_d_design" ? "🎭" : "🎯"}
                </div>

                {/* Mock content blocks */}
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{
                    height: "20px",
                    borderRadius: "4px",
                    background: "rgba(255,255,255,0.08)",
                    width: "60%"
                  }} />
                  <div style={{
                    height: "12px",
                    borderRadius: "4px",
                    background: "rgba(255,255,255,0.04)",
                    width: "80%"
                  }} />
                  <div style={{
                    height: "1px",
                    background: "rgba(239,68,68,0.4)",
                    width: "100%",
                    margin: "4px 0"
                  }} />
                </div>

                {/* Mock grid */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "6px",
                  width: "100%"
                }}>
                  {[0,1,2,3].map(i => (
                    <div key={i} style={{
                      aspectRatio: i % 3 === 0 ? "16/9" : "1/1",
                      borderRadius: "6px",
                      background: "rgba(255,255,255,0.05)",
                      border: "0.5px solid rgba(255,255,255,0.06)"
                    }} />
                  ))}
                </div>

                <p style={{
                  color: "rgba(255,255,255,0.2)",
                  fontSize: "11px",
                  margin: 0,
                  textAlign: "center"
                }}>
                  Preview coming soon
                </p>
              </div>
            )}

            {/* Description */}
            <div style={{ marginBottom: "8px" }}>
              <h4 style={{
                color: "white",
                fontSize: "15px",
                fontWeight: 700,
                margin: "0 0 6px"
              }}>
                {preview?.headline || categoryName}
              </h4>
              <p style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: "13px",
                lineHeight: 1.6,
                margin: 0
              }}>
                {preview?.description || 
                 "Build a stunning portfolio to showcase your work."}
              </p>
            </div>

            {/* Features list */}
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "0.5px solid rgba(255,255,255,0.06)",
              borderRadius: "12px",
              padding: "12px 16px",
              marginBottom: "16px"
            }}>
              <p style={{
                color: "rgba(255,255,255,0.3)",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                margin: "0 0 10px"
              }}>
                WHAT YOU GET
              </p>
              {[
                "Public portfolio link (plugsy.ng/vp/your-name)",
                "Reaction engine — clients react to your work",
                "Analytics — see which work gets most attention",
                "Share on WhatsApp, Twitter, Instagram",
                "Mobile optimized — looks great on all devices",
                "High referral commission when you refer others"
              ].map((feature, i) => (
                <div key={i} style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  marginBottom: i < 5 ? "8px" : 0
                }}>
                  <span style={{ 
                    color: "#4ade80", 
                    fontSize: "11px",
                    marginTop: "1px",
                    flexShrink: 0
                  }}>
                    ✓
                  </span>
                  <span style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: "12px",
                    lineHeight: 1.4
                  }}>
                    {feature}
                  </span>
                </div>
              ))}
            </div>

          </div>

          {/* Bottom action */}
          <div style={{
            padding: "12px 20px 20px",
            borderTop: "0.5px solid rgba(255,255,255,0.06)"
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px"
            }}>
              <div>
                <p style={{
                  color: "rgba(255,255,255,0.3)",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  margin: "0 0 2px"
                }}>
                  ONE-TIME PRICE
                </p>
                <p style={{
                  color: "white",
                  fontSize: "22px",
                  fontWeight: 800,
                  margin: 0
                }}>
                  ₦{price.toLocaleString()}
                </p>
              </div>
              <div style={{
                background: "rgba(239,68,68,0.1)",
                border: "0.5px solid rgba(239,68,68,0.2)",
                borderRadius: "8px",
                padding: "4px 10px"
              }}>
                <span style={{
                  color: "#f87171",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase"
                }}>
                  LIFETIME ACCESS
                </span>
              </div>
            </div>
            
            <button
              onClick={() => {
                onClose()
                onSelect()
              }}
              style={{
                width: "100%",
                padding: "14px",
                background: "#EF4444",
                border: "none",
                borderRadius: "12px",
                color: "white",
                fontSize: "14px",
                fontWeight: 700,
                letterSpacing: "0.05em",
                cursor: "pointer",
                textTransform: "uppercase"
              }}
            >
              Get This Portfolio — ₦{price.toLocaleString()}
            </button>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default PreviewModal
