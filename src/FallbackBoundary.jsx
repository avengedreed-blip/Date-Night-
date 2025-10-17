// RELIABILITY: top-level React error boundary to prevent black-screen crashes
import React from 'react';

export default class FallbackBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    // RELIABILITY: track scheduled reload so we can cancel if boundary unmounts
    this.reloadTimer = null;
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
    } catch (storageErr) {
      console.warn('[Reliability] Failed to persist lastError:', storageErr);
    }
  }
  componentDidUpdate(_prevProps, prevState) {
    if (!prevState.hasError && this.state.hasError && !this.reloadTimer && typeof window !== 'undefined') {
      this.reloadTimer = window.setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  }
  componentWillUnmount() {
    if (this.reloadTimer && typeof window !== 'undefined') {
      window.clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-screen flex items-center justify-center bg-black text-white">
          <p>Something went wrong. Reloading...</p>
        </div>
      );
    }
    return this.props.children;
  }
}
