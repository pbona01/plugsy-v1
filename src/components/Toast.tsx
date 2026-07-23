import { motion, AnimatePresence } from "framer-motion"
import { useState, useEffect } from "react"

export interface Toast {
  id: string
  message: string
  type: "success" | "error" | "info"
  duration?: number
}

let toastCallback: ((toast: Toast) => void) | null = null

export const showToast = (
  message: string,
  type: Toast["type"] = "info",
  duration = 3000
) => {
  if (toastCallback) {
    toastCallback({
      id: Date.now().toString(),
      message,
      type,
      duration
    })
  }
}

export const ToastContainer = () => {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    toastCallback = (toast: Toast) => {
      setToasts(prev => [...prev, toast])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id))
      }, toast.duration || 3000)
    }
    return () => { toastCallback = null }
  }, [])

  const getToastStyle = (type: Toast["type"]) => {
    const base = {
      background: "rgba(10,10,12,0.95)",
      backdropFilter: "blur(20px)",
      borderRadius: "12px",
      padding: "12px 16px",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      maxWidth: "360px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
    }
    
    const borders = {
      success: "0.5px solid rgba(74,222,128,0.3)",
      error: "0.5px solid rgba(239,68,68,0.3)",
      info: "0.5px solid rgba(255,255,255,0.1)"
    }

    return { ...base, border: borders[type] }
  }

  const getIcon = (type: Toast["type"]) => ({
    success: "✓",
    error: "✗",
    info: "ℹ"
  })[type]

  const getIconColor = (type: Toast["type"]) => ({
    success: "#4ade80",
    error: "#f87171",
    info: "rgba(255,255,255,0.5)"
  })[type]

  return (
    <div style={{
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      pointerEvents: "none"
    }}>
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ 
              duration: 0.3, 
              ease: [0.16, 1, 0.3, 1] 
            }}
            style={getToastStyle(toast.type)}
          >
            <span style={{
              color: getIconColor(toast.type),
              fontSize: "14px",
              fontWeight: 700,
              minWidth: "16px",
              textAlign: "center"
            }}>
              {getIcon(toast.type)}
            </span>
            <span style={{
              color: "rgba(255,255,255,0.85)",
              fontSize: "13px",
              lineHeight: 1.4
            }}>
              {toast.message}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
