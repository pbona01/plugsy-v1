import React from "react"
import { motion } from "framer-motion"
import { useCall } from "@/contexts/CallContext"

const IncomingCallScreen = ({ call }: { call: any }) => {
  const { acceptCall, declineCall } = useCall()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "linear-gradient(180deg, #1a0a0a 0%, #0a0a0c 100%)",
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
          Incoming {call.callType === "voice" ? "Voice" : "Video"} Call
        </p>
        {call.chatName && (
          <p style={{
            color: "rgba(255,255,255,0.3)",
            fontSize: "12px",
            marginTop: "4px"
          }}>
            in {call.chatName}
          </p>
        )}
      </div>

      {/* Center: avatar + name with pulsing ring animation */}
      <div style={{ 
        display: "flex", flexDirection: "column", 
        alignItems: "center", gap: "20px" 
      }}>
        <div style={{ position: "relative" }}>
          {/* Pulsing rings */}
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              animate={{ scale: [1, 1.6], opacity: [0.4, 0] }}
              transition={{
                duration: 2, repeat: Infinity,
                delay: i * 0.5, ease: "easeOut"
              }}
              style={{
                position: "absolute", inset: 0,
                border: "2px solid #EF4444",
                borderRadius: "50%"
              }}
            />
          ))}
          <div style={{
            width: "140px", height: "140px", borderRadius: "50%",
            overflow: "hidden", border: "3px solid rgba(255,255,255,0.1)",
            background: "#222", display: "flex",
            alignItems: "center", justifyContent: "center"
          }}>
            {call.hostAvatar ? (
              <img src={call.hostAvatar} style={{
                width: "100%", height: "100%", objectFit: "cover"
              }} />
            ) : (
              <span style={{ fontSize: "48px", color: "white" }}>
                {(call.hostName || "?")[0].toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <h2 style={{
            color: "white", fontSize: "26px", fontWeight: 700, margin: 0
          }}>
            {call.hostName}
          </h2>
          <p style={{
            color: "rgba(255,255,255,0.4)", fontSize: "14px", marginTop: "6px"
          }}>
            Plugsy Call
          </p>
        </div>
      </div>

      {/* Bottom: decline / accept buttons */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        width: "100%", maxWidth: "320px", alignItems: "center"
      }}>
        <div style={{ display: "flex", flexDirection: "column", 
          alignItems: "center", gap: "10px" }}>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={declineCall}
            style={{
              width: "68px", height: "68px", borderRadius: "50%",
              background: "#EF4444", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", boxShadow: "0 4px 20px rgba(239,68,68,0.4)"
            }}
          >
            <span style={{ fontSize: "26px", transform: "rotate(135deg)" }}>
              📞
            </span>
          </motion.button>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>
            Decline
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", 
          alignItems: "center", gap: "10px" }}>
          <motion.button
            whileTap={{ scale: 0.9 }}
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            onClick={acceptCall}
            style={{
              width: "68px", height: "68px", borderRadius: "50%",
              background: "#22c55e", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", boxShadow: "0 4px 20px rgba(34,197,94,0.4)"
            }}
          >
            <span style={{ fontSize: "26px" }}>📞</span>
          </motion.button>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>
            Accept
          </span>
        </div>
      </div>
    </motion.div>
  )
}

export default IncomingCallScreen
