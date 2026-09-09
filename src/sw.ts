/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

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
