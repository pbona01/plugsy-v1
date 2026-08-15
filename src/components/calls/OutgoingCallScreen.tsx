import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { PhoneOff } from "lucide-react"
import { useCall } from "@/contexts/CallContext"

const OutgoingCallScreen = ({ call }: { call: any }) => {
  const { cancelOutgoingCall } = useCall()
  const [dots, setDots] = useState(1)

  useEffect(() => {
    const t = setInterval(() => setDots(d => (d % 3) + 1), 500)
    return () => clearInterval(t)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "linear-gradient(180deg, #07152d 0%, #080b12 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "60px 24px 48px"
      }}
    >
      {/* Top: call type label */}
      <div style={{ textAlign: "center", marginTop: "20px" }}>
        <p style={{
          color: "rgba(255,255,255,0.4)",
          fontSize: "13px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          margin: 0
        }}>
          Calling{".".repeat(dots)}
        </p>
        {call.chatName && call.calleeName !== call.chatName && (
          <p style={{
            color: "rgba(255,255,255,0.3)",
            fontSize: "12px",
            marginTop: "4px"
          }}>
            in {call.chatName}
          </p>
        )}
      </div>

      {/* Center: avatar + name */}
      <div style={{ 
        display: "flex", flexDirection: "column", 
        alignItems: "center", gap: "20px" 
      }}>
        <div style={{ position: "relative" }}>
          <div style={{
            width: "140px", height: "140px", borderRadius: "50%",
            overflow: "hidden", border: "3px solid rgba(255,255,255,0.1)",
            background: "#101722", display: "flex",
            alignItems: "center", justifyContent: "center"
          }}>
            {call.calleeAvatar ? (
              <img src={call.calleeAvatar} style={{
                width: "100%", height: "100%", objectFit: "cover"
              }} />
            ) : (
              <span style={{ fontSize: "48px", color: "white" }}>
                {(call.calleeName || "?")[0].toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <h2 style={{
            color: "white", fontSize: "26px", fontWeight: 700, margin: 0
          }}>
            {call.calleeName || "User"}
          </h2>
          <p style={{
            color: "rgba(255,255,255,0.4)", fontSize: "14px", marginTop: "6px"
          }}>
            Plugsy Call
          </p>
        </div>
      </div>

      {/* Bottom: single cancel button */}
      <div style={{
        display: "flex", justifyContent: "center",
        width: "100%", maxWidth: "320px", alignItems: "center"
      }}>
        <div style={{ display: "flex", flexDirection: "column", 
          alignItems: "center", gap: "10px" }}>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={cancelOutgoingCall}
            style={{
              width: "68px", height: "68px", borderRadius: "50%",
              background: "#EF4444", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", boxShadow: "0 4px 20px rgba(239,68,68,0.4)"
            }}
          >
            <PhoneOff size={25} />
          </motion.button>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>
            Cancel
          </span>
        </div>
      </div>
    </motion.div>
  )
}

export default OutgoingCallScreen
