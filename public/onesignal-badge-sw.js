// Service Worker snippet to handle PWA home screen icon badging
// This script is imported within the generated PWA service worker alongside OneSignal.

const DB_NAME = 'plugsy-badge-db';
const STORE_NAME = 'badge-store';
const KEY_NAME = 'unread-count';

function getUnreadCount() {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (event) => {
        const db = event.target.result;
        try {
          const transaction = db.transaction(STORE_NAME, 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const getReq = store.get(KEY_NAME);
          getReq.onsuccess = () => {
            resolve(getReq.result || 0);
          };
          getReq.onerror = () => resolve(0);
        } catch (e) {
          resolve(0);
        }
      };
      request.onerror = () => resolve(0);
    } catch (e) {
      resolve(0);
    }
  });
}

function setUnreadCount(count) {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (event) => {
        const db = event.target.result;
        try {
          const transaction = db.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          const putReq = store.put(count, KEY_NAME);
          putReq.onsuccess = () => resolve(true);
          putReq.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      };
      request.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

// 1. Listen for push events to increment badge count on installed PWA icon
self.addEventListener('push', (event) => {
  event.waitUntil(
    getUnreadCount()
      .then((currentCount) => {
        const newCount = currentCount + 1;
        return setUnreadCount(newCount).then(() => newCount);
      })
      .then((newCount) => {
        // A. Call Badging API if supported
        const promises = [];
        if ('setAppBadge' in navigator) {
          promises.push(navigator.setAppBadge(newCount).catch((err) => {
            console.error('[SW Badge] Error calling setAppBadge:', err);
          }));
        }

        // B. Requirement 3: Show badge count in the notification itself too
        // We use a deduplicating tag to replace the counter notice smoothly
        const title = `🔔 Unread Alerts (${newCount})`;
        const body = `You have ${newCount} unread message${newCount > 1 ? 's' : ''} on Plugsy.`;
        promises.push(
          self.registration.showNotification(title, {
            body: body,
            tag: 'plugsy-badge-notification',
            badge: 'https://res.cloudinary.com/doit6oaze/image/upload/v1783666216/icon-192_gxuh39.png',
            icon: 'https://res.cloudinary.com/doit6oaze/image/upload/v1783666216/icon-192_gxuh39.png',
            renotify: true
          })
        );

        // Broadcast to all open clients/tabs so they can update titles or state dynamically
        if (self.clients && typeof self.clients.matchAll === 'function') {
          promises.push(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true })
              .then((clients) => {
                if (clients && Array.isArray(clients)) {
                  clients.forEach((client) => {
                    client.postMessage({ type: 'NEW_UNREAD_COUNT', count: newCount });
                  });
                }
              })
              .catch((err) => console.error('[SW Badge] Error broadcasting count:', err))
          );
        }

        return Promise.all(promises);
      })
      .catch((err) => {
        console.error('[SW Badge] Error during push badging operations:', err);
      })
  );
});

// 2. Listen for custom messages from client PWA to manage/clear the badge
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_BADGE') {
    const promises = [setUnreadCount(0)];
    
    if ('clearAppBadge' in navigator) {
      promises.push(navigator.clearAppBadge().catch((err) => {
        console.error('[SW Badge] Error calling clearAppBadge:', err);
      }));
    }

    // Try to dismiss the current unread counter notification if it exists
    if ('getNotifications' in self.registration) {
      promises.push(
        self.registration.getNotifications({ tag: 'plugsy-badge-notification' })
          .then((notifications) => {
            notifications.forEach(notification => notification.close());
          })
      );
    }

    event.waitUntil(
      Promise.all(promises).catch((err) => {
        console.error('[SW Badge] Error clearing unread app icon badge info:', err);
      })
    );
  }
});
