import React, { useState } from "react"
import { Megaphone, ArrowLeft } from "lucide-react"
import { Link } from "react-router-dom"

const AdminBroadcast = () => {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [url, setUrl] = useState("/dashboard")
  const [segment, setSegment] = useState<"all" | "user" | "admin">("all")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      setResult("❌ Title and message are required")
      return
    }

    const confirmed = window.confirm(
      "Send this notification to " +
      (segment === "all" ? "everyone" : segment + "s") +
      "?"
    )
    if (!confirmed) return

    setSending(true)
    setResult(null)

    try {
      const action = segment === "all" ? "broadcast-all" : "broadcast-segment"
      const res = await fetch("/api/notifications?action=" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, url, tag: "admin-broadcast", segment })
      })
      const data = await res.json()

      if (data.success) {
        setResult("✅ Notification triggered successfully via OneSignal")
        setTitle("")
        setBody("")
      } else {
        setResult("❌ " + (data.error || "Failed to send"))
      }
    } catch (e: any) {
      setResult("❌ " + e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ padding: "40px 24px", minHeight: "100vh", background: "#050505" }}>
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        <Link 
          to="/admin" 
          style={{ 
            display: "inline-flex", 
            alignItems: "center", 
            gap: "8px", 
            color: "#888", 
            textDecoration: "none", 
            fontSize: "13px", 
            marginBottom: "32px",
            fontWeight: 500
          }}
        >
          <ArrowLeft size={16} /> Back to Admin
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <div style={{ background: "rgba(239,68,68,0.1)", padding: "10px", borderRadius: "12px" }}>
            <Megaphone size={24} color="#EF4444" />
          </div>
          <h2 style={{ color: "white", fontSize: "24px", fontWeight: 800, margin: 0 }}>
            Broadcast Notification
          </h2>
        </div>
        <p style={{ color: "#888", fontSize: "14px", marginBottom: "32px" }}>
          Send an instant push notification via OneSignal segments.
        </p>

        <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: "24px", padding: "24px" }}>
          <div style={{ marginBottom: "20px" }}>
            <label style={{ color: "#555", fontSize: "11px", fontWeight: 700,
              textTransform: "uppercase", display: "block", marginBottom: "8px", letterSpacing: "0.05em" }}>
              Target Audience
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              {[
                { key: "all", label: "Everyone" },
                { key: "user", label: "Users Only" },
                { key: "admin", label: "Admins Only" }
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSegment(opt.key as any)}
                  style={{
                    flex: 1,
                    padding: "12px 8px",
                    background: segment === opt.key ? "rgba(239,68,68,0.1)" : "#111",
                    border: segment === opt.key ? "1px solid #EF4444" : "1px solid #222",
                    borderRadius: "12px",
                    color: segment === opt.key ? "white" : "#888",
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: "11px", color: "#444", marginTop: "8px", fontStyle: "italic" }}>
              Note: "Users Only" and "Admins Only" rely on the user_role tag. "Everyone" targets all subscribers.
            </p>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ color: "#555", fontSize: "11px", fontWeight: 700,
              textTransform: "uppercase", display: "block", marginBottom: "8px", letterSpacing: "0.05em" }}>
              Push Title
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. New feature just dropped!"
              maxLength={65}
              style={{
                width: "100%", background: "#111", border: "1px solid #222",
                borderRadius: "12px", color: "white", padding: "12px 16px",
                fontSize: "14px", outline: "none"
              }}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ color: "#555", fontSize: "11px", fontWeight: 700,
              textTransform: "uppercase", display: "block", marginBottom: "8px", letterSpacing: "0.05em" }}>
              Push Message
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="What do you want to tell them?"
              maxLength={200}
              rows={4}
              style={{
                width: "100%", background: "#111", border: "1px solid #222",
                borderRadius: "12px", color: "white", padding: "12px 16px",
                fontSize: "14px", resize: "none", outline: "none"
              }}
            />
            <p style={{ textAlign: "right", fontSize: "11px", color: "#444", marginTop: "4px" }}>
              {body.length}/200
            </p>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{ color: "#555", fontSize: "11px", fontWeight: 700,
              textTransform: "uppercase", display: "block", marginBottom: "8px", letterSpacing: "0.05em" }}>
              Action URL (Optional)
            </label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="/dashboard"
              style={{
                width: "100%", background: "#111", border: "1px solid #222",
                borderRadius: "12px", color: "white", padding: "12px 16px",
                fontSize: "14px", outline: "none"
              }}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={sending}
            style={{
              width: "100%", background: "#EF4444", color: "white",
              border: "none", borderRadius: "14px", padding: "16px",
              fontSize: "14px", fontWeight: 800, cursor: "pointer",
              opacity: sending ? 0.6 : 1,
              transition: "transform 0.1s active",
              boxShadow: "0 4px 12px rgba(239,68,68,0.2)"
            }}
          >
            {sending ? "Sending..." : "Send Broadcast Now"}
          </button>

          {result && (
            <div style={{
              marginTop: "20px", 
              padding: "12px", 
              borderRadius: "12px", 
              fontSize: "13px", 
              textAlign: "center",
              background: result.startsWith("✅") ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
              color: result.startsWith("✅") ? "#4ade80" : "#f87171",
              border: result.startsWith("✅") ? "1px solid rgba(74,222,128,0.2)" : "1px solid rgba(248,113,113,0.2)"
            }}>
              {result}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminBroadcast
