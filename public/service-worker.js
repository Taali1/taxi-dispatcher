// Service Worker — obsługa Web Push Notifications

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Nowe zlecenie', {
      body: data.body || 'Dotknij by otworzyć aplikację',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
      tag: 'new-order',
      data: { url: data.url || '/driver' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('/driver') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url || '/driver');
      }
    })
  );
});
