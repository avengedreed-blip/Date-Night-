// RELIABILITY: simple offline cache; avoids blocked Workbox import
const CACHE_VERSION = 'v1.1.0';
const CORE_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.ico', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  // RELIABILITY: pre-cache core shell assets for offline bootstrap.
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // RELIABILITY: use network-first for documents and scripts to keep app fresh.
  if (request.destination === 'document' || request.url.endsWith('.js')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // RELIABILITY: default to cache-first for static assets to ensure offline support.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
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
