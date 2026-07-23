import { motion } from "framer-motion"
import { useEffect, useState } from "react"

const shimmer = {
  animate: {
    backgroundPosition: ["200% 0", "-200% 0"],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "linear"
    }
  }
}

export function useIsDark() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark")
    }
    return true
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    
    setIsDark(document.documentElement.classList.contains("dark"))
    
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"))
    })
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"]
    })
    
    return () => observer.disconnect()
  }, [])

  return isDark;
}

export const SkeletonBox = ({ 
  width = "100%", 
  height = "20px",
  borderRadius = "8px"
}: {
  width?: string | number
  height?: string | number
  borderRadius?: string
}) => {
  const isDark = useIsDark()
  const backgroundGradient = isDark
    ? "linear-gradient(90deg, #161618 25%, #222225 50%, #161618 75%)"
    : "linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)"

  return (
    <motion.div
      variants={shimmer}
      animate="animate"
      style={{
        width,
        height,
        borderRadius,
        background: backgroundGradient,
        backgroundSize: "400% 100%"
      }}
    />
  )
}

export const SkeletonCard = () => {
  const isDark = useIsDark()
  return (
    <div style={{
      background: isDark ? "rgba(255,255,255,0.02)" : "#ffffff",
      border: isDark ? "0.5px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.06)",
      borderRadius: "16px",
      padding: "20px",
      display: "flex",
      flexDirection: "column",
      gap: "12px"
    }}>
      <SkeletonBox height="160px" borderRadius="10px" />
      <SkeletonBox height="16px" width="70%" />
      <SkeletonBox height="12px" width="40%" />
    </div>
  )
}

export const SkeletonProfile = () => (
  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
    <SkeletonBox 
      width="48px" 
      height="48px" 
      borderRadius="50%" 
    />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
      <SkeletonBox height="16px" width="60%" />
      <SkeletonBox height="12px" width="40%" />
    </div>
  </div>
)

export const SkeletonGrid = ({ count = 6 }: { count?: number }) => (
  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px"
  }}>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
)

export const Spinner = ({ size = 20, color = "#EF4444" }: {
  size?: number
  color?: string
}) => (
  <motion.div
    animate={{ rotate: 360 }}
    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      border: `2px solid rgba(255,255,255,0.1)`,
      borderTopColor: color,
      display: "inline-block"
    }}
  />
)
