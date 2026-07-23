import { useState, useEffect } from "react"
import { useUser } from "@clerk/clerk-react"
import { supabase } from "@/lib/supabase"
import toast from "react-hot-toast"
import {
  getOneSignalPlayerId,
  requestOneSignalPermission,
  checkOneSignalSubscribed
} from "@/lib/oneSignal"

export default function NotificationBell() {
  const { user } = useUser()
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const [subscribed, setSubscribed] = useState(() => {
    if (typeof window !== "undefined") {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        localStorage.setItem("onesignal_subscribed", "true");
        return true;
      }
      return localStorage.getItem("onesignal_subscribed") === "true";
    }
    return false;
  })

  useEffect(() => {
    const handleStateChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.subscribed) {
        setSubscribed(true);
        setShow(false);
      }
    };
    window.addEventListener("onesignal_subscribed_state_changed", handleStateChange);
    return () => {
      window.removeEventListener("onesignal_subscribed_state_changed", handleStateChange);
    };
  }, []);

  useEffect(() => {
    if (!user) return
    if (subscribed) return
    if (localStorage.getItem("notif_dismissed_onesignal")) return

    const checkAndShow = async () => {
      await new Promise(r => setTimeout(r, 3000))
      const already = await checkOneSignalSubscribed()
      if (already) {
        setSubscribed(true)
        localStorage.setItem("onesignal_subscribed", "true")
        return
      }
      
      // Secondary check on permission
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        setSubscribed(true)
        localStorage.setItem("onesignal_subscribed", "true")
        return
      }
      setShow(true)
    }

    checkAndShow()
  }, [user, subscribed])

  const handleEnable = async () => {
    if (!user) return

    // iOS Safari standalone check
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandaloneMode = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;

    if (isIOS && !isStandaloneMode) {
      toast.error(
        "iOS requires you to Add Plugsy to your Home Screen first! Tap the 'Share' button in Safari, then select 'Add to Home Screen'.",
        { duration: 6000 }
      );
      return;
    }

    setLoading(true)
    console.log("[notif] === STARTING SUBSCRIBE FLOW ===")

    try {
      if (!(window as any).OneSignal) {
        console.error("[notif] window.OneSignal is undefined — SDK not loaded")
        setLoading(false)
        return
      }

      const OneSignal = (window as any).OneSignal;

      console.log("[notif] requesting push permission...")
      await OneSignal.Notifications.requestPermission()

      // Wait for subscription to be created
      await new Promise(r => setTimeout(r, 3000))

      let playerId = null

      // Try NEW SDK API first (OneSignal v16+)
      if (OneSignal.User?.PushSubscription?.id) {
        playerId = OneSignal.User.PushSubscription.id
        console.log("[notif] got player ID via User.PushSubscription.id:", playerId)
      }
      
      // Fallback to OLD API in case SDK version differs
      if (!playerId && typeof OneSignal.getUserId === "function") {
        playerId = await OneSignal.getUserId()
        console.log("[notif] got player ID via getUserId():", playerId)
      }

      if (!playerId) {
        console.error("[notif] STILL NO PLAYER ID after all methods tried")
        toast.error("Failed to get OneSignal ID. Please try again.")
        setLoading(false)
        return
      }

      console.log("[notif] ✅ FINAL PLAYER ID:", playerId)

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("clerk_id", user.id)
        .single()

      const userRole = profile?.role || "user"

      // Save to our own Supabase table (for per-user targeting)
      const { error: saveError } = await supabase
        .from("push_subscriptions")
        .upsert({
          user_id: user.id,
          user_role: userRole,
          onesignal_player_id: playerId,
          subscription: { playerId },
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" })

      console.log("[notif] Supabase save error:", saveError)

      if (saveError) {
        console.error("[notif] ❌ FAILED TO SAVE TO SUPABASE:", saveError.message)
      } else {
        console.log("[notif] ✅ saved to Supabase push_subscriptions")
      }

      // ALSO set OneSignal external user ID + tags so
      // segment-based targeting works even if our own
      // DB sync ever breaks again
      try {
        if (typeof OneSignal.login === "function") {
          await OneSignal.login(user.id)
          console.log("[notif] ✅ OneSignal external ID set:", user.id)
        } else if (typeof OneSignal.setExternalUserId === "function") {
          await OneSignal.setExternalUserId(user.id)
          console.log("[notif] ✅ OneSignal external ID set (old API):", user.id)
        }

        if (OneSignal.User?.addTag) {
          await OneSignal.User.addTag("user_role", userRole)
          console.log("[notif] ✅ tag set: user_role =", userRole)
        } else if (typeof OneSignal.sendTag === "function") {
          await OneSignal.sendTag("user_role", userRole)
          console.log("[notif] ✅ tag set (old API): user_role =", userRole)
        }
      } catch (tagError: any) {
        console.error("[notif] tag/external-id error:", tagError.message)
      }

      localStorage.setItem("onesignal_subscribed", "true")
      setSubscribed(true)
      setShow(false)
      toast.success("Notifications enabled successfully! 🔔")

      // Send confirmation via our normal per-user send
      await fetch("/api/notifications?action=send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          title: "🔔 Notifications Enabled!",
          body: "You will get instant alerts on Plugsy.",
          url: "/dashboard",
          tag: "welcome"
        })
      }).catch(err => console.warn("Welcome notification failed", err))

    } catch (e: any) {
      console.error("[notif] ❌ CRASH:", e.message, e)
      toast.error("An error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (!user || subscribed || !show) return null

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
      <div style={{
        display: "flex",
        gap: "12px",
        alignItems: "flex-start"
      }}>
        <div style={{
          width: "44px",
          height: "44px",
          background: "rgba(239,68,68,0.12)",
          border: "0.5px solid rgba(239,68,68,0.25)",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "22px",
          flexShrink: 0
        }}>
          🔔
        </div>
        <div style={{ flex: 1 }}>
          <p style={{
            color: "white",
            fontSize: "14px",
            fontWeight: 700,
            margin: "0 0 3px"
          }}>
            Stay in the Loop
          </p>
          <p style={{
            color: "rgba(255,255,255,0.4)",
            fontSize: "12px",
            lineHeight: 1.5,
            margin: "0 0 12px"
          }}>
            Get instant alerts when your CapCut login
            is ready or clients react to your portfolio.
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleEnable}
              disabled={loading}
              style={{
                flex: 1,
                background: "#EF4444",
                color: "white",
                border: "none",
                borderRadius: "10px",
                padding: "10px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? "Enabling..." : "Enable Alerts"}
            </button>
            <button
              onClick={() => {
                setShow(false)
                localStorage.setItem(
                  "notif_dismissed_onesignal", "true"
                )
              }}
              style={{
                background: "transparent",
                color: "rgba(255,255,255,0.3)",
                border: "0.5px solid rgba(255,255,255,0.1)",
                borderRadius: "10px",
                padding: "10px 14px",
                fontSize: "12px",
                cursor: "pointer"
              }}
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
