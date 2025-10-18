// TRACE: module load marker
try { console.log('[INIT]', 'FallbackBoundary.jsx'); } catch {}
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
  // DIAG: capture actual runtime error before showing fallback
  componentDidCatch(error, info) {
    console.error('[FallbackBoundary caught error]', error, info);
    this.setState({ hasError: true });
    // DIAGNOSTIC: expanded error capture to stringify any thrown value
    // DIAGNOSTIC: guard diagnostics against unexpected failures
    try {
      // DIAGNOSTIC: initialize message storage for arbitrary throwables
      let msg = '';

      // DIAGNOSTIC: detect native Error instances for detailed output
      if (error instanceof Error) {
        // DIAGNOSTIC: include name, message, and stack when available
        msg = `[ReactError] ${error.name}: ${error.message}\n${error.stack || ''}`;
      // DIAGNOSTIC: handle plain objects thrown as errors
      } else if (typeof error === 'object' && error !== null) {
        try {
          // DIAGNOSTIC: stringify non-error objects
          msg = '[ReactError: Non-Error object]\n' + JSON.stringify(error, null, 2);
        } catch {
          // DIAGNOSTIC: fallback when object cannot be stringified
          msg = '[ReactError: Non-Error object, unstringifiable]';
        }
      // DIAGNOSTIC: explicitly note when undefined is thrown
      } else if (typeof error === 'undefined') {
        msg = '[ReactError] undefined was thrown';
      } else {
        // DIAGNOSTIC: stringify primitives like strings or numbers
        msg = `[ReactError: ${typeof error}] ${String(error)}`;
      }

      // DIAGNOSTIC: append component stack for context
      const stack = info?.componentStack || '';
      // DIAGNOSTIC: consolidate final diagnostic payload
      const finalMsg = `${msg}\n${stack}`;
      // DIAGNOSTIC: log comprehensive diagnostics to console
      console.error(finalMsg);
      // DIAGNOSTIC: persist diagnostics for render retrieval
      localStorage.setItem('lastError', finalMsg);
    } catch (e) {
      // DIAGNOSTIC: report failures in diagnostic routine itself
      console.error('componentDidCatch diagnostic failed:', e);
    }
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
      // DIAGNOSTIC: display persisted diagnostics when available
      let msg = 'No details found';
      // DIAGNOSTIC: attempt to read diagnostics from localStorage
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
