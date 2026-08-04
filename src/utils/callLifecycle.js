/** @param {{id?: string}|null|undefined} call @param {{getToken: () => Promise<string|null>, fetchImpl?: typeof fetch}} options */
export async function endPersistedCall(call, { getToken, fetchImpl = fetch }) {
  if (!call?.id) return { ok: false, code: "CALL_NOT_ACTIVE" };
  const token = await getToken();
  if (!token) return { ok: false, code: "AUTH_REQUIRED" };
  try {
    const response = await fetchImpl("/api/calls?action=end-call", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ callId: call.id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) return { ok: false, code: String(data.code || "CALL_END_FAILED") };
    return { ok: true, code: "OK" };
  } catch {
    return { ok: false, code: "CALL_END_FAILED" };
  }
}
