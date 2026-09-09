/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { buildPushNotificationOptions, resolveSafeNotificationUrl } from "./lib/webPushShared";

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navigation always prefers the network. Only a real network/cache failure
// reaches the deliberately small, precached Sorani offline page.
registerRoute(
  ({ request, url }) =>
    request.mode === "navigate" &&
    !url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/uploads/"),
  new NetworkFirst({
    cacheName: "cinemachat-pages",
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 24 * 60 * 60 }),
      { handlerDidError: () => caches.match("/offline.html") },
    ],
  }),
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

// Activation happens only after the React update guard explicitly requests it.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
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
