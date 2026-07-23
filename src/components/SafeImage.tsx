import React, { useState } from "react"

const DEFAULT_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%231a1a1a'/%3E%3Ctext x='200' y='150' text-anchor='middle' fill='%23333' font-size='14' font-family='sans-serif'%3ENo Image%3C/text%3E%3C/svg%3E"

export const SafeImage = ({
  src,
  alt,
  style,
  placeholder,
  className,
  ...props
}: {
  src: string | null | undefined
  alt: string
  style?: React.CSSProperties
  className?: string
  placeholder?: string
  [key: string]: any
}) => {
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const imgSrc = error || !src 
    ? (placeholder || DEFAULT_PLACEHOLDER) 
    : src

  return (
    <div style={{ position: "relative", ...style }} className={className}>
      {!loaded && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: "#1a1a1a",
          borderRadius: "inherit"
        }} />
      )}
      <img
        src={imgSrc}
        alt={alt}
        onError={() => setError(true)}
        onLoad={() => setLoaded(true)}
        loading={props.loading || "lazy"}
        style={{
          ...style,
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.3s ease",
          width: "100%",
          height: "100%",
          display: "block",
          objectFit: style?.objectFit || "cover",
          borderRadius: "inherit"
        }}
        {...props}
      />
    </div>
  )
}
