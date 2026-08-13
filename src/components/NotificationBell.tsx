import { useEffect, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import toast from "react-hot-toast";
import { isSubscribed, requestNotificationPermission, getOneSignalState, initOneSignal } from "@/utils/onesignal";

const withEnableTimeout = async <T,>(operation: Promise<T>, timeoutMs = 15_000): Promise<T> => {
  let timer: number | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("PUSH_ENABLE_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
};

export default function NotificationBell() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [sdkState, setSdkState] = useState("loading");
  const [registrationWarning, setRegistrationWarning] = useState(false);
  const generation = useRef(0);
  const enableAttempt = useRef(0);
  const disposed = useRef(false);

  const refresh = async () => {
    if (!user) return;
    const currentGeneration = ++generation.current;
    const resolved = await initOneSignal();
    if (disposed.current || currentGeneration !== generation.current) return;
    setSdkState(resolved);
    if (resolved === "unsupported") { setVisible(true); return; }
    if (await isSubscribed()) {
      const token = await getToken().catch(() => null);
      const response = await fetch("/api/notifications?action=subscription-status", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => null);
      const status = response?.ok ? await response.json().catch(() => null) : null;
      if (disposed.current || currentGeneration !== generation.current) return;
      const needsRepair = status?.registered !== true;
      setRegistrationWarning(needsRepair);
      setVisible(needsRepair);
      return;
    }
    if (disposed.current || currentGeneration !== generation.current) return;
    setBlocked(typeof Notification !== "undefined" && Notification.permission === "denied");
    setVisible(!localStorage.getItem("notif_dismissed_onesignal"));
  };
  useEffect(() => { disposed.current = false; generation.current += 1; enableAttempt.current += 1; setLoading(false); setRegistrationWarning(false); setBlocked(false); setSdkState("loading"); setVisible(false); refresh(); const handler = () => refresh(); window.addEventListener("onesignal_subscribed_state_changed", handler); return () => { disposed.current = true; generation.current += 1; enableAttempt.current += 1; window.removeEventListener("onesignal_subscribed_state_changed", handler); }; }, [user?.id]);

  const enable = async () => {
    if (!user || loading) return;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    if (isIOS && !standalone) { toast.error("Add Plugsy to your Home Screen before enabling alerts on iOS."); return; }
    const currentAttempt = ++enableAttempt.current;
    const userId = user.id;
    setLoading(true);
    try {
      const result = await withEnableTimeout(requestNotificationPermission(userId, getToken));
      if (disposed.current || currentAttempt !== enableAttempt.current || !user) return;
      if (result.active) { setRegistrationWarning(!result.registered); setVisible(!result.registered); toast.success(result.registered ? "Notifications enabled." : "Notifications active; account registration needs repair."); }
      else if (typeof Notification !== "undefined" && Notification.permission === "denied") { setBlocked(true); toast.error("Notifications are blocked. Change the browser site setting to enable them."); }
      else if (getOneSignalState() === "unsupported") toast.error("This browser or device does not support web push alerts.");
      else if (getOneSignalState() === "failed") toast.error("Alerts could not be initialized. Please try again later.");
      else toast.error(result.code === "AUTH_REQUIRED" ? "Your session expired. Sign in again to enable alerts." : "No active push subscription was confirmed. Try Repair Alerts.");
    } catch (error: any) {
      if (!disposed.current && currentAttempt === enableAttempt.current) {
        toast.error(error?.message === "PUSH_ENABLE_TIMEOUT" ? "Alert setup timed out. Please try Repair Alerts again." : "Your session could not be verified. Sign in again to enable alerts.");
      }
    } finally {
      if (!disposed.current && currentAttempt === enableAttempt.current) setLoading(false);
    }
  };
  if (!user || !visible) return null;
  return <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 360, background: "#111", border: "1px solid #333", borderRadius: 16, padding: 16, zIndex: 9999 }}>
    <strong style={{ color: "white" }}>{sdkState === "unsupported" ? "Alerts unavailable" : blocked ? "Alerts are blocked" : registrationWarning ? "Alerts need repair" : sdkState === "loading" ? "Initializing alerts" : sdkState === "failed" ? "Repair Alerts" : "Stay in the Loop"}</strong>
    <p style={{ color: "#aaa", fontSize: 12 }}>{sdkState === "unsupported" ? "This browser or device cannot receive web push alerts." : blocked ? "Change your browser/site notification setting, then return here." : registrationWarning ? "Push is active, but secure account registration did not finish." : sdkState === "loading" ? "Preparing secure browser notifications." : "Enable reliable alerts for important Plugsy activity."}</p>
    <button onClick={enable} disabled={loading || blocked || sdkState === "loading" || sdkState === "unsupported"} style={{ width: "100%", padding: 10, background: blocked || sdkState === "unsupported" ? "#444" : "#ef4444", color: "white", border: 0, borderRadius: 10 }}>{loading ? "Enabling..." : blocked ? "Alerts Blocked" : sdkState === "unsupported" ? "Unavailable" : sdkState === "failed" || registrationWarning ? "Repair Alerts" : "Enable Alerts"}</button>
    <button onClick={() => { setVisible(false); localStorage.setItem("notif_dismissed_onesignal", "true"); }} style={{ width: "100%", marginTop: 8, padding: 8, background: "transparent", color: "#888", border: 0 }}>Later</button>
  </div>;
}
