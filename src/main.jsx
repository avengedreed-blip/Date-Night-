// TRACE: module load marker
try { console.log('[INIT]', 'main.jsx'); } catch {}
// RELIABILITY: Ensure bootstrap only executes in browser environments.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // DIAGNOSTIC: bootstrap trace
  const bootstrap = async () => {
    // DIAGNOSTIC: define logging helper for console and DOM
    const log = (msg) => {
      if (import.meta.env?.DEV) {
        console.log('[BOOT]', msg); // [Fix B1] Limit bootstrap logging to development console only
      }
    };

    try {
      // DIAGNOSTIC: mark parallel import batch
      log('Importing core modules in parallel...'); // [Fix H4]
      const [React, ReactDOM, appModule, fallbackModule, cssModule] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('./App.jsx'),
        import('./FallbackBoundary.jsx'),
        import('./index.css'),
      ]); // [Fix H4]
      void cssModule; // [Fix H4]
      const { default: App } = appModule; // [Fix H4]
      const { default: FallbackBoundary } = fallbackModule; // [Fix H4]

      // DIAGNOSTIC: mark root element creation
      log('Creating root...');
      // DIAGNOSTIC: locate or create root container
      const rootElement = document.getElementById('root') || (() => {
        // DIAGNOSTIC: create fallback root element when missing
        const r = document.createElement('div');
        // DIAGNOSTIC: ensure element has id=root
        r.id = 'root';
        // DIAGNOSTIC: append fallback root to body
        document.body.appendChild(r);
        // DIAGNOSTIC: return fallback root element
        return r;
      })();

      // DIAGNOSTIC: mark render phase
      log('Rendering <App />...');
      // DIAGNOSTIC: create root and render app
      const { StrictMode } = React;
      const { createRoot } = ReactDOM;
      const root = createRoot(rootElement);
      // DIAGNOSTIC: execute render of App component
      root.render(
        <StrictMode>
          <FallbackBoundary>
            <App />
          </FallbackBoundary>
        </StrictMode>
      );
      // DIAGNOSTIC: confirm render completion
      log('Render complete.');
    } catch (err) {
      // DIAGNOSTIC: compose bootstrap error message
      const msg = `[BOOTSTRAP ERROR] ${err?.name || ''}: ${err?.message || err}`;
      // DIAGNOSTIC: log error to console
      console.error(msg, err);
      // RELIABILITY: Safely persist bootstrap failure snapshot only when storage exists.
      if (typeof window.localStorage !== 'undefined') {
        try {
          window.localStorage.setItem('lastError', msg);
        } catch {}
      }
      // DIAGNOSTIC: surface fatal bootstrap message in DOM
      document.body.innerHTML =
        `<pre style="color:white;background:black;padding:2rem;white-space:pre-wrap;">${msg}</pre>`;
    }
  };

  // RELIABILITY: Kick off guarded bootstrap without leaking promise rejections.
  bootstrap().catch(() => {});

  // DIAGNOSTIC: preserve global error persistence guard
  window.addEventListener('error', e => {
    // DIAGNOSTIC: capture message from global errors
    const msg = `[GlobalError] ${e.error?.name || ''}: ${e.message}`;
    // RELIABILITY: Store last error only when storage is available.
    if (typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.setItem('lastError', msg);
      } catch {}
    }
  });

  // DIAGNOSTIC: preserve promise rejection guard
  window.addEventListener('unhandledrejection', e => {
    // DIAGNOSTIC: capture message from unhandled rejections
    const msg = `[PromiseRejection] ${e.reason?.name || ''}: ${e.reason?.message}`;
    // RELIABILITY: Store rejection snapshot only when storage is available.
    if (typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.setItem('lastError', msg);
      } catch {}
    }
  });

  // DIAGNOSTIC: preserve environment sanity alert
  if (!window.crypto || typeof navigator === 'undefined' || !navigator.serviceWorker) {
    // DIAGNOSTIC: notify unsupported browsers as before
    const existingBanner = document.getElementById('support-warning');
    if (!existingBanner) {
      const banner = document.createElement('div');
      banner.id = 'support-warning';
      banner.role = 'status';
      banner.setAttribute('aria-live', 'polite');
      banner.textContent = 'Some features may be limited without secure context or service worker support.';
      banner.style.cssText = 'position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);background:#1f2937;color:#f9fafb;padding:0.75rem 1.25rem;border-radius:0.5rem;box-shadow:0 10px 20px rgba(0,0,0,0.25);z-index:9999;font-family:system-ui,sans-serif;font-size:0.875rem;max-width:90vw;text-align:center;'; // [Fix M4]
      document.body.appendChild(banner);
    }
  }
  // PWA: force update on each load
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const warmAssetUrls = []; // [Fix PWA-02]
    if (import.meta.env.PROD) {
      try {
        const entryAssets = import.meta.glob('/src/main.jsx', { import: 'default', eager: true, query: '?url' });
        const styleAssets = import.meta.glob('/src/index.css', { import: 'default', eager: true, query: '?url' });
        const assetSet = new Set([
          ...Object.values(entryAssets ?? {}),
          ...Object.values(styleAssets ?? {}),
        ]);
        const normalizedAssets = new Set();
        assetSet.forEach((url) => {
          try {
            const normalized = new URL(url, window.location.origin);
            normalizedAssets.add(normalized.pathname + normalized.search);
          } catch {
            normalizedAssets.add(url);
          }
        });
        warmAssetUrls.push(...normalizedAssets);
      } catch (err) {
        console.warn('[PWA] Failed to resolve asset manifest for precache warmup:', err); // [Fix PWA-02]
      }
    }

    const postAssetManifest = (registration) => { // [Fix PWA-02]
      if (!warmAssetUrls.length) return;
      const controller = registration?.active || navigator.serviceWorker.controller;
      if (controller) {
        controller.postMessage({ type: 'CACHE_URLS', payload: warmAssetUrls });
      }
    };

    navigator.serviceWorker.ready
      .then((reg) => {
        reg.update();
        postAssetManifest(reg);
      })
      .catch(() => {});

    if (warmAssetUrls.length) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        navigator.serviceWorker.ready.then(postAssetManifest).catch(() => {});
      });
    }
  }
}
