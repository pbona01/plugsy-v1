export function createOwnedRequestCoordinator({ request, onSuccess, onFailure }) {
  let sequence = 0;
  let active = null;
  return {
    start() {
      if (active) return null;
      const current = { sequence: ++sequence, controller: new AbortController() };
      active = current;
      Promise.resolve().then(() => request(current.controller.signal)).then((value) => {
        if (active === current) onSuccess(value);
      }).catch((error) => {
        if (active === current && error?.name !== "AbortError") onFailure(error);
      }).finally(() => {
        if (active === current) active = null;
      });
      return current;
    },
    abort() {
      if (!active) return;
      const current = active;
      active = null;
      sequence += 1;
      current.controller.abort();
    },
    get inFlight() { return Boolean(active); },
  };
}
