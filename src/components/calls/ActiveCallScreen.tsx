import React, { useState, useEffect, useRef } from "react"
import { useCall } from "@/contexts/CallContext"
import DailyIframe from "@daily-co/daily-js"

const ActiveCallScreen = ({ call }: { call: any }) => {
  const { endActiveCall } = useCall()
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(call.callType === "voice")

  const containerRef = useRef<HTMLDivElement>(null)
  const callFrameRef = useRef<any>(null)

  useEffect(() => {
    const t = setInterval(() => setDuration(d => d + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    console.log("[call-screen] creating Daily.co frame, room:", call.roomUrl, "user:", call.currentUserName)

    const callFrame = DailyIframe.createFrame(containerRef.current, {
      iframeStyle: {
        width: "100%", height: "100%", border: "none"
      },
      showLeaveButton: false,
      showFullscreenButton: false,
      // Explicitly request mic/cam permissions from iframe sandbox
      userName: call.currentUserName || "Plugsy User"
    })

    // Explicitly tell Daily.co to join with audio & video enabled, matching callType
    callFrame.join({
      url: call.roomUrl,
      userName: call.currentUserName || "Plugsy User",
      videoSource: call.callType === "video" ? true : false,
      audioSource: true
    }).catch(err => {
      console.error("[call-screen] Join failed:", err)
    })

    callFrameRef.current = callFrame

    return () => {
      console.log("[call-screen] destroying call frame")
      callFrame.destroy()
    }
  }, [call.roomUrl])

  const toggleMute = () => {
    const newState = !muted
    setMuted(newState)
    callFrameRef.current?.setLocalAudio(!newState)
  }

  const toggleCamera = () => {
    const newState = !cameraOff
    setCameraOff(newState)
    callFrameRef.current?.setLocalVideo(!newState)
  }

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0")
    const s = (secs % 60).toString().padStart(2, "0")
    return m + ":" + s
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "#0a0a0c", display: "flex", flexDirection: "column"
    }}>
      {/* Top bar: name + duration */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        padding: "16px 20px", zIndex: 10,
        background: "linear-gradient(180deg, rgba(0,0,0,0.6), transparent)",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div>
          <p style={{ color: "white", fontSize: "15px", fontWeight: 600, margin: 0 }}>
            {call.hostId === call.currentUserId ? (call.calleeName || call.chatName) : call.hostName}
          </p>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px", margin: 0 }}>
            {formatDuration(duration)}
          </p>
        </div>
      </div>

      {/* Daily.co video container */}
      <div ref={containerRef} style={{ flex: 1, width: "100%" }} />

      {/* Bottom control bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "20px 24px 32px", zIndex: 10,
        background: "linear-gradient(0deg, rgba(0,0,0,0.7), transparent)",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "20px"
      }}>
        <button
          onClick={toggleMute}
          style={{
            width: "52px", height: "52px", borderRadius: "50%",
            background: muted ? "white" : "rgba(255,255,255,0.15)",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "20px"
          }}
        >
          {muted ? "🔇" : "🎤"}
        </button>

        {call.callType === "video" && (
          <button
            onClick={toggleCamera}
            style={{
              width: "52px", height: "52px", borderRadius: "50%",
              background: cameraOff ? "white" : "rgba(255,255,255,0.15)",
              border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "20px"
            }}
          >
            {cameraOff ? "📵" : "📹"}
          </button>
        )}

        <button
          onClick={endActiveCall}
          style={{
            width: "60px", height: "60px", borderRadius: "50%",
            background: "#EF4444", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "24px", transform: "rotate(135deg)",
            boxShadow: "0 4px 20px rgba(239,68,68,0.5)"
          }}
        >
          📞
        </button>
      </div>
    </div>
  )
}

export default ActiveCallScreen
