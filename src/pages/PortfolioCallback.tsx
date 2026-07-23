import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function PortfolioCallback() {
  const [status, setStatus] = useState<
    "checking" | "success" | "pending" | "failed"
  >("checking")
  const [portfolioId, setPortfolioId] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    const reference = new URLSearchParams(
      window.location.search
    ).get("reference") || 
    new URLSearchParams(
      window.location.search  
    ).get("trxref")

    console.log("[callback] reference:", reference)

    if (!reference) {
      setStatus("failed")
      return
    }

    checkPayment(reference)
  }, [])

  const checkPayment = async (reference: string) => {
    console.log("[callback] checking payment:", reference)
    
    try {
      const res = await fetch("/api/portfolio?action=verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference })
      })

      const text = await res.text()
      console.log("[callback] verify response:", text)
      
      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        setStatus("failed")
        return
      }

      if (data.portfolioId) {
        // Portfolio exists and payment confirmed
        setStatus("success")
        setPortfolioId(data.portfolioId)
        // Redirect to editor after 2 seconds
        setTimeout(() => {
          navigate("/portfolio/" + data.portfolioId + "/edit")
        }, 2000)
        return
      }

      if (data.paymentFailed) {
        // Payment was cancelled or failed
        setStatus("failed")
        return
      }

      if (data.pending && attempts < 10) {
        // Webhook hasn't fired yet — poll
        setAttempts(prev => prev + 1)
        setTimeout(() => checkPayment(reference), 3000)
        return
      }

      if (attempts >= 10) {
        // Webhook never fired after 30 seconds
        // This means payment was cancelled
        setStatus("failed")
        return
      }

    } catch (e) {
      console.error("[callback] error:", e)
      setStatus("failed")
    }
  }

  if (status === "checking") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "16px"
      }}>
        <div style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.1)",
          borderTopColor: "#EF4444",
          animation: "spin 0.8s linear infinite"
        }} />
        <p style={{
          color: "rgba(255,255,255,0.5)",
          fontSize: "14px",
          textAlign: "center"
        }}>
          {attempts > 0 
            ? "Confirming your payment... (" + attempts + "/10)"
            : "Verifying payment..."}
        </p>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  if (status === "success") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "16px",
        padding: "24px"
      }}>
        <div style={{
          width: "64px",
          height: "64px",
          borderRadius: "50%",
          background: "rgba(74,222,128,0.1)",
          border: "0.5px solid rgba(74,222,128,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "28px"
        }}>
          ✓
        </div>
        <h2 style={{
          color: "white",
          fontSize: "20px",
          fontWeight: 700,
          margin: 0,
          textAlign: "center"
        }}>
          Payment Confirmed!
        </h2>
        <p style={{
          color: "rgba(255,255,255,0.4)",
          fontSize: "14px",
          margin: 0,
          textAlign: "center"
        }}>
          Your portfolio is ready. Redirecting...
        </p>
      </div>
    )
  }

  if (status === "failed") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "16px",
        padding: "24px"
      }}>
        <div style={{
          width: "64px",
          height: "64px",
          borderRadius: "50%",
          background: "rgba(239,68,68,0.1)",
          border: "0.5px solid rgba(239,68,68,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "28px"
        }}>
          ✕
        </div>
        <h2 style={{
          color: "white",
          fontSize: "20px",
          fontWeight: 700,
          margin: 0,
          textAlign: "center"
        }}>
          Payment Not Completed
        </h2>
        <p style={{
          color: "rgba(255,255,255,0.4)",
          fontSize: "14px",
          margin: 0,
          textAlign: "center",
          lineHeight: 1.6
        }}>
          Your payment was cancelled or did not complete.
          No charge was made to your account.
        </p>
        <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
          <button
            onClick={() => navigate("/portfolio/new")}
            style={{
              background: "#EF4444",
              color: "white",
              border: "none",
              borderRadius: "12px",
              padding: "12px 24px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Try Again
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            style={{
              background: "transparent",
              color: "rgba(255,255,255,0.4)",
              border: "0.5px solid rgba(255,255,255,0.1)",
              borderRadius: "12px",
              padding: "12px 24px",
              fontSize: "13px",
              cursor: "pointer"
            }}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return null
}
