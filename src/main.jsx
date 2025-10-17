import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import FallbackBoundary from "./FallbackBoundary.jsx";
import "./index.css";

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

// RELIABILITY: wrap app to capture runtime exceptions
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FallbackBoundary>
      <App />
    </FallbackBoundary>
  </React.StrictMode>
);
