import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import FallbackBoundary from "./FallbackBoundary.jsx";
import "./index.css";

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
