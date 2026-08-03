/** @param {any} options */
export function createMedalSalesRefreshCoordinator(options) {
  const {
    fetchSales,
    onConfirmed,
    isVisible = () => true,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    addWindowListener = () => {},
    removeWindowListener = () => {},
    addDocumentListener = () => {},
    removeDocumentListener = () => {},
    intervalMs = 10000,
  } = options;
  let sequence = 0;
  let inFlight = false;
  let controller = null;
  let interval = null;
  const refresh = async (force = false) => {
    if (!force && !isVisible()) return;
    if (inFlight) return;
    inFlight = true;
    const current = ++sequence;
    controller?.abort();
    controller = new AbortController();
    try {
      const totalSold = await fetchSales(controller.signal);
      if (current === sequence && Number.isSafeInteger(totalSold) && totalSold >= 0) onConfirmed(totalSold);
    } catch {
      // Preserve the last confirmed value and retry on the next trigger.
    } finally {
      if (current === sequence) inFlight = false;
    }
  };
  const onFocus = () => void refresh();
  const onVisibility = () => { if (isVisible()) void refresh(); };
  return {
    refresh,
    start() {
      void refresh(true);
      interval = setIntervalFn(() => void refresh(), intervalMs);
      addWindowListener("focus", onFocus);
      addDocumentListener("visibilitychange", onVisibility);
    },
    stop() {
      if (interval !== null) clearIntervalFn(interval);
      removeWindowListener("focus", onFocus);
      removeDocumentListener("visibilitychange", onVisibility);
      sequence += 1;
      controller?.abort();
      controller = null;
      inFlight = false;
    },
  };
}
