// RELIABILITY: unified Tone.js audio safety + gesture unlock system
export const attachAudioGestureListeners = () => {
  const resumeAudio = async () => {
    try {
      const Tone = window.Tone;
      if (Tone && Tone.context && Tone.context.state === 'suspended') {
        await Tone.start();
        console.info('[Reliability] Audio context resumed after gesture');
      }
    } catch (err) {
      console.warn('[Reliability] Tone resume failed:', err);
    }
    // remove listeners after first success attempt
    window.removeEventListener('pointerdown', resumeAudio, true);
    window.removeEventListener('touchstart', resumeAudio, true);
    window.removeEventListener('click', resumeAudio, true);
  };

  // listen for any user gesture to unlock audio
  window.addEventListener('pointerdown', resumeAudio, true);
  window.addEventListener('touchstart', resumeAudio, true);
  window.addEventListener('click', resumeAudio, true);
};

// RELIABILITY: global suppression of unhandled audio promise rejections
export const silenceToneErrors = () => {
  // catch Tone.js internal rejections that would otherwise bubble to React
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.toString?.() || '';
    if (msg.includes('AudioContext') || msg.includes('Tone')) {
      console.warn('[Reliability] Suppressed Tone.js rejection:', msg);
      event.preventDefault(); // prevent React boundary from catching it
    }
  });

  // optional: catch direct runtime errors from Tone.js
  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (msg.includes('AudioContext') || msg.includes('Tone')) {
      console.warn('[Reliability] Suppressed Tone.js runtime error:', msg);
      event.preventDefault();
    }
  });
};

// RELIABILITY: manual safeguard for explicit context resume if needed elsewhere
export const ensureAudioReady = async () => {
  try {
    const ctx = window.Tone?.context;
    if (ctx && ctx.state === 'suspended') await ctx.resume();
  } catch (err) {
    console.warn('[Reliability] Audio resume attempt failed:', err);
  }
};
