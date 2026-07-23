import { useState, useEffect } from "react"

export default function InstallGuide() {
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState<
    "android" | "ios" | "desktop" | null
  >(null)

  useEffect(() => {
    // Check if already installed
    const isStandalone = 
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true

    if (isStandalone) return

    // Check if dismissed
    if (localStorage.getItem("install_guide_dismissed")) return

    // Detect platform
    const ua = navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua) && 
                  !(window as any).MSStream

    if (isIOS) setPlatform("ios")
    else return // Don't show manual guide on android or desktop, rely on native prompts

    // Show after 8 seconds on dashboard
    const timer = setTimeout(() => setShow(true), 8000)
    return () => clearTimeout(timer)
  }, [])

  const dismiss = () => {
    setShow(false)
    localStorage.setItem("install_guide_dismissed", "true")
  }

  if (!show || !platform) return null

  const steps = {
    android: [
      "Tap the menu icon (⋮) in Chrome",
      "Tap \"Add to Home screen\"",
      "Tap \"Add\" to confirm"
    ],
    ios: [
      "Tap the Share button (⬆️) in Safari",
      "Scroll down and tap \"Add to Home Screen\"",
      "Tap \"Add\" in the top right"
    ],
    desktop: [
      "Click the install icon (⊕) in your address bar",
      "Click \"Install\" to confirm"
    ]
  }

  return (
    <div style={{
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "calc(100% - 32px)",
      maxWidth: "360px",
      background: "#111",
      border: "0.5px solid rgba(255,255,255,0.12)",
      borderRadius: "16px",
      padding: "16px",
      zIndex: 9999,
      boxShadow: "0 8px 40px rgba(0,0,0,0.8)"
    }}>
      
      {/* Close button */}
      <button
        onClick={dismiss}
        style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.3)",
          fontSize: "16px",
          cursor: "pointer",
          padding: "4px"
        }}
      >
        ✕
      </button>

      <div style={{ 
        display: "flex", 
        gap: "12px", 
        alignItems: "flex-start",
        marginRight: "24px"
      }}>
        <img
          src="https://res.cloudinary.com/doit6oaze/image/upload/v1783666216/icon-192_gxuh39.png"
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "10px",
            flexShrink: 0
          }}
        />
        <div>
          <p style={{
            color: "white",
            fontSize: "14px",
            fontWeight: 700,
            margin: "0 0 3px"
          }}>
            Install Plugsy
          </p>
          <p style={{
            color: "rgba(255,255,255,0.4)",
            fontSize: "12px",
            margin: "0 0 12px",
            lineHeight: 1.4
          }}>
            Install for real popup notifications 
            when your login is ready.
          </p>
          
          {/* Steps */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px"
          }}>
            {steps[platform].map((step, i) => (
              <div 
                key={i}
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "flex-start"
                }}
              >
                <span style={{
                  background: "#EF4444",
                  color: "white",
                  borderRadius: "50%",
                  width: "18px",
                  height: "18px",
                  fontSize: "10px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "1px"
                }}>
                  {i + 1}
                </span>
                <span style={{
                  color: "rgba(255,255,255,0.6)",
                  fontSize: "12px",
                  lineHeight: 1.4
                }}>
                  {step}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={dismiss}
            style={{
              marginTop: "12px",
              background: "transparent",
              border: "0.5px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "rgba(255,255,255,0.3)",
              padding: "6px 14px",
              fontSize: "11px",
              cursor: "pointer",
              width: "100%"
            }}
          >
            Got it, I'll do it later
          </button>
        </div>
      </div>
    </div>
  )
}
