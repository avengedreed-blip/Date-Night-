// TRACE: module load marker
try { console.log('[INIT]', 'audioGate.js'); } catch {}
// RELIABILITY: Safe Tone getter — fetches Tone only after runtime load
const getTone = () => (typeof window !== 'undefined' ? window.Tone : null);

// RELIABILITY: Global flag to track unlock status
let audioUnlocked = false;
let detachGestureListeners; // [Fix M2]
let listenersAttached = false; // [Fix M2]

// RELIABILITY: Gesture-based unlock listener
export const attachAudioGestureListeners = () => {
  if (typeof window === 'undefined') return () => {};
  if (listenersAttached && typeof detachGestureListeners === 'function') {
    return detachGestureListeners; // [Fix M2]
  }

  const events = ['pointerdown', 'touchstart', 'click']; // [Fix M2]

  const resumeAudio = async () => {
    try {
      const Tone = getTone();
      if (Tone?.context && Tone.context.state !== 'running') {
        await Tone.start();
      }
      if (Tone?.context?.state === 'running') {
        audioUnlocked = true;
        console.info('[Reliability] Audio context resumed after gesture');
      }
    } catch (err) {
      console.warn('[Reliability] Tone resume failed:', err);
    }
    if (audioUnlocked) {
      detach(); // [Fix M2]
    }
  };

  const detach = () => {
    events.forEach((ev) => window.removeEventListener(ev, resumeAudio, true));
    listenersAttached = false; // [Fix M2]
    detachGestureListeners = undefined; // [Fix M2]
  };

  events.forEach((ev) => window.addEventListener(ev, resumeAudio, true));
  listenersAttached = true; // [Fix M2]
  detachGestureListeners = detach; // [Fix M2]
  return detach;
};

// RELIABILITY: Optional helpers, same lazy Tone pattern
export const ensureAudioReady = async () => {
  const Tone = getTone();
  if (!Tone) return;
  if (Tone.context.state !== 'running') await Tone.start();
};

export const silenceToneErrors = () => { // [Fix RC-01][Fix OBS-01]
  const Tone = getTone();
  let previousStateHandler;
  if (Tone?.context) {
    previousStateHandler = Tone.context.onstatechange;
    Tone.context.onstatechange = () => {};
  }
  if (typeof window === 'undefined') {
    return () => {
      if (Tone?.context) {
        Tone.context.onstatechange = previousStateHandler;
      }
    };
  }
  const handler = (event) => {
    const reason = event?.reason;
    const message = typeof reason === 'string' ? reason : String(reason || '');
    const isAutoplay = message.includes('AudioContext') || message.includes('NotAllowedError');
    if (!audioUnlocked && isAutoplay) {
      console.warn('[Reliability] Suppressed pre-gesture audio rejection:', message);
      event.preventDefault?.();
      return;
    }
    if (audioUnlocked && message) {
      console.error('[Tone]', message, reason); // [Fix OBS-01]
    }
  };
  window.addEventListener('unhandledrejection', handler, true);
  return () => {
    window.removeEventListener('unhandledrejection', handler, true);
    if (Tone?.context) {
      Tone.context.onstatechange = previousStateHandler;
    }
  };
};

// RELIABILITY: exposed recovery helper to re-attempt context start when errors surface
export const recoverAudio = async () => {
  const Tone = getTone();
  if (!Tone?.context) return false;
  try {
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }
    if (Tone.context.state === 'running') {
      audioUnlocked = true;
    }
    console.info('[Reliability] Audio recover attempted');
    return true;
  } catch (e) {
    console.error('[Reliability] Audio recover failed:', e);
    return false;
  }
};
