const DB_NAME = "plugsy-badge-db";
const STORE_NAME = "badge-store";
const KEY_NAME = "unread-count";

function updateCount(value) {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => { const db = event.target.result; if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME); };
    request.onsuccess = () => { const db = request.result; const transaction = db.transaction(STORE_NAME, "readwrite"); const store = transaction.objectStore(STORE_NAME); const get = store.get(KEY_NAME); get.onsuccess = () => { store.put(value(get.result || 0), KEY_NAME); resolve(value(get.result || 0)); }; get.onerror = () => resolve(0); };
    request.onerror = () => resolve(0);
  });
}

self.addEventListener("push", (event) => {
  event.waitUntil(updateCount((count) => count + 1).then((count) => {
    const tasks = [];
    if ("setAppBadge" in navigator) tasks.push(navigator.setAppBadge(count).catch(() => {}));
    if (self.clients?.matchAll) tasks.push(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => clients.forEach((client) => client.postMessage({ type: "NEW_UNREAD_COUNT", count }))));
    return Promise.all(tasks);
  }));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_BADGE") return;
  event.waitUntil(updateCount(() => 0).then(() => "clearAppBadge" in navigator ? navigator.clearAppBadge().catch(() => {}) : undefined));
});
