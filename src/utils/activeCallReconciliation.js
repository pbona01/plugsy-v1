export function createActiveCallReconciler({ readStatus, onEnded, intervalMs = 3000, setIntervalImpl = setInterval, clearIntervalImpl = clearInterval }) {
  let currentCallId = "";
  let timer = null;
  let stopped = false;
  const terminal = new Set(["ended", "declined", "missed", "cancelled"]);
  const check = async (callId) => {
    try {
      const status = await readStatus(callId);
      if (!stopped && currentCallId === callId && terminal.has(String(status || "").toLowerCase())) onEnded(callId);
    } catch { /* read failures preserve the active call and retry */ }
  };
  const stop = () => {
    stopped = true;
    currentCallId = "";
    if (timer !== null) clearIntervalImpl(timer);
    timer = null;
  };
  const start = (callId) => {
    stop();
    stopped = false;
    currentCallId = String(callId || "");
    if (!currentCallId) return stop;
    void check(currentCallId);
    timer = setIntervalImpl(() => void check(currentCallId), intervalMs);
    return stop;
  };
  return { start, stop };
}
