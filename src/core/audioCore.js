// TRACE: module load marker
try { console.log('[INIT]', 'core/audioCore.js'); } catch {}
// RELIABILITY: Centralized audio engine core extracted from App.jsx to break TDZ cycles.
import * as Tone from 'tone';

// RELIABILITY: Guarantee Tone namespace is present on window before consumers access audio APIs.
if (typeof window !== 'undefined' && !window.Tone) {
  window.Tone = Tone;
}

// RELIABILITY: Shared gesture-based audio resume helper reused across modules.
export const resumeAudioOnGesture = async () => {
  if (typeof window === 'undefined' || !window.Tone || !window.Tone.context) return;
  if (window.Tone.context.state === 'running') return;
  try {
    await window.Tone.start();
  } catch (err) {
    console.warn('Tone.js resume failed', err);
  }
};

// RELIABILITY: Singleton holder to lazily construct the audio engine on demand.
let audioEngineSingleton;

// RELIABILITY: Hoisted factory defers all Tone graph creation until runtime.
const createAudioEngine = () => {
  let isInitialized = false;
  let synths = {};
  let themes = {};
  let activeTheme = null;
  let musicChannel;
  let sfxChannel;
  let lastTickTime = 0;
  let userMusicVolume = -6;

  // RELIABILITY: Ensure Tone context is unlocked before touching audio nodes.
  const ensureAudioUnlocked = async () => {
    await resumeAudioOnGesture();
  };

  // RELIABILITY: Lazily build master channels only after Tone is available.
  const createChannels = () => {
    const ToneNS = window.Tone;
    if (!ToneNS) return;
    musicChannel = new ToneNS.Channel({ volume: userMusicVolume, pan: 0 }).toDestination();
    sfxChannel = new ToneNS.Channel({ volume: 0, pan: 0 }).toDestination();
  };

  // RELIABILITY: Delay synth construction until initialization to avoid TDZ imports.
  const createSynths = () => {
    const ToneNS = window.Tone;
    if (!ToneNS) return;
    const sfxReverb = new ToneNS.Reverb({ decay: 2, wet: 0.2 }).connect(sfxChannel);

    const tickReverb = new ToneNS.Reverb({ decay: 0.5, wet: 0.15 }).connect(sfxChannel);
    synths.tick = new ToneNS.MembraneSynth({ pitchDecay: 0.01, octaves: 10, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }, volume: 0 }).connect(tickReverb);
    synths.tickNoise = new ToneNS.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.02, sustain: 0 }, volume: -22 }).connect(tickReverb);

    synths.spinBlip = new ToneNS.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0 } }).connect(sfxReverb);
    synths.spinNoise = new ToneNS.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.01, decay: 0.5, sustain: 0 } }).connect(sfxChannel);
    const noiseFilter = new ToneNS.AutoFilter('8n', 500, 4).connect(sfxReverb).start();
    synths.spinNoise.connect(noiseFilter);
    synths.wheelStopChord = new ToneNS.PolySynth(ToneNS.Synth, { volume: -8, oscillator: { type: 'fatsine' }, envelope: { attack: 0.1, release: 1 } }).connect(sfxReverb);
    synths.wheelStopArp = new ToneNS.PluckSynth({ dampening: 6000, resonance: 0.9, volume: -5 }).connect(sfxReverb);
    synths.wheelStopArpSeq = new ToneNS.Sequence((time, note) => { synths.wheelStopArp.triggerAttack(note, time); }, ['C5', 'E5', 'G5', 'C6'], '16n');
    const modalFilter = new ToneNS.Filter(1000, 'highpass').connect(sfxReverb);
    synths.modalWhoosh = new ToneNS.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.05, decay: 0.3, release: 0.5 }, volume: -20 }).connect(modalFilter);
    synths.modalShimmer = new ToneNS.MetalSynth({ frequency: 600, harmonicity: 8, modulationIndex: 20, envelope: { attack: 0.2, decay: 0.2 }, volume: -15 }).connect(sfxReverb);
    synths.modalClose = new ToneNS.PluckSynth({ dampening: 4000, volume: -5 }).connect(sfxReverb);
    synths.correct = new ToneNS.PolySynth(ToneNS.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.3, release: 0.5 }, volume: -10 }).connect(sfxReverb);
    synths.wrong = new ToneNS.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.5, release: 0.5 }, volume: -10 }).connect(sfxReverb);
    const swellFilter = new ToneNS.Filter(200, 'highpass').connect(sfxReverb);
    synths.extremeSwell = new ToneNS.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 1.5, decay: 0.2, sustain: 0, release: 0.2 }, volume: -15 }).connect(swellFilter);
    synths.extremeHit = new ToneNS.FMSynth({ harmonicity: 0.5, modulationIndex: 10, envelope: { attack: 0.01, decay: 1, sustain: 0, release: 1 }, volume: -5 }).connect(sfxReverb);
    synths.refuse = new ToneNS.Synth({ oscillator: { type: 'sine' }, portamento: 0.2, envelope: { attack: 0.1, release: 0.5 }, volume: -8 }).connect(sfxReverb);
    synths.uiConfirm = new ToneNS.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0 }, volume: -15 }).connect(sfxChannel);
  };

  // RELIABILITY: Theme construction deferred to avoid eager Tone node instantiation.
  const createThemes = () => {
    const ToneNS = window.Tone;
    if (!ToneNS) return;

    const createThemePart = (synth, events) => {
      const part = new ToneNS.Part((time, value) => {
        synth.triggerAttackRelease(value.notes, value.duration, time);
      }, events);
      part.loop = true;
      part.loopEnd = events.reduce((max, e) => Math.max(max, ToneNS.Time(e.time).toSeconds() + ToneNS.Time(e.duration).toSeconds()), 0);
      return part;
    };

    const velourReverb = new ToneNS.Reverb({ decay: 5, wet: 0.5 }).connect(musicChannel);
    const velourDelay = new ToneNS.FeedbackDelay('8n.', 0.4).connect(velourReverb);
    const velourPad = new ToneNS.PolySynth(ToneNS.Synth, { oscillator: { type: 'fatsawtooth' }, envelope: { attack: 2, decay: 1, sustain: 0.5, release: 3 } }).connect(velourDelay);
    const velourBass = new ToneNS.FMSynth({ harmonicity: 0.5, modulationIndex: 5, envelope: { attack: 0.01, release: 0.5 } }).connect(velourReverb);
    themes.velourNights = {
      bpm: 85,
      parts: [
        createThemePart(velourPad, [
          { time: '0:0', notes: ['C3', 'E3', 'G3'], duration: '2m' },
          { time: '2:0', notes: ['A2', 'C3', 'E3'], duration: '2m' },
        ]),
        new ToneNS.Sequence((time, note) => { velourBass.triggerAttackRelease(note, '8n', time); }, ['C2', 'C2', 'C2', 'E2', 'A1', 'A1', 'A1', 'G1'], '4n'),
      ],
    };

    const lotusReverb = new ToneNS.Reverb({ decay: 8, wet: 0.6 }).connect(musicChannel);
    const lotusPad = new ToneNS.PolySynth(ToneNS.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 4, release: 4 }, volume: -12 }).connect(lotusReverb);
    const lotusBell = new ToneNS.MetalSynth({ frequency: 400, harmonicity: 12, modulationIndex: 20, envelope: { attack: 0.01, decay: 1.5 }, volume: -15 }).connect(lotusReverb);
    themes.lotusDreamscape = {
      bpm: 60,
      parts: [
        createThemePart(lotusPad, [
          { time: '0:0', notes: ['C4', 'E4', 'G4'], duration: '1m' },
          { time: '1m:0', notes: ['D4', 'F4', 'A4'], duration: '1m' },
        ]),
        new ToneNS.Sequence((time, note) => { lotusBell.triggerAttack(note, time); }, [['C6', 'E6'], null, 'G5', null, 'D6', null, 'A5', null], '2n'),
      ],
    };

    const velvetReverb = new ToneNS.Reverb({ decay: 2, wet: 0.4 }).connect(musicChannel);
    const velvetMarimba = new ToneNS.PolySynth(ToneNS.MembraneSynth, { pitchDecay: 0.01, octaves: 4, envelope: { attack: 0.005, decay: 0.3, sustain: 0 } }).connect(velvetReverb);
    const velvetBass = new ToneNS.Synth({ oscillator: { type: 'fmsquare' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0 } }).connect(velvetReverb);
    themes.velvetCarnival = {
      bpm: 110,
      parts: [
        new ToneNS.Pattern((time, note) => { velvetMarimba.triggerAttackRelease(note, '8n', time); }, ['C4', 'E4', 'G4', 'A4', 'G4', 'E4'], 'randomWalk'),
        new ToneNS.Sequence((time, note) => { velvetBass.triggerAttackRelease(note, '16n', time); }, ['C2', null, 'C2', ['E2', 'D2']], '8n'),
      ],
    };

    const crimsonDistortion = new ToneNS.Distortion(0.6).connect(musicChannel);
    const crimsonBass = new ToneNS.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.5, release: 0.2 } }).connect(crimsonDistortion);
    themes.crimsonFrenzy = {
      bpm: 120,
      parts: [
        new ToneNS.Sequence((time, note) => { crimsonBass.triggerAttackRelease(note, '16n', time); }, ['C2', 'C2', 'C2', 'C#2', 'C2', 'C2', 'C2', 'D#2'], '8n'),
      ],
    };

    const abyssReverb = new ToneNS.Reverb({ decay: 10, wet: 0.7 }).connect(musicChannel);
    const abyssPad = new ToneNS.PolySynth(ToneNS.Synth, { oscillator: { type: 'fatsine' }, envelope: { attack: 8, release: 8 }, volume: -10 }).connect(abyssReverb);
    const abyssPiano = new ToneNS.FMSynth({ harmonicity: 3, modulationIndex: 1.5, envelope: { attack: 0.01, decay: 2, release: 2 }, volume: -15 }).connect(new ToneNS.FeedbackDelay('4n', 0.6).connect(abyssReverb));
    const abyssSub = new ToneNS.Synth({ oscillator: 'sine', envelope: { attack: 4, release: 4 }, volume: -8 }).connect(abyssReverb);

    let spaceNoise;
    let noiseFilter;

    themes.starlitAbyss = {
      bpm: 60,
      parts: [
        createThemePart(abyssPad, [
          { time: '0:0', notes: ['A2', 'C3', 'E3'], duration: '1m' },
          { time: '1m:0', notes: ['G2', 'B2', 'D3'], duration: '1m' },
        ]),
        new ToneNS.Sequence((time, note) => { abyssPiano.triggerAttackRelease(note, '2n', time); }, ['C5', null, 'E5', 'G5', null, 'D5', null, 'B4'], '2n'),
        new ToneNS.Sequence((time, note) => { abyssSub.triggerAttackRelease(note, '1m', time); }, ['A1', 'G1'], '1m'),
      ],
      init: () => {
        spaceNoise = new ToneNS.Noise('brown').start();
        noiseFilter = new ToneNS.AutoFilter({ frequency: '8m', baseFrequency: 100, octaves: 2 }).connect(musicChannel).start();
        spaceNoise.connect(noiseFilter);
        spaceNoise.volume.value = -25;
      },
      cleanup: () => {
        if (spaceNoise && spaceNoise.state === 'started') spaceNoise.stop().dispose();
        if (noiseFilter && noiseFilter.started) noiseFilter.stop().dispose();
      },
    };

    const firstDanceReverb = new ToneNS.Reverb({ decay: 4, wet: 0.6 }).connect(musicChannel);
    const firstDanceDelay = new ToneNS.FeedbackDelay('8n.', 0.25).connect(firstDanceReverb);
    const firstDancePad = new ToneNS.AMSynth({ volume: -6, envelope: { attack: 2, release: 2 } }).connect(new ToneNS.Filter(1200, 'lowpass').connect(firstDanceReverb));
    const firstDancePiano = new ToneNS.PolySynth(ToneNS.Synth, { volume: -2, oscillator: { type: 'fmtriangle' }, envelope: { attack: 0.01, release: 1.5 } }).connect(firstDanceReverb);
    const firstDanceLead = new ToneNS.FMSynth({ volume: -8, harmonicity: 2, modulationIndex: 5, envelope: { attack: 0.1, decay: 0.5 } }).connect(firstDanceDelay);

    themes.firstDanceMix = {
      bpm: 72,
      parts: [
        new ToneNS.Sequence((time, note) => { firstDancePad.triggerAttackRelease(note, '1m', time); }, ['G3', 'D4', 'E4', 'C4'], '1m'),
        new ToneNS.Sequence((time, notes) => { firstDancePiano.triggerAttackRelease(notes, '2n', time); }, [['G4', 'B4', 'D5'], ['D4', 'F#4', 'A4'], ['E4', 'G4', 'B4'], ['C4', 'E4', 'G4']], '2n'),
        new ToneNS.Pattern((time, note) => { if (note) firstDanceLead.triggerAttackRelease(note, '8n', time); }, ['B4', 'D5', 'G5', null, 'A5', 'G5', 'E5', 'D5', null], '16n'),
      ],
    };

    // [GeminiFix: ForeverPromiseAudio]
    themes.firstDanceMix.parts.forEach((part) => {
      part.loop = true;
      part.probability = 1;
    });
  };

  // RELIABILITY: Public API mirrors legacy behaviour while using lazy initialization.
  return {
    async initialize() {
      if (isInitialized || !window.Tone) return false;
      try {
        await ensureAudioUnlocked();

        const ctx = window.Tone.getContext();
        if (ctx.rawContext) {
          window.Tone.context.lookAhead = 0.03;
          window.Tone.Transport.lookAhead = 0.03;
        } else {
          window.Tone.context.lookAhead = 0.03;
          window.Tone.Transport.lookAhead = 0.03;
        }

        createChannels();
        createSynths();
        createThemes();
        isInitialized = true;
        return true;
      } catch (e) {
        console.error('Audio Engine Init Error:', e);
        return false;
      }
    },

    async startTheme(themeName) {
      if (typeof themeName !== 'string' || !themeName.trim()) {
        console.warn('[DIAGNOSTIC][App.jsx][audioEngine.startTheme] Invalid themeName payload:', themeName);
        return;
      }
      const ToneNS = window.Tone;
      if (!isInitialized || !ToneNS || !themes || typeof themes !== 'object' || !themes[themeName]) {
        console.warn('[DIAGNOSTIC][App.jsx][audioEngine.startTheme] Theme assets unavailable for:', themeName, {
          isInitialized,
          hasTone: !!ToneNS,
          themeKeys: themes ? Object.keys(themes) : null,
        });
        return;
      }

      await ensureAudioUnlocked();

      const startNewThemeAndFadeIn = () => {
        if (activeTheme) {
          if (typeof activeTheme !== 'object' || !activeTheme.parts || !Array.isArray(activeTheme.parts)) {
            console.warn('[DIAGNOSTIC][App.jsx][audioEngine.startTheme] Active theme corrupt before cleanup:', activeTheme);
            activeTheme = null;
          }
        }

        if (activeTheme) {
          if (activeTheme.cleanup) activeTheme.cleanup();
          activeTheme.parts.forEach((part) => {
            if (part.stop) part.stop(0);
            if (part.cancel) part.cancel(0);
          });
        }

        activeTheme = themes[themeName];
        activeTheme.name = themeName;

        if (typeof activeTheme !== 'object' || !Array.isArray(activeTheme.parts)) {
          console.warn('[DIAGNOSTIC][App.jsx][audioEngine.startTheme] Theme payload malformed for:', themeName, activeTheme);
          return;
        }

        ToneNS.Transport.bpm.value = activeTheme.bpm;
        if (activeTheme.init) activeTheme.init();
        activeTheme.parts.forEach((part) => part.start(0));

        if (ToneNS.Transport.state !== 'started') {
          ToneNS.Transport.start();
        }

        musicChannel.volume.rampTo(userMusicVolume, 1.5);
      };

      if (activeTheme && ToneNS.Transport.state === 'started') {
        musicChannel.volume.rampTo(-Infinity, 0.5);
        setTimeout(startNewThemeAndFadeIn, 550);
      } else {
        startNewThemeAndFadeIn();
      }
    },

    stopTheme() {
      const ToneNS = window.Tone;
      if (!isInitialized || !ToneNS || !activeTheme) return;
      if (activeTheme.cleanup) activeTheme.cleanup();
      activeTheme.parts.forEach((part) => {
        if (part.stop) part.stop(0);
        if (part.cancel) part.cancel(0);
      });
      activeTheme = null;
      if (ToneNS.Transport.state === 'started') {
        ToneNS.Transport.stop();
        ToneNS.Transport.cancel(0);
      }
    },

    getCurrentBpm() {
      return activeTheme ? activeTheme.bpm : 85;
    },

    toggleMute(shouldMute) {
      const ToneNS = window.Tone;
      if (!isInitialized || !ToneNS) return;
      ToneNS.Destination.mute = shouldMute;
    },

    setMasterVolume(levelInDb) {
      if (isInitialized && window.Tone) window.Tone.Destination.volume.value = levelInDb;
    },

    setMusicVolume(levelInDb) {
      if (isInitialized && musicChannel) {
        userMusicVolume = levelInDb;
        musicChannel.volume.value = levelInDb;
      }
    },

    setSfxVolume(levelInDb) {
      if (isInitialized && sfxChannel) sfxChannel.volume.value = levelInDb;
    },

    playWheelSpinStart() {
      if (!isInitialized) return;
      const now = window.Tone.now();
      synths.spinBlip.triggerAttackRelease('C5', '8n', now);
      synths.spinNoise.triggerAttack(now);
    },

    playWheelTick() {
      if (!isInitialized) return;
      const now = window.Tone.now();
      if (now - lastTickTime > 0.03) {
        synths.tick.triggerAttackRelease('C7', '32n', now);
        synths.tickNoise.triggerAttackRelease('32n', now);
        lastTickTime = now;
      }
    },

    playWheelStopSound() {
      if (!isInitialized) return;
      const now = window.Tone.now();
      synths.wheelStopChord.triggerAttackRelease(['E4', 'G4', 'C5'], '4n', now);
      synths.wheelStopArpSeq.start(now).stop(now + 0.5);
    },

    playModalOpen() {
      if (!isInitialized) return;
      const now = window.Tone.now();
      synths.modalWhoosh.triggerAttack(now);
      synths.modalShimmer.triggerAttackRelease('2n', now + 0.1);
    },

    playModalClose() {
      if (!isInitialized) return;
      const now = window.Tone.now();
      synths.modalClose.triggerAttack('G5', now);
      synths.modalClose.triggerAttack('C4', now + 0.1);
    },

    playCorrect() {
      if (!isInitialized) return;
      synths.correct.triggerAttackRelease(['C5', 'E5', 'G5'], '8n', window.Tone.now());
    },

    playWrong() {
      if (!isInitialized) return;
      const now = window.Tone.now();
      synths.wrong.frequency.setValueAtTime('G4', now);
      synths.wrong.frequency.linearRampToValueAtTime('G3', now + 0.4);
      synths.wrong.triggerAttack(now);
      synths.wrong.triggerRelease(now + 0.4);
    },

    playExtremePrompt() {
      if (!isInitialized) return;
      const now = window.Tone.now();
      synths.extremeSwell.triggerAttack(now);
      synths.extremeHit.triggerAttackRelease('C1', '1m', now + 1.4);
    },

    playRefuse() {
      if (!isInitialized) return;
      const now = window.Tone.now();
      synths.refuse.triggerAttackRelease('C6', '8n', now);
      synths.refuse.triggerAttackRelease('C4', '8n', now + 0.1);
    },

    playUIConfirm() {
      if (!isInitialized) return;
      synths.uiConfirm.triggerAttackRelease('C6', '16n');
    },
  };
};

// RELIABILITY: Exported getter returns the memoized audio engine instance.
export const getAudioEngine = () => {
  if (!audioEngineSingleton) {
    audioEngineSingleton = createAudioEngine();
  }
  return audioEngineSingleton;
};
