const CACHE_NAME = 'mahjong-shell-v2';
const APP_SHELL = ['/', '/app.js', '/styles.css', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names
        .filter((name) => name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  const isShellAsset = APP_SHELL.includes(url.pathname);
  if (!isShellAsset) {
    return;
  }

  const isDocument = request.mode === 'navigate' || url.pathname === '/';

  event.respondWith(
    (isDocument ? fetch(request).catch(() => caches.match(request)) : caches.match(request).then((cached) => cached || fetch(request)))
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        return response;
      })
  );
});
