export const notificationDraftKey = ({ title, body, url, target, mode }) => JSON.stringify([title, body, url, target, mode]);

export function createNotificationOperationCoordinator(uuidFactory = () => crypto.randomUUID()) {
  let key = "";
  let requestKey = "";
  return {
    begin(draft) {
      const next = notificationDraftKey(draft);
      if (next !== key || !requestKey) { key = next; requestKey = uuidFactory(); }
      return requestKey;
    },
    accepted() { requestKey = ""; key = ""; },
    ambiguous() { return requestKey; },
    current() { return requestKey; },
  };
}
