/* global workbox */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// RELIABILITY: Ensure Workbox logs stay quiet in production to avoid noise.
workbox.setConfig({ debug: false });

const CACHE_VERSION = 'date-night-pwa-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png'
];

// RELIABILITY: Provide a canonical cache namespace so old caches can be purged safely.
workbox.core.setCacheNameDetails({
  prefix: 'date-night',
  suffix: CACHE_VERSION,
  precache: 'precache',
  runtime: 'runtime'
});

// RELIABILITY: Precache shell assets to guarantee offline bootstrap.
workbox.precaching.precacheAndRoute(
  CORE_ASSETS.map(url => ({ url, revision: null })),
  {
    // Ignore URL params that typically bust caches in SPA navigations.
    ignoreURLParametersMatching: [/^utm_/, /^fbclid$/]
  }
);

// RELIABILITY: Clean up any stale caches left behind from older service workers.
workbox.precaching.cleanupOutdatedCaches();

workbox.core.skipWaiting();
workbox.core.clientsClaim();

// RELIABILITY: Cache navigation requests with a network-first strategy and offline fallback.
const navigationHandler = new workbox.strategies.NetworkFirst({
  cacheName: workbox.core.cacheNames.precache,
  plugins: [
    new workbox.expiration.ExpirationPlugin({ maxEntries: 20 })
  ]
});

workbox.routing.registerRoute(
  ({ request }) => request.mode === 'navigate',
  async ({ event }) => {
    try {
      return await navigationHandler.handle({ event });
    } catch (error) {
      const fallback = await workbox.precaching.matchPrecache('/index.html');
      if (fallback) {
        return fallback;
      }
      return Response.error();
    }
  }
);

// RELIABILITY: Use stale-while-revalidate for styles and scripts to balance speed and freshness.
workbox.routing.registerRoute(
  ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: `${workbox.core.cacheNames.runtime}-assets`,
    plugins: [
      new workbox.expiration.ExpirationPlugin({ maxEntries: 40, purgeOnQuotaError: true })
    ]
  })
);

// RELIABILITY: Fonts benefit from CacheFirst due to infrequent updates.
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'font',
  new workbox.strategies.CacheFirst({
    cacheName: `${workbox.core.cacheNames.runtime}-fonts`,
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      new workbox.expiration.ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 })
    ]
  })
);

// RELIABILITY: Images can use a CacheFirst strategy with sensible limits.
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'image',
  new workbox.strategies.CacheFirst({
    cacheName: `${workbox.core.cacheNames.runtime}-images`,
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      new workbox.expiration.ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })
    ]
  })
);

self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    // RELIABILITY: Skip waiting as soon as an update is acknowledged by the client.
    self.skipWaiting();
  }

  if (event.data.type === 'CACHE_URLS' && Array.isArray(event.data.payload)) {
    // RELIABILITY: Allow manual warm-up of arbitrary URLs for smoother offline use.
    const urls = event.data.payload.filter(Boolean);
    event.waitUntil(caches.open(workbox.core.cacheNames.runtime).then(cache => cache.addAll(urls)));
  }
});

self.addEventListener('activate', event => {
  // RELIABILITY: Proactively clear caches that do not match the current naming scheme.
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(cacheName => cacheName.startsWith('date-night-') && !cacheName.includes(CACHE_VERSION))
          .map(cacheName => caches.delete(cacheName))
      )
    )
  );
});

// RELIABILITY: background-sync foundation
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
