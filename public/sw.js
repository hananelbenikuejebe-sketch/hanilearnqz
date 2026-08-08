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

/* ------------------------------------------------------------------ *
 * Offline support.
 *
 * This worker is registered for Web Push, so it is also the only worker
 * that can control this scope — the offline cache lives here rather than in a
 * second generated worker that would fight it for control.
 *
 * Caching is disabled entirely inside Lovable previews/iframes so editing
 * never serves stale HTML or deleted chunks.
 * ------------------------------------------------------------------ */
const OFFLINE_CACHE = "hlqz-offline-v1";
const OFFLINE_URL = "/";

function cachingEnabled() {
  const h = self.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return false;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return false;
  if (h.endsWith(".lovableproject.com") || h.endsWith(".lovableproject-dev.com")) return false;
  if (h.endsWith(".beta.lovable.dev")) return false;
  return true;
}

self.addEventListener("install", (event) => {
  if (!cachingEnabled()) return;
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/manifest.webmanifest", "/icon-192.png"]).catch(() => undefined)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("hlqz-offline-") && k !== OFFLINE_CACHE).map((k) => caches.delete(k)))),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !cachingEnabled()) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API/server-function traffic — it is user-specific and mutable.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn")) return;

  // HTML navigations: network first, cached shell as the offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(OFFLINE_CACHE).then((c) => c.put(OFFLINE_URL, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(OFFLINE_URL).then((shell) => shell || new Response("Offline", { status: 503 })))),
    );
    return;
  }

  // Hashed build assets and images: cache first, they are immutable.
  if (/\.(js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(OFFLINE_CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          return res;
        }),
      ),
    );
  }
});
