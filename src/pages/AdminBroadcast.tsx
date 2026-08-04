import React, { useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";

const validRoute = (value: string) => {
  if (!value || value.length > 512 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001F\u007F]/.test(value) || /^(?:javascript|data|https?):/i.test(value) || value.includes("@")) return false;
  try { return new URL(value, "https://www.plugsy.ng").origin === "https://www.plugsy.ng"; } catch { return false; }
};
const messages: Record<string, string> = { ONESIGNAL_ACCEPTED: "Accepted by OneSignal", ONESIGNAL_NO_ELIGIBLE_SUBSCRIPTIONS: "No eligible subscribers", ONESIGNAL_CONFIGURATION_UNAVAILABLE: "OneSignal configuration unavailable", ONESIGNAL_AUTH_FAILED: "OneSignal authentication failed", ONESIGNAL_TEMPORARILY_UNAVAILABLE: "Provider temporarily unavailable", ONESIGNAL_REQUEST_REJECTED: "Request rejected" };

export default function AdminBroadcast() {
  const { getToken, userId } = useAuth();
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [url, setUrl] = useState("/dashboard"); const [segment, setSegment] = useState<"all" | "user" | "admin">("all"); const [sending, setSending] = useState(false); const [result, setResult] = useState(""); const controller = useRef<AbortController | null>(null);
  const send = async (test = false) => {
    if (sending || !title.trim() || !body.trim() || !validRoute(url)) { setResult("Title, message, and a valid internal action URL are required."); return; }
    if (!window.confirm(test ? "Send a test notification only to yourself?" : `Send this notification to ${segment === "all" ? "everyone" : `${segment}s`}?`)) return;
    setSending(true); setResult(""); controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    try {
      const token = await getToken();
      if (!token) { setResult("Sign-in is required."); return; }
      const action = test ? "send-test-to-self" : segment === "all" ? "broadcast-all" : "broadcast-segment";
      const response = await fetch(`/api/notifications?action=${action}`, { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ title: title.trim(), body: body.trim(), url, segment, requestKey: crypto.randomUUID() }) });
      const data = await response.json();
      setResult(data.code === "ONESIGNAL_ACCEPTED" ? `${messages[data.code]} (ID: ${data.messageId})` : messages[data.code] || data.error || "Notification could not be accepted.");
      if (data.success) { setTitle(""); setBody(""); }
    } catch (error: any) { if (error?.name !== "AbortError") setResult("Notification request failed."); }
    finally { if (controller.current?.signal === abort.signal) { controller.current = null; setSending(false); } }
  };
  return <main style={{ padding: 40, maxWidth: 600, margin: "auto", color: "white" }}><Link to="/admin">← Back to Admin</Link><h1>Broadcast Notification</h1><p>Send authenticated OneSignal web push notifications.</p><label>Target <select value={segment} onChange={e => setSegment(e.target.value as any)}><option value="all">Everyone</option><option value="user">Users Only</option><option value="admin">Admins Only</option></select></label><br /><label>Title<input value={title} maxLength={65} onChange={e => setTitle(e.target.value)} /></label><br /><label>Message<textarea value={body} maxLength={200} onChange={e => setBody(e.target.value)} /></label><br /><label>Action URL<input value={url} onChange={e => setUrl(e.target.value)} /></label><br /><button disabled={sending} onClick={() => send(false)}>{sending ? "Sending..." : "Send Broadcast"}</button><button disabled={sending || !userId} onClick={() => send(true)}>Send Test to Myself</button>{result && <p role="status">{result}</p>}</main>;
}
