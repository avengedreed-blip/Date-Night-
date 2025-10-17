// RELIABILITY: simple offline cache; avoids blocked Workbox import
const APP_VERSION = '1.3.0';
const CACHE_VERSION = `pulse-shell-${APP_VERSION}`;
// RELIABILITY: Removed /favicon.ico to prevent install rejection on missing asset
const CORE_ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  // RELIABILITY: pre-cache core shell assets for offline bootstrap.
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(CORE_ASSETS).catch(err => {
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
});

self.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') return;

  if (event.data.type === 'SKIP_WAITING') {
    // RELIABILITY: activate updated worker as soon as client acknowledges.
    self.skipWaiting();
  }

  if (event.data.type === 'CACHE_URLS' && Array.isArray(event.data.payload)) {
    // RELIABILITY: allow manual warmup of assets requested by the client.
    const urls = event.data.payload.filter(Boolean);
    event.waitUntil(
      caches.open(CACHE_VERSION).then((cache) => cache.addAll(urls))
    );
  }
});

// RELIABILITY: hardened fetch handler with analytics ignore + safe fallbacks
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = request.url;

  // RELIABILITY: skip analytics/live/feedback URLs entirely
  if (url.includes('vercel.live') || url.includes('feedback.js')) {
    return; // don't intercept
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
          const cached = await caches.match(request);
          // RELIABILITY: graceful fallback response if nothing cached
          return cached || Response.error();
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
          return Response.error();
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
