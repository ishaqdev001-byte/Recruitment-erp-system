/**
 * Kilax Smart Recruit — Service Worker
 *
 * Strategy:
 *   • App shell (HTML, JS, CSS, fonts, branding) → Cache-first, revalidate in background.
 *   • API routes (/api/*)  → Network-only (always fresh, never cached).
 *   • Navigation requests  → Network-first, fall back to cached shell.
 */

const CACHE_NAME = "kilax-recruit-v4";

function networkErrorResponse(request) {
  const isApi = new URL(request.url).pathname.startsWith("/api/");
  return new Response(
    isApi ? JSON.stringify({ error: "The server could not be reached. Check your connection and try again." }) : "The server could not be reached. Check your connection and try again.",
    {
      status: 503,
      headers: {
        "Content-Type": isApi ? "application/json" : "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

// Resources to pre-cache on install (the app shell)
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/branding/kilax-icon.svg",
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Activate immediately without waiting for old tabs to close
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────
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
  // Take control of all open clients immediately
  self.clients.claim();
});

// ─── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // API calls — always network-only, never cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request).catch(() => networkErrorResponse(request)));
    return;
  }

  // Next.js internal routes — network-only
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      fetch(request).then((response) => {
        // Cache static Next.js assets (chunks, CSS) for performance
        if (response.ok && url.pathname.includes("/_next/static/")) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match(request).then((cached) => cached ?? networkErrorResponse(request)))
    );
    return;
  }

  // Navigation requests (page loads / SPA views) — network-first, fall back to shell
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            // Cache the shell response for offline fallback
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/", clone));
          }
          return response;
        })
        .catch(() =>
          // Offline: serve the cached root shell — the SPA handles routing
          caches.match("/").then((cached) => cached ?? networkErrorResponse(request))
        )
    );
    return;
  }

  // Static assets (images, branding, fonts) — cache-first
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => networkErrorResponse(request))
    )
  );
});
