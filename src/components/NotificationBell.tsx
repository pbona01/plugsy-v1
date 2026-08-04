import { useEffect, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import toast from "react-hot-toast";
import { isSubscribed, requestNotificationPermission, getOneSignalState } from "@/utils/onesignal";

export default function NotificationBell() {
  const { user } = useUser();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const refresh = async () => {
    if (!user) return;
    if (await isSubscribed()) { setVisible(false); return; }
    setBlocked(typeof Notification !== "undefined" && Notification.permission === "denied");
    setVisible(!localStorage.getItem("notif_dismissed_onesignal"));
  };
  useEffect(() => { refresh(); const handler = () => refresh(); window.addEventListener("onesignal_subscribed_state_changed", handler); return () => window.removeEventListener("onesignal_subscribed_state_changed", handler); }, [user?.id]);

  const enable = async () => {
    if (!user || loading) return;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    if (isIOS && !standalone) { toast.error("Add Plugsy to your Home Screen before enabling alerts on iOS."); return; }
    setLoading(true);
    const ok = await requestNotificationPermission(user.id);
    setLoading(false);
    if (ok) { setVisible(false); toast.success("Notifications enabled."); }
    else if (typeof Notification !== "undefined" && Notification.permission === "denied") { setBlocked(true); toast.error("Notifications are blocked. Change the browser site setting to enable them."); }
    else if (getOneSignalState() === "failed") toast.error("Alerts could not be initialized. Please try again later.");
    else toast.error("No active push subscription was confirmed. Try Repair Alerts.");
  };
  if (!user || !visible) return null;
  return <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 360, background: "#111", border: "1px solid #333", borderRadius: 16, padding: 16, zIndex: 9999 }}>
    <strong style={{ color: "white" }}>{blocked ? "Alerts are blocked" : "Stay in the Loop"}</strong>
    <p style={{ color: "#aaa", fontSize: 12 }}>{blocked ? "Change your browser/site notification setting, then return here." : "Enable reliable alerts for important Plugsy activity."}</p>
    <button onClick={enable} disabled={loading || blocked} style={{ width: "100%", padding: 10, background: blocked ? "#444" : "#ef4444", color: "white", border: 0, borderRadius: 10 }}>{loading ? "Enabling..." : blocked ? "Alerts Blocked" : "Enable Alerts"}</button>
    <button onClick={() => { setVisible(false); localStorage.setItem("notif_dismissed_onesignal", "true"); }} style={{ width: "100%", marginTop: 8, padding: 8, background: "transparent", color: "#888", border: 0 }}>Later</button>
  </div>;
}
