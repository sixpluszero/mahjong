/**
 * 中文：PWA Service Worker。
 * 负责预缓存应用外壳资源、激活时清理旧缓存，以及对壳资源使用离线优先策略。
 * EN: PWA service worker.
 * Handles app-shell precaching, old-cache cleanup on activation, and offline-friendly fetch for shell assets.
 */

/** 中文：缓存版本号（变更时可触发旧缓存淘汰）。EN: Cache version key; bump to invalidate previous cache entries. */
const CACHE_NAME = 'mahjong-shell-v2';
/** 中文：应用壳静态资源清单。EN: Static app-shell assets required for first paint/offline boot. */
const APP_SHELL = ['/', '/app.js', '/styles.css', '/manifest.webmanifest'];

/** 中文：安装阶段预拉取壳资源并立即激活新 SW。EN: Install step pre-caches shell assets and asks new SW to activate immediately. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

/** 中文：激活阶段删除旧版本缓存，并接管已打开页面。EN: Activate step removes stale caches and claims existing clients. */
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

/**
 * 中文：仅拦截同源 GET 的壳资源请求：
 * 页面导航优先网络回退缓存；静态资源优先缓存回退网络，并回写成功响应。
 * EN: Intercepts only same-origin GET requests for shell assets:
 * navigations use network-first with cache fallback; assets use cache-first with network fallback and cache refresh.
 */
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
