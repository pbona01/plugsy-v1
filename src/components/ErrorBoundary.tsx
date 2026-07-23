// @ts-nocheck
import React, { Component, ReactNode } from "react"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null }

  constructor(props: Props) {
    super(props)
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: any) {
    console.error("[ErrorBoundary] caught:", error, info)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          padding: "24px"
        }}>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "0.5px solid rgba(255,255,255,0.1)",
            borderRadius: "24px",
            padding: "40px",
            maxWidth: "480px",
            width: "100%",
            textAlign: "center",
            backdropFilter: "blur(20px)"
          }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              background: "rgba(239,68,68,0.1)",
              border: "0.5px solid rgba(239,68,68,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              fontSize: "24px"
            }}>
              ⚠
            </div>
            <h2 style={{
              color: "white",
              fontSize: "18px",
              fontWeight: 600,
              margin: "0 0 8px"
            }}>
              Something went wrong
            </h2>
            <p style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: "14px",
              lineHeight: 1.6,
              margin: "0 0 24px"
            }}>
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              style={{
                background: "#EF4444",
                color: "white",
                border: "none",
                borderRadius: "12px",
                padding: "12px 24px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: "0.05em"
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
