
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  // Show notification
  const title = data.title || 'New Message';
  const options = {
    body: data.body || 'You have a new message',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  };
  event.waitUntil(self.registration.showNotification(title, options));

  // Send message to the main thread to update the badge
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'UPDATE_BADGE',
        count: data.unreadCount || 1, // Assume server sends this
      });
    });
  });
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_BADGE') {
    // This is not directly possible from SW,
    // we have to do it from the main thread.
    // The main thread will call navigator.setAppBadge(event.data.count)
  }
});
