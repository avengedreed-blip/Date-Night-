/**
 * Unlock Tone.js audio context after user interaction.
 *
 * The Date Night experience relies on Tone.js sequences, but many mobile
 * browsers start audio contexts in a suspended state. This helper attaches
 * low-cost listeners and resumes the shared Tone.js context the first time the
 * user interacts with the page.
 */
export function unlockToneAudio() {
  const { Tone } = window;
  if (!Tone || !Tone.context) {
    // RELIABILITY: Exit early if Tone.js is not bundled yet.
    return;
  }

  if (Tone.context.state === 'running') {
    return;
  }

  const unlock = async () => {
    try {
      await Tone.start();
      if (Tone.context.state === 'running') {
        // RELIABILITY: Remove listeners once audio is unlocked to avoid leaks.
        interactionEvents.forEach(eventName =>
          window.removeEventListener(eventName, unlock, true)
        );
        console.info('[Tone] Audio context resumed');
      }
    } catch (error) {
      console.warn('[Tone] Unable to resume audio context', error);
    }
  };

  const interactionEvents = ['pointerdown', 'touchstart', 'keydown'];
  interactionEvents.forEach(eventName => {
    // RELIABILITY: Capture-phase listener ensures we resume before Tone.js nodes fire.
    window.addEventListener(eventName, unlock, { passive: true, capture: true });
  });
}
