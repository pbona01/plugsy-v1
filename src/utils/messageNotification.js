/** @param {string} messageId @param {{getToken?: () => Promise<string|null>, fetchImpl?: typeof fetch}} options */
export async function notifyPersistedMessage(messageId, { getToken, fetchImpl = fetch } = {}) {
  if (!messageId || typeof getToken !== "function") return false;
  try {
    const token = await getToken();
    if (!token) return false;
    const response = await fetchImpl("/api/notifications?action=notify-message", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messageId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
