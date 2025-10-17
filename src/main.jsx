// TRACE: module load marker
try { console.log('[INIT]', 'main.jsx'); } catch {}
// RELIABILITY: Ensure bootstrap only executes in browser environments.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // DIAGNOSTIC: bootstrap trace
  const bootstrap = async () => {
    // DIAGNOSTIC: define logging helper for console and DOM
    const log = (msg) => {
      // DIAGNOSTIC: emit to console with [BOOT] prefix
      console.log('[BOOT]', msg);
      // DIAGNOSTIC: attempt to mirror log visibly in DOM
      try {
        // DIAGNOSTIC: create visual log element
        const el = document.createElement('div');
        // DIAGNOSTIC: assign message text
        el.textContent = msg;
        // DIAGNOSTIC: apply minimal styling for readability
        el.style.cssText = 'color:#0f0;font-family:monospace;font-size:12px;';
        // DIAGNOSTIC: append log element to body
        document.body.appendChild(el);
      } catch {}
    };

    try {
      // DIAGNOSTIC: mark React import
      log('Importing React...');
      // DIAGNOSTIC: dynamically import React
      const React = await import('react');

      // DIAGNOSTIC: mark ReactDOM import
      log('Importing ReactDOM...');
      // DIAGNOSTIC: dynamically import ReactDOM client
      const ReactDOM = await import('react-dom/client');

      // DIAGNOSTIC: mark App.jsx import
      log('Importing App.jsx...');
      // DIAGNOSTIC: dynamically import App component
      const { default: App } = await import('./App.jsx');

      // DIAGNOSTIC: mark FallbackBoundary import
      log('Importing FallbackBoundary.jsx...');
      // DIAGNOSTIC: dynamically import FallbackBoundary component
      const { default: FallbackBoundary } = await import('./FallbackBoundary.jsx');

      // DIAGNOSTIC: mark index.css import
      log('Importing index.css...');
      // DIAGNOSTIC: dynamically import global stylesheet
      await import('./index.css');

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
    alert("Unsupported browser for full experience.");
  }
}
