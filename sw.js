const CACHE_NAME = "dudas-agenda-v31";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/app.css?v=25",
  "./assets/js/app.js",
  "./assets/js/auth.js",
  "./assets/js/storage.js",
  "./assets/js/tasks.js",
  "./assets/js/schedule.js",
  "./assets/js/reminders.js",
  "./assets/js/alarms.js",
  "./assets/js/theme.js",
  "./assets/js/profile.js",
  "./assets/js/ui.js",
  "./assets/js/pwa.js",
  "./assets/img/avatar-logo.svg",
  "./assets/audio/pandora-theme.mp3",
  "./fonts/Strong.ttf",
  "./fonts/TorukscRegular-z8MA1.ttf",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
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
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = event.request.mode === "navigate";

  if (isSameOrigin && url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }
  const isSourceAsset =
    isSameOrigin &&
    (
      url.pathname.endsWith("/index.html") ||
      url.pathname.endsWith("/assets/css/app.css") ||
      url.pathname.startsWith("/assets/js/") ||
      url.pathname.endsWith("/manifest.webmanifest")
    );

  if (isSourceAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (isSameOrigin && response.status === 200 && response.type === "basic") {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!isSameOrigin || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (isNavigation) {
            return caches.match("./index.html");
          }
          return Response.error();
        })
      )
  );
});
