import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import FallbackBoundary from "./FallbackBoundary.jsx";
import "./index.css";

// DIAGNOSTIC: global error and rejection capture
window.addEventListener("error", (e) => {
  try {
    const msg = `[GlobalError] ${e.message || e.error}`;
    console.error(msg);
    localStorage.setItem("lastError", msg);
  } catch {}
});

window.addEventListener("unhandledrejection", (e) => {
  try {
    const msg = `[UnhandledRejection] ${e.reason?.message || e.reason}`;
    console.error(msg);
    localStorage.setItem("lastError", msg);
  } catch {}
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
