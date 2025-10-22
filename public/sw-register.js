// [Fix HD-03] SW registration (externalized for CSP compliance)
console.log('[SW] Registration script loaded');
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: './' })
      .then((registration) => {
        console.info('[SW] Registered:', registration.scope);
        let updateInvoked = false; // [Fix PWA-04]
        const requestUpdateOnce = () => {
          if (updateInvoked) return; // [Fix PWA-04]
          updateInvoked = true; // [Fix PWA-04]
          registration.update(); // [Fix PWA-04]
        };
        requestUpdateOnce(); // [Fix PWA-04]

        const activateWorker = (worker) => {
          worker?.postMessage({ type: 'SKIP_WAITING' });
        };

        if (registration.waiting) {
          activateWorker(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              activateWorker(newWorker);
            }
          });
        });

        let refreshing = false; // [Fix PWA-04]
        const resetRefreshing = () => {
          refreshing = false; // [Fix PWA-04]
        };
        const scheduleRefreshReset = () => {
          if (typeof queueMicrotask === 'function') {
            queueMicrotask(resetRefreshing); // [Fix PWA-04]
            return;
          }
          setTimeout(resetRefreshing, 0); // [Fix PWA-04]
        };
        const handleControllerChange = () => {
          if (refreshing) return; // [Fix PWA-04]
          refreshing = true; // [Fix PWA-04]
          scheduleRefreshReset(); // [Fix PWA-04]
          window.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange, { once: true });
      })
      .catch((error) => {
        console.warn('[SW] Registration failed:', error);
      });
  });
}
