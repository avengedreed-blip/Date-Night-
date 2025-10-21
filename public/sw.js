// RELIABILITY: simple offline cache; avoids blocked Workbox import
const APP_VERSION = '1.3.0';
const CACHE_VERSION = `pulse-shell-${APP_VERSION}`;
// RELIABILITY: Removed /favicon.ico to prevent install rejection on missing asset
const CORE_ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];
self.__ASSET_MANIFEST = Array.isArray(self.__ASSET_MANIFEST) ? self.__ASSET_MANIFEST : []; // [Fix PWA-02]
const PRECACHE_ASSETS = [...new Set([...CORE_ASSETS, ...self.__ASSET_MANIFEST])]; // [Fix PWA-02]
let skipWaitingRequested = false; // [Fix PWA-04]

self.addEventListener('install', (event) => {
  // RELIABILITY: pre-cache core shell assets for offline bootstrap.
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(PRECACHE_ASSETS).catch(err => {
        // RELIABILITY: log but do not reject install when optional asset is missing.
        console.warn('[Reliability] Cache preload failed:', err);
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // RELIABILITY: drop legacy caches so new revisions take effect immediately.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_VERSION ? caches.delete(k) : Promise.resolve())))
    )
  );
  self.clients.claim();
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

  if (event.data.type === 'CACHE_URLS' && Array.isArray(event.data.payload)) {
    // RELIABILITY: allow manual warmup of assets requested by the client.
    const urls = event.data.payload
      .map((url) => {
        try {
          const normalized = new URL(url, self.location.origin);
          return normalized.pathname + normalized.search;
        } catch {
          return url;
        }
      })
      .filter(Boolean);
    self.__ASSET_MANIFEST = Array.from(new Set([...self.__ASSET_MANIFEST, ...urls])); // [Fix PWA-02]
    event.waitUntil(
      caches.open(CACHE_VERSION).then((cache) => cache.addAll(urls).catch((err) => {
        console.warn('[Reliability] Failed to warm asset cache:', err);
      }))
    );
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

  const isDocOrJs =
    request.destination === 'document' || url.endsWith('.js');

  if (isDocOrJs) {
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
          const cached = await caches.match(request) || await caches.match('/index.html'); // [Fix F2] Provide offline document fallback
          if (cached) {
            return cached;
          }
          return new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } }); // [Fix F2] Serve minimal offline shell
        }
      })()
    );
  } else {
    event.respondWith(
      (async () => {
        try {
          const cached = await caches.match(request);
          if (cached) return cached;
          return await fetch(request);
        } catch (err) {
          console.warn('[Reliability] SW fetch failed (non-critical):', url, err);
          const cachedFallback = await caches.match(request) || await caches.match('/index.html'); // [Fix H3]
          if (cachedFallback) {
            return cachedFallback; // [Fix H3]
          }
          return new Response('Service Unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } }); // [Fix PWA-01]
        }
      })()
    );
  }
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
