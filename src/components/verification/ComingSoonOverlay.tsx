import React from "react";

export const ComingSoonOverlay = () => (
  <div style={{
    position: "relative",
    borderRadius: "16px",
    overflow: "hidden",
    border: "0.5px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    padding: "40px 24px",
    textAlign: "center",
    cursor: "not-allowed"
  }}>
    
    {/* Glass shimmer effect */}
    <div style={{
      position: "absolute",
      inset: 0,
      background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%, rgba(255,255,255,0.02) 100%)",
      pointerEvents: "none"
    }} />
    
    {/* Lock icon */}
    <div style={{
      width: "48px",
      height: "48px",
      borderRadius: "12px",
      background: "rgba(255,255,255,0.06)",
      border: "0.5px solid rgba(255,255,255,0.1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      margin: "0 auto 16px"
    }}>
      <span style={{ fontSize: "20px", opacity: 0.5 }}>🔒</span>
    </div>
    
    {/* Coming Soon badge */}
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      background: "rgba(255,255,255,0.06)",
      border: "0.5px solid rgba(255,255,255,0.1)",
      borderRadius: "999px",
      padding: "4px 12px",
      marginBottom: "12px"
    }}>
      <span style={{
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.25em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.4)"
      }}>
        COMING SOON
      </span>
    </div>
    
    <p style={{
      color: "rgba(255,255,255,0.25)",
      fontSize: "12px",
      margin: 0,
      lineHeight: 1.5
    }}>
      Direct video upload launching soon.
      Use video links below instead.
    </p>

  </div>
);
