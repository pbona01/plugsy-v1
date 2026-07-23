import React, { useState, useEffect } from 'react';

export const HorizontalScrollHint = () => {
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
      <style dangerouslySetInnerHTML={{__html: `
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
          background: "rgba(255,255,255,0.06)",
          padding: "6px 12px",
          borderRadius: "100px",
          backdropFilter: "blur(10px)"
        }}>
          <div style={{ animation: "slideLeft 1.5s infinite alternate", fontSize: "12px" }}>←</div>
          <span style={{ 
            fontSize: "11px", 
            fontWeight: 600, 
            letterSpacing: "0.05em",
            color: "var(--vp-text-subtle)",
            textTransform: "uppercase"
          }}>
            Swipe to explore
          </span>
          <div style={{ animation: "slideRight 1.5s infinite alternate text-white", fontSize: "12px" }}>→</div>
        </div>
      </div>
    </>
  );
};
