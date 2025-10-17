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
  componentDidCatch(error, info) {
    try {
      const msg = `[ReactError] ${error?.name}: ${error?.message}`;
      const stack = info?.componentStack || error?.stack || '';
      console.error(msg, stack);
      localStorage.setItem('lastError', msg + '\n' + stack);
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
      let msg = 'No details';
      try { msg = localStorage.getItem('lastError') || msg; } catch {}
      return (
        <div style={{
          background:'#000', color:'#fff', width:'100vw', height:'100vh',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          fontFamily:'monospace', whiteSpace:'pre-wrap', padding:'2rem'
        }}>
          <h3>Something went wrong.</h3>
          <pre>{msg}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
