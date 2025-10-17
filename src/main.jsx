// DIAGNOSTIC: top-level bootstrap guard
try {
  // DIAGNOSTIC: defer actual app bootstrap to an async IIFE
  (async () => {
    // DIAGNOSTIC: import and render application within guarded scope
    try {
      const React = await import('react');
      const ReactDOM = await import('react-dom/client');
      const { default: App } = await import('./App.jsx');
      const { default: FallbackBoundary } = await import('./FallbackBoundary.jsx');
      await import('./index.css');
      const { StrictMode } = React;
      const { createRoot } = ReactDOM;
      const root = createRoot(document.getElementById('root'));
      root.render(
        <StrictMode>
          <FallbackBoundary>
            <App />
          </FallbackBoundary>
        </StrictMode>
      );
    } catch (err) {
      const msg = `[BootstrapError] ${err?.name || ''}: ${err?.message || err}`;
      console.error(msg, err);
      localStorage.setItem('lastError', msg);
      document.body.innerHTML = `<pre style="color:white;background:black;padding:2rem;white-space:pre-wrap;">${msg}</pre>`;
    }
  })();
} catch (outerErr) {
  const msg = `[CriticalBootstrapError] ${outerErr?.name || ''}: ${outerErr?.message || outerErr}`;
  console.error(msg, outerErr);
  localStorage.setItem('lastError', msg);
  document.body.innerHTML = `<pre style="color:white;background:black;padding:2rem;white-space:pre-wrap;">${msg}</pre>`;
}

window.addEventListener('error', e => {
  const msg = `[GlobalError] ${e.error?.name || ''}: ${e.message}`;
  localStorage.setItem('lastError', msg);
});

window.addEventListener('unhandledrejection', e => {
  const msg = `[PromiseRejection] ${e.reason?.name || ''}: ${e.reason?.message}`;
  localStorage.setItem('lastError', msg);
});

// RELIABILITY: environment sanity check
if (!window?.crypto || !navigator?.serviceWorker) {
  alert("Unsupported browser for full experience.");
}
