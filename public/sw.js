/// <reference lib="webworker" />

const CACHE_NAME = "dormy-v1";
const OFFLINE_URL = "/offline";

// Assets to pre-cache for offline support
const PRECACHE_URLS = [
  "/brand/dormy-house.png",
  "/brand/dormy-mark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  // Skip non-http requests
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith("http")) return;

  // Network-first strategy for API/data routes
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) {
    return;
  }

  // Cache-first for static assets
  if (
    url.pathname.startsWith("/brand/") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico")
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) => cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
      )
    );
    return;
  }

  // Network-first for navigation (HTML pages)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached || new Response("Offline", { status: 503 }))
      )
    );
  }
});
