// RELIABILITY: top-level React error boundary to prevent black-screen crashes
import React from 'react';

export default class FallbackBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    // RELIABILITY: track scheduled reload so we can cancel if boundary unmounts
    this._reloadTimer = null;
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err, info) {
    console.error('[Reliability] Boundary caught error:', err, info);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('lastError', err?.message || 'unknown');
      }
    } catch {}
    // RELIABILITY: schedule reload outside render
    try {
      if (typeof window !== 'undefined') {
        clearTimeout(this._reloadTimer);
        // DIAGNOSTIC: disable auto reload to show captured error
        // this._reloadTimer = setTimeout(() => window.location.reload(), 1500);
      }
    } catch {}
  }
  componentWillUnmount() {
    if (typeof window !== 'undefined') {
      clearTimeout(this._reloadTimer);
    }
    this._reloadTimer = null;
  }
  render() {
    if (this.state.hasError) {
      // DIAGNOSTIC: display stored diagnostic error message
      let msg = "Unknown runtime error";
      try {
        msg = localStorage.getItem("lastError") || msg;
      } catch {}
      return (
        <div
          style={{
            color: "white",
            background: "black",
            width: "100vw",
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            textAlign: "center",
            padding: "2rem"
          }}
        >
          <h3>Something went wrong.</h3>
          <pre style={{ marginTop: "1rem", fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>
            {msg}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
