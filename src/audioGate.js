// TRACE: module load marker
try { console.log('[INIT]', 'audioGate.js'); } catch {}
// RELIABILITY: Safe Tone getter — fetches Tone only after runtime load
const getTone = () => (typeof window !== 'undefined' ? window.Tone : null);

// RELIABILITY: Global flag to track unlock status
let audioUnlocked = false;

// [Fix UI-001] Gesture-synchronous, idempotent unlock helper with deterministic logging
export async function unlockAudioEngine() {
  const tone = getTone();
  const ctx = tone?.context;

  if (!tone || !ctx) {
    console.warn('[AudioUnlock] Skipped: Tone not loaded');
    audioUnlocked = false;
    return false;
  }

  if (ctx.state === 'running') {
    if (!audioUnlocked) {
      audioUnlocked = true;
    }
    console.info('[AudioUnlock] Success');
    return true;
  }

  audioUnlocked = false;
  return false;
}
let detachGestureListeners; // [Fix M2]
let listenersAttached = false; // [Fix M2]

// RELIABILITY: Gesture-based unlock listener
export const attachAudioGestureListeners = () => {
  if (typeof window === 'undefined') return () => {};
  if (listenersAttached && typeof detachGestureListeners === 'function') {
    return detachGestureListeners; // [Fix M2]
  }

  const events = ['pointerdown', 'touchstart', 'click']; // [Fix M2]

  const resumeAudio = () => {
    const finalize = (result) => {
      if (result && audioUnlocked) {
        detach(); // [Fix M2]
      }
    };
    try {
      const outcome = unlockAudioEngine(); // [Fix AudioUnlock-AU-002] Trigger unlock directly inside gesture handler
      if (outcome && typeof outcome.then === 'function') {
        outcome.then(finalize);
      } else {
        finalize(outcome);
      }
    } catch (err) {
      console.warn('[Reliability] Tone resume failed:', err);
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
  await unlockAudioEngine(); // [Fix AudioUnlock-AU-003] Reuse centralized unlock flow for readiness checks
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

  const ctx = Tone.context;
  if (ctx.state !== 'running') {
    try {
      if (typeof ctx.resume === 'function') {
        await ctx.resume();
      }
      if (typeof Tone.start === 'function') {
        await Tone.start();
      }
    } catch (err) {
      console.warn('[AudioUnlock] Recovery resume failed', err); // [Fix UI-001]
    }
  }

  const unlocked = await unlockAudioEngine(); // [Fix AudioUnlock-AU-004] Funnel recovery through shared unlock helper
  if (unlocked) {
    console.info('[Reliability] Audio recover attempted');
  }
  return unlocked;
};
