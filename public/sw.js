// RELIABILITY: simple offline cache; avoids blocked Workbox import
// [Fix CSSPreload-002] Bump version to invalidate caches holding stale CSS assets
const APP_VERSION = '1.3.1';
const CACHE_VERSION = `pulse-shell-${APP_VERSION}`;
// RELIABILITY: Removed /favicon.ico to prevent install rejection on missing asset
const CORE_ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];
self.__ASSET_MANIFEST = Array.isArray(self.__ASSET_MANIFEST) ? self.__ASSET_MANIFEST : []; // [Fix PWA-02]
const precacheBaseSet = new Set([...CORE_ASSETS, ...self.__ASSET_MANIFEST]); // [Fix SW-002]
const warmRuntimeAssets = new Set(); // [Fix SW-002]
let skipWaitingRequested = false; // [Fix PWA-04]

const resolvePrecacheAssets = () => [...new Set([...precacheBaseSet, ...warmRuntimeAssets])]; // [Fix SW-002]

self.addEventListener('install', (event) => {
  // RELIABILITY: pre-cache core shell assets for offline bootstrap.
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(resolvePrecacheAssets()).catch(err => {
        // RELIABILITY: log but do not reject install when optional asset is missing.
        console.warn('[Reliability] Cache preload failed:', err);
      })
    )
  );
  self.skipWaiting(); // [Fix CSSPreload-003] Ensure new worker activates immediately
});

self.addEventListener('activate', (event) => {
  // RELIABILITY: drop legacy caches so new revisions take effect immediately.
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.map((k) => (k !== CACHE_VERSION ? caches.delete(k) : Promise.resolve())))
      )
      .then(() => {
        console.log('[SW] Cache version updated', CACHE_VERSION); // [Fix CSSPreload-004] Trace cache refresh for audits
      })
  );
  self.clients.claim(); // [Fix CSSPreload-005] Take control of clients after activation
  skipWaitingRequested = false; // [Fix PWA-04]
});

self.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') return;

  if (event.data.type === 'SKIP_WAITING') {
    if (skipWaitingRequested) return; // [Fix PWA-04]
    skipWaitingRequested = true; // [Fix PWA-04]
    // RELIABILITY: activate updated worker as soon as client acknowledges.
    self.skipWaiting();
  }

  const queueWarmUrls = (urls) => { // [Fix SW-002]
    const normalized = (Array.isArray(urls) ? urls : [])
      .map((url) => {
        try {
          const normalizedUrl = new URL(url, self.location.origin);
          return normalizedUrl.pathname + normalizedUrl.search;
        } catch {
          return url;
        }
      })
      .filter(Boolean);
    if (!normalized.length) return;
    normalized.forEach((asset) => {
      warmRuntimeAssets.add(asset);
      precacheBaseSet.add(asset);
    });
    self.__ASSET_MANIFEST = Array.from(new Set([...self.__ASSET_MANIFEST, ...normalized])); // [Fix SW-002]
    event.waitUntil(
      caches.open(CACHE_VERSION).then((cache) => cache.addAll(normalized).catch((err) => {
        console.warn('[Reliability] Failed to warm asset cache:', err);
      }))
    );
  };

  if (event.data.type === 'WARM_URLS') {
    queueWarmUrls(event.data.urls);
  }

  if (event.data.type === 'CACHE_URLS') {
    queueWarmUrls(event.data.payload);
  }
});

// RELIABILITY: hardened fetch handler with analytics ignore + safe fallbacks
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!request || request.method !== 'GET') return;

  // RELIABILITY: safely derive URL string
  const url = typeof request.url === 'string' ? request.url : '';

  if (url && (url.includes('vercel.live') || url.includes('feedback.js'))) {
    // RELIABILITY: skip analytics/live URLs safely
    return;
  }

  const isNavigationRequest = request.mode === 'navigate' || request.destination === 'document';
  const isScriptRequest = request.destination === 'script' || url.endsWith('.js');
  const isStyleRequest = request.destination === 'style' || url.endsWith('.css');

  if (isScriptRequest || isStyleRequest) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, networkResponse.clone()));
            return networkResponse;
          }
        } catch (err) {
          console.warn('[Reliability] SW asset fetch failed:', url, err); // [Fix SW-003]
        }
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(request);
        if (cached) {
          return cached; // [Fix SW-003]
        }
        return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }); // [Fix SW-003]
      })()
    );
    return;
  }

  if (isNavigationRequest) {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(request);
          if (net && net.ok) {
            const copy = net.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return net;
        } catch (err) {
          console.warn('[Reliability] SW fetch failed:', url, err);
          const cached = await caches.match(request) || await caches.match('/index.html');
          if (cached) {
            return cached;
          }
          return new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const cached = await caches.match(request);
        if (cached) return cached;
        const net = await fetch(request);
        if (net && net.ok) {
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, net.clone()));
        }
        return net;
      } catch (err) {
        console.warn('[Reliability] SW fetch failed (non-critical):', url, err);
        const cachedFallback = await caches.match(request);
        if (cachedFallback) {
          return cachedFallback;
        }
        return new Response('Service Unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } }); // [Fix PWA-01]
      }
    })()
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-prompts') {
    event.waitUntil(
      (async () => {
        console.log('[Reliability] Background sync triggered');
        // placeholder for future data flush
      })()
    );
  }
});
