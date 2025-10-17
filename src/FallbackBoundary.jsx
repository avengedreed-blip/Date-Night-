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
        this._reloadTimer = setTimeout(() => window.location.reload(), 1500);
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
      return (
        <div className="w-full h-screen flex items-center justify-center bg-black text-white">
          <p>Something went wrong. Reloading…</p>
        </div>
      );
    }
    return this.props.children;
  }
}
