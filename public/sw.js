// Minimal service worker to enable Web Push for HaniLearn-QZ.
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Notification", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "HaniLearn-QZ";
  const options = {
    body: data.body || "",
    icon: data.image_url || "/favicon.ico",
    data: { link: data.link || "/notifications" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) { client.navigate(link); return client.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    }),
  );
});
