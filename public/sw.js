// Service worker: handles Web Push delivery + click-through for HaniLearn-QZ.
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Notification", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "HaniLearn-QZ";
  const link = data.link || data.url || "/notifications";
  const options = {
    body: data.body || "",
    icon: data.icon || data.image_url || "/icon-192.png",
    badge: "/icon-192.png",
    image: data.image_url || undefined,
    // Makes Android actually vibrate + ring like a real push instead of a silent tray entry.
    vibrate: [200, 100, 200],
    renotify: true,
    requireInteraction: false,
    // Stable tag per notification "kind" so repeated broadcasts stack/replace sanely
    // instead of one silently overwriting another with the same tag by accident.
    tag: data.tag || data.kind || "hlqz-notification",
    data: { url: link },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) { try { client.navigate(link); } catch { /* noop */ } }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    }),
  );
});
