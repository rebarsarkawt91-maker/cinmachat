/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkOnly, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { buildPushNotificationOptions, resolveSafeNotificationUrl } from "./lib/webPushShared";

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navigation is always network-only: every deploy emits brand-new content-
// hashed assets, so a cached copy of a previous index.html would reference
// URLs that cleanupOutdatedCaches has already deleted from this new precache —
// the classic "stale HTML, missing hashed JS" blank page. A real network
// failure instead falls back to the freshly precached app shell (the active
// SW's own version, never an old one), then to the small Sorani offline page.
registerRoute(
  ({ request, url }) =>
    request.mode === "navigate" &&
    !url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/uploads/"),
  new NetworkOnly({
    plugins: [
      {
        handlerDidError: async () =>
          (await caches.match("/index.html")) || caches.match("/offline.html") || Response.error(),
      },
    ],
  }),
);

// Backstop: live API responses (reels, streams, chat, auth, progress...) are
// per-user/live data and must never touch any cache. No API route is registered
// above; this makes that guarantee explicit and future-proof.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith("/api/"),
  new NetworkOnly(),
);

// Posters and UI images are safe to cache. API/auth/chat/video traffic and
// WebSockets have no route here and therefore always remain network-only.
registerRoute(
  ({ request, url }) => request.destination === "image" && !url.pathname.startsWith("/api/"),
  new StaleWhileRevalidate({
    cacheName: "cinemachat-images",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  }),
);

// The client's silent-update flow posts SKIP_WAITING the moment it is safe to
// reload (no live media/room state), so the newest SW activates without any
// user prompt; pages elsewhere converge on the following navigation.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

// On activation, purge the legacy HTML cache (the old NetworkFirst route could
// leave a 24h-old index.html that referenced deleted hashed assets) and take
// control of already-open tabs so every client runs the same SW version.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      for (const key of keys) {
        if (key.startsWith("cinemachat-pages")) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// --- Web Push notifications ---
// The server sends one JSON payload per subscription:
// { title, body, url?, tag? }. The payload is attacker-controllable, so every
// string is resanitized and the click target is re-resolved to a same-origin URL.

self.addEventListener("push", (event) => {
  let payload: unknown = {};
  if (event.data) {
    try {
      // web-push delivers a JSON string; `.json()` mirrors the client format.
      payload = event.data.json();
    } catch {
      // Non-JSON payloads are treated as a plain-text body fallback.
      let text = "";
      try {
        text = event.data.text();
      } catch {
        text = "";
      }
      payload = { body: text };
    }
  }
  const notification = buildPushNotificationOptions(payload);
  event.waitUntil(self.registration.showNotification(notification.title, notification.options));
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const action = event.action;
  notification.close();
  const fallbackUrl = notification.data?.fallbackUrl;
  const target = resolveSafeNotificationUrl(fallbackUrl, self.location.origin);
  const origin = self.location.origin;

  event.waitUntil(
    (async () => {
      if (action === "close") return;
      try {
        const windowClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        if (action === "open" || !action) {
          const safeTarget =
            target.startsWith("http") && target.startsWith(origin) ? target : origin + "/";
          if (windowClients.length > 0) {
            const client = windowClients[0];
            await client.navigate(safeTarget);
            if ("focus" in client) await client.focus();
          } else {
            await self.clients.openWindow(safeTarget);
          }
        } else if (windowClients.length > 0 && "focus" in windowClients[0]) {
          await windowClients[0].focus();
        }
      } catch {
        // Notification interaction must never throw into the global scope.
      }
    })(),
  );
});
