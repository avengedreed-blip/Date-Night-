// RELIABILITY: top-level React error boundary to prevent black-screen crashes
import React from 'react';

export default class FallbackBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err, info) {
    console.error('[Reliability] Boundary caught error:', err, info);
    localStorage.setItem('lastError', err?.message || 'unknown');
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-screen flex items-center justify-center bg-black text-white">
          <p>Something went wrong. Reloading...</p>
          {setTimeout(() => window.location.reload(), 1500)}
        </div>
      );
    }
    return this.props.children;
  }
}
