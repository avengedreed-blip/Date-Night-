// TRACE: module load marker
try { console.log('[INIT]', 'audioGate.js'); } catch {}
// RELIABILITY: module-level audio unlock tracker to manage suppression scope
let audioUnlocked = false;
// RELIABILITY: unified Tone.js audio safety + gesture unlock system
export const attachAudioGestureListeners = () => {
  if (typeof window === 'undefined') {
    // RELIABILITY: Skip gesture wiring when running outside the browser.
    return;
  }
  const resumeAudio = async () => {
    try {
      const Tone = window?.Tone;
      if (Tone && Tone.context) {
        if (Tone.context.state !== 'running') {
          await Tone.start();
        }
        if (Tone.context.state === 'running') {
          audioUnlocked = true;
          console.info('[Reliability] Audio context resumed after gesture');
        }
      }
    } catch (err) {
      console.warn('[Reliability] Tone resume failed:', err);
    }
    // RELIABILITY: remove listeners only once audio is confirmed unlocked
    if (audioUnlocked) {
      window.removeEventListener('pointerdown', resumeAudio, true);
      window.removeEventListener('touchstart', resumeAudio, true);
      window.removeEventListener('click', resumeAudio, true);
    }
  };

  // RELIABILITY: listen for any user gesture to unlock audio
  window.addEventListener('pointerdown', resumeAudio, true);
  window.addEventListener('touchstart', resumeAudio, true);
  window.addEventListener('click', resumeAudio, true);
};

// RELIABILITY: targeted suppression only for autoplay policy rejections pre-gesture
export const silenceToneErrors = () => {
  if (typeof window === 'undefined') {
    // RELIABILITY: No-op when browser globals are unavailable.
    return;
  }
  window.addEventListener('unhandledrejection', (event) => {
    const msg = String(event.reason || '');
    // RELIABILITY: Guard autoplay rejection heuristics against non-string payloads.
    const isAutoplay = typeof msg === 'string' && (msg.includes('AudioContext') || msg.includes('NotAllowedError'));
    if (!audioUnlocked && isAutoplay) {
      console.warn('[Reliability] Suppressed pre-gesture audio rejection:', msg);
      event.preventDefault();
      return;
    }
    // RELIABILITY: Only surface Tone.js errors when message payload supports includes.
    if (audioUnlocked && typeof msg === 'string' && msg.includes('Tone')) {
      console.error('[Reliability] Surfaced Tone.js rejection:', event.reason);
    }
  });
};

// RELIABILITY: exposed recovery helper to re-attempt context start when errors surface
export const recoverAudio = async () => {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    if (window.Tone?.context?.state !== 'running') {
      await window.Tone.start();
    }
    if (window.Tone?.context?.state === 'running') {
      audioUnlocked = true;
    }
    console.info('[Reliability] Audio recover attempted');
    return true;
  } catch (e) {
    console.error('[Reliability] Audio recover failed:', e);
    return false;
  }
};

// RELIABILITY: manual safeguard for explicit context resume if needed elsewhere
export const ensureAudioReady = async () => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const ctx = window.Tone?.context;
    if (ctx && ctx.state === 'suspended') await ctx.resume();
  } catch (err) {
    console.warn('[Reliability] Audio resume attempt failed:', err);
  }
};
