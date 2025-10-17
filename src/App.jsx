// DIAGNOSTIC: module load marker
console.log('[APP] App.jsx module loading...');
/* --- PROMPT RELIABILITY FIX --- */
/* --- SECRET ROUND TIMING PATCH --- */
/* --- UNIVERSAL TRIPLE-TAP RESTORE --- */
import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer, useLayoutEffect } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, MotionConfig } from 'framer-motion';
// RELIABILITY: IndexedDB prompt storage helpers.
import { dbStore } from './storage';
import { attachAudioGestureListeners, silenceToneErrors } from './audioGate.js';

// Ensure Tone.js is globally available
import * as Tone from "tone";
if (!window.Tone) window.Tone = Tone;

// RELIABILITY: app version migration guard
const APP_VERSION = '1.3.0';
// RELIABILITY: Preserve legacy prompt payloads across version resets.
let legacyPromptSnapshot = null;
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const storage = window.localStorage;
    const storedVersion = storage.getItem('app_version');
    if (storedVersion !== APP_VERSION) {
      // RELIABILITY: targeted migration to avoid wiping user settings
      const keep = new Set(['app_version', 'settings', 'lastError', 'volume', 'musicVolume', 'sfxVolume', 'theme']);
      const legacyPrompts = storage.getItem('prompts');
      // remove anything not allowlisted
      const toDelete = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (!keep.has(k)) {
          // queue deletions (cannot mutate while iterating)
          if (k) toDelete.push(k);
        }
      }
      // second pass delete
      toDelete.forEach((k) => storage.removeItem(k));

      storage.setItem('app_version', APP_VERSION);
      if (legacyPrompts) storage.setItem('prompts', legacyPrompts);
      legacyPromptSnapshot = legacyPrompts;
    }
  }
} catch (err) {
  // RELIABILITY: Surface guard failures for diagnostics.
  console.warn('[Reliability] Failed to apply app version guard', err);
}

// RELIABILITY: Centralized gesture-based audio resume helper.
const resumeAudioOnGesture = async () => {
  if (!window.Tone || !window.Tone.context) return;
  if (window.Tone.context.state === "running") return;
  try {
    await window.Tone.start();
  } catch (err) {
    console.warn("Tone.js resume failed", err);
  }
};

// RELIABILITY: Safe UUID helper tolerates browsers without crypto.randomUUID.
const safeUUID = () => {
  const api = globalThis.crypto;
  if (api && typeof api.randomUUID === 'function') {
      return api.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

// RELIABILITY: Microtask scheduler to avoid rAF timing drift.
const scheduleMicrotask = (fn) => {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
    return;
  }
  Promise.resolve().then(fn);
};

// [GeminiFix: ManifestHardening]
// Non-critical asset error suppression
window.addEventListener("error", (e) => {
    if (e.target instanceof HTMLScriptElement || e.target instanceof HTMLLinkElement) {
        // RELIABILITY: Guard error message string checks before substring evaluation.
        if (typeof e.message === 'string' && (e.message.includes("manifest") || e.message.includes("favicon"))) {
      e.preventDefault();
    }
  }
}, true);

// RELIABILITY: lightweight diagnostics logger
window.addEventListener('error', (e) => {
  localStorage.setItem('lastError', e.message);
});


// Registry to suppress click immediately after a secret round opens
const secretPromptOpenAt = { t: 0 };

// Polyfill for structuredClone for wider browser compatibility.
if (typeof structuredClone !== "function") {
    globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

/**
 * audioEngine.js (Integrated) - Now exposes BPM
 */
const audioEngine = (() => {
    let isInitialized = false;
    let synths = {};
    let themes = {};
    let activeTheme = null;
    let musicChannel, sfxChannel;
    let lastTickTime = 0;
    let userMusicVolume = -6;

    const createChannels = () => {
        const Tone = window.Tone;
        if (!Tone) return;
        musicChannel = new Tone.Channel({ volume: userMusicVolume, pan: 0 }).toDestination();
        sfxChannel = new Tone.Channel({ volume: 0, pan: 0 }).toDestination();
    };

    const createSynths = () => {
        const Tone = window.Tone;
        if (!Tone) return;
        const sfxReverb = new Tone.Reverb({ decay: 2, wet: 0.2 }).connect(sfxChannel);
        
        const tickReverb = new Tone.Reverb({ decay: 0.5, wet: 0.15 }).connect(sfxChannel);
        synths.tick = new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 10, oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }, volume: 0 }).connect(tickReverb);
        synths.tickNoise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.02, sustain: 0 }, volume: -22 }).connect(tickReverb);

        synths.spinBlip = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0 } }).connect(sfxReverb);
        synths.spinNoise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.01, decay: 0.5, sustain: 0 } }).connect(sfxChannel);
        const noiseFilter = new Tone.AutoFilter('8n', 500, 4).connect(sfxReverb).start();
        synths.spinNoise.connect(noiseFilter);
        synths.wheelStopChord = new Tone.PolySynth(Tone.Synth, { volume: -8, oscillator: { type: 'fatsine' }, envelope: { attack: 0.1, release: 1 } }).connect(sfxReverb);
        synths.wheelStopArp = new Tone.PluckSynth({ dampening: 6000, resonance: 0.9, volume: -5 }).connect(sfxReverb);
        synths.wheelStopArpSeq = new Tone.Sequence((time, note) => { synths.wheelStopArp.triggerAttack(note, time); }, ["C5", "E5", "G5", "C6"], "16n");
        const modalFilter = new Tone.Filter(1000, 'highpass').connect(sfxReverb);
        synths.modalWhoosh = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.05, decay: 0.3, release: 0.5 }, volume: -20 }).connect(modalFilter);
        synths.modalShimmer = new Tone.MetalSynth({ frequency: 600, harmonicity: 8, modulationIndex: 20, envelope: { attack: 0.2, decay: 0.2 }, volume: -15 }).connect(sfxReverb);
        synths.modalClose = new Tone.PluckSynth({ dampening: 4000, volume: -5 }).connect(sfxReverb);
        synths.correct = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.3, release: 0.5 }, volume: -10 }).connect(sfxReverb);
        synths.wrong = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.5, release: 0.5 }, volume: -10 }).connect(sfxReverb);
        const swellFilter = new Tone.Filter(200, 'highpass').connect(sfxReverb);
        synths.extremeSwell = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 1.5, decay: 0.2, sustain: 0, release: 0.2 }, volume: -15 }).connect(swellFilter);
        synths.extremeHit = new Tone.FMSynth({ harmonicity: 0.5, modulationIndex: 10, envelope: { attack: 0.01, decay: 1, sustain: 0, release: 1 }, volume: -5 }).connect(sfxReverb);
        synths.refuse = new Tone.Synth({ oscillator: { type: 'sine' }, portamento: 0.2, envelope: { attack: 0.1, release: 0.5 }, volume: -8 }).connect(sfxReverb);
        synths.uiConfirm = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0 }, volume: -15 }).connect(sfxChannel);
    };

    const createThemes = () => {
        const Tone = window.Tone;
        if (!Tone) return;

        const createThemePart = (synth, events) => {
            const part = new Tone.Part((time, value) => {
                synth.triggerAttackRelease(value.notes, value.duration, time);
            }, events);
            part.loop = true;
            part.loopEnd = events.reduce((max, e) => Math.max(max, Tone.Time(e.time).toSeconds() + Tone.Time(e.duration).toSeconds()), 0);
            return part;
        };

        const velourReverb = new Tone.Reverb({ decay: 5, wet: 0.5 }).connect(musicChannel);
        const velourDelay = new Tone.FeedbackDelay('8n.', 0.4).connect(velourReverb);
        const velourPad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth' }, envelope: { attack: 2, decay: 1, sustain: 0.5, release: 3 } }).connect(velourDelay);
        const velourBass = new Tone.FMSynth({ harmonicity: 0.5, modulationIndex: 5, envelope: { attack: 0.01, release: 0.5 } }).connect(velourReverb);
        themes.velourNights = { bpm: 85, parts: [ createThemePart(velourPad, [{ time: '0:0', notes: ['C3', 'E3', 'G3'], duration: '2m' }, { time: '2:0', notes: ['A2', 'C3', 'E3'], duration: '2m' }]), new Tone.Sequence((time, note) => { velourBass.triggerAttackRelease(note, '8n', time); }, ['C2', 'C2', 'C2', 'E2', 'A1', 'A1', 'A1', 'G1'], '4n') ] };
        
        const lotusReverb = new Tone.Reverb({ decay: 8, wet: 0.6 }).connect(musicChannel);
        const lotusPad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 4, release: 4 }, volume: -12 }).connect(lotusReverb);
        const lotusBell = new Tone.MetalSynth({ frequency: 400, harmonicity: 12, modulationIndex: 20, envelope: { attack: 0.01, decay: 1.5 }, volume: -15 }).connect(lotusReverb);
        themes.lotusDreamscape = { bpm: 60, parts: [ createThemePart(lotusPad, [{ time: '0:0', notes: ['C4', 'E4', 'G4'], duration: '1m' }, { time: '1m:0', notes: ['D4', 'F4', 'A4'], duration: '1m' }]), new Tone.Sequence((time, note) => { lotusBell.triggerAttack(note, time); }, [['C6', 'E6'], null, 'G5', null, 'D6', null, 'A5', null], '2n') ] };

        const velvetReverb = new Tone.Reverb({ decay: 2, wet: 0.4 }).connect(musicChannel);
        const velvetMarimba = new Tone.PolySynth(Tone.MembraneSynth, { pitchDecay: 0.01, octaves: 4, envelope: { attack: 0.005, decay: 0.3, sustain: 0 } }).connect(velvetReverb);
        const velvetBass = new Tone.Synth({ oscillator: { type: 'fmsquare' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0 } }).connect(velvetReverb);
        themes.velvetCarnival = { bpm: 110, parts: [ new Tone.Pattern((time, note) => { velvetMarimba.triggerAttackRelease(note, '8n', time); }, ['C4', 'E4', 'G4', 'A4', 'G4', 'E4'], 'randomWalk'), new Tone.Sequence((time, note) => { velvetBass.triggerAttackRelease(note, '16n', time); }, ['C2', null, 'C2', ['E2', 'D2']], '8n') ] };
        
        const crimsonDistortion = new Tone.Distortion(0.6).connect(musicChannel);
        const crimsonBass = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.5, release: 0.2 } }).connect(crimsonDistortion);
        themes.crimsonFrenzy = { bpm: 120, parts: [ new Tone.Sequence((time, note) => { crimsonBass.triggerAttackRelease(note, '16n', time); }, ['C2', 'C2', 'C2', 'C#2', 'C2', 'C2', 'C2', 'D#2'], '8n') ] };
        
        const abyssReverb = new Tone.Reverb({ decay: 10, wet: 0.7 }).connect(musicChannel);
        const abyssPad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsine' }, envelope: { attack: 8, release: 8 }, volume: -10 }).connect(abyssReverb);
        const abyssPiano = new Tone.FMSynth({ harmonicity: 3, modulationIndex: 1.5, envelope: { attack: 0.01, decay: 2, release: 2 }, volume: -15 }).connect(new Tone.FeedbackDelay('4n', 0.6).connect(abyssReverb));
        const abyssSub = new Tone.Synth({ oscillator: 'sine', envelope: { attack: 4, release: 4 }, volume: -8 }).connect(abyssReverb);
        
        let spaceNoise, noiseFilter;

        themes.starlitAbyss = {
            bpm: 60,
            parts: [
                createThemePart(abyssPad, [{ time: '0:0', notes: ['A2', 'C3', 'E3'], duration: '1m' }, { time: '1m:0', notes: ['G2', 'B2', 'D3'], duration: '1m' }]),
                new Tone.Sequence((time, note) => { abyssPiano.triggerAttackRelease(note, '2n', time) }, ['C5', null, 'E5', 'G5', null, 'D5', null, 'B4'], '2n'),
                new Tone.Sequence((time, note) => { abyssSub.triggerAttackRelease(note, '1m', time)}, ['A1', 'G1'], '1m')
            ],
            init: () => {
                spaceNoise = new Tone.Noise('brown').start();
                noiseFilter = new Tone.AutoFilter({ frequency: '8m', baseFrequency: 100, octaves: 2}).connect(musicChannel).start();
                spaceNoise.connect(noiseFilter);
                spaceNoise.volume.value = -25;
            },
            cleanup: () => {
                if(spaceNoise && spaceNoise.state === 'started') spaceNoise.stop().dispose();
                if(noiseFilter && noiseFilter.started) noiseFilter.stop().dispose();
            }
        };

        const firstDanceReverb = new Tone.Reverb({ decay: 4, wet: 0.6 }).connect(musicChannel);
        const firstDanceDelay = new Tone.FeedbackDelay('8n.', 0.25).connect(firstDanceReverb);
        const firstDancePad = new Tone.AMSynth({ volume: -6, envelope: { attack: 2, release: 2 } }).connect(new Tone.Filter(1200, 'lowpass').connect(firstDanceReverb));
        const firstDancePiano = new Tone.PolySynth(Tone.Synth, { volume: -2, oscillator: { type: 'fmtriangle' }, envelope: { attack: 0.01, release: 1.5 } }).connect(firstDanceReverb);
        const firstDanceLead = new Tone.FMSynth({ volume: -8, harmonicity: 2, modulationIndex: 5, envelope: { attack: 0.1, decay: 0.5 } }).connect(firstDanceDelay);

        themes.firstDanceMix = {
            bpm: 72,
            parts: [
                new Tone.Sequence((time, note) => { firstDancePad.triggerAttackRelease(note, '1m', time); }, ['G3', 'D4', 'E4', 'C4'], '1m'),
                new Tone.Sequence((time, notes) => { firstDancePiano.triggerAttackRelease(notes, '2n', time); }, [['G4','B4','D5'], ['D4','F#4','A4'], ['E4','G4','B4'], ['C4','E4','G4']], '2n'),
                new Tone.Pattern((time, note) => { if(note) firstDanceLead.triggerAttackRelease(note, '8n', time); }, ['B4', 'D5', 'G5', null, 'A5', 'G5', 'E5', 'D5', null], '16n')
            ]
        };

        // [GeminiFix: ForeverPromiseAudio]
        themes.firstDanceMix.parts.forEach(p => { p.loop = true; p.probability = 1; });
    };

const publicApi = {
  async initialize() {
    if (isInitialized || !window.Tone) return false;
    try {
      await resumeAudioOnGesture();

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
    } 
    catch (e) { 
      console.error("Audio Engine Init Error:", e); 
      return false; 
    }
  },

  async startTheme(themeName) {
    // DIAGNOSTIC: validate requested themeName before attempting to start playback
    if (typeof themeName !== 'string' || !themeName.trim()) {
      console.warn('[DIAGNOSTIC][App.jsx][audioEngine.startTheme] Invalid themeName payload:', themeName);
      return;
    }
    const Tone = window.Tone;
    // DIAGNOSTIC: ensure theme registry is available before dereferencing theme data
    if (!isInitialized || !Tone || !themes || typeof themes !== 'object' || !themes[themeName]) {
      console.warn('[DIAGNOSTIC][App.jsx][audioEngine.startTheme] Theme assets unavailable for:', themeName, { isInitialized, hasTone: !!Tone, themeKeys: themes ? Object.keys(themes) : null });
      return;
    }

    await resumeAudioOnGesture();

    // [GeminiFix: ForeverPromiseAudio]
    // Removed early return to allow re-triggering and ensure loops continue.
    // if (activeTheme && activeTheme.name === themeName) return;

    const startNewThemeAndFadeIn = () => {
      if (activeTheme) {
        // DIAGNOSTIC: guard activeTheme structure before attempting cleanup
        if (typeof activeTheme !== 'object' || !activeTheme.parts || !Array.isArray(activeTheme.parts)) {
          console.warn('[DIAGNOSTIC][App.jsx][audioEngine.startTheme] Active theme corrupt before cleanup:', activeTheme);
          activeTheme = null;
        }
      }

      if (activeTheme) {
        if (activeTheme.cleanup) activeTheme.cleanup();
        activeTheme.parts.forEach(p => {
          if (p.stop) p.stop(0);
          if (p.cancel) p.cancel(0);
        });
      }

      activeTheme = themes[themeName];
      activeTheme.name = themeName;

      // DIAGNOSTIC: verify new activeTheme payload before use
      if (typeof activeTheme !== 'object' || !Array.isArray(activeTheme.parts)) {
        console.warn('[DIAGNOSTIC][App.jsx][audioEngine.startTheme] Theme payload malformed for:', themeName, activeTheme);
        return;
      }

      Tone.Transport.bpm.value = activeTheme.bpm;
      if (activeTheme.init) activeTheme.init();
      activeTheme.parts.forEach(p => p.start(0));
      
      if (Tone.Transport.state !== "started") {
          Tone.Transport.start();
      }
      
      musicChannel.volume.rampTo(userMusicVolume, 1.5);
    };

    if (activeTheme && Tone.Transport.state === 'started') {
      musicChannel.volume.rampTo(-Infinity, 0.5);
      setTimeout(startNewThemeAndFadeIn, 550);
    } else {
      startNewThemeAndFadeIn();
    }
  },

        stopTheme() { 
            const Tone = window.Tone; 
            if (!isInitialized || !Tone || !activeTheme) return; 
            if (activeTheme.cleanup) activeTheme.cleanup();
            activeTheme.parts.forEach(p => { 
                if (p.stop) p.stop(0);
                if (p.cancel) p.cancel(0);
            }); 
            activeTheme = null; 
            if (Tone.Transport.state === 'started') {
                Tone.Transport.stop(); 
                Tone.Transport.cancel(0);
            }
        },
        getCurrentBpm: () => activeTheme ? activeTheme.bpm : 85,
        toggleMute(shouldMute) { const Tone = window.Tone; if (!isInitialized || !Tone) return; Tone.Destination.mute = shouldMute; },
        setMasterVolume(levelInDb) { if (isInitialized && window.Tone) window.Tone.Destination.volume.value = levelInDb; },
        setMusicVolume(levelInDb) { 
            if (isInitialized && musicChannel) {
                userMusicVolume = levelInDb;
                musicChannel.volume.value = levelInDb;
            }
        },
        setSfxVolume(levelInDb) { if (isInitialized && sfxChannel) sfxChannel.volume.value = levelInDb; },
        playWheelSpinStart: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.spinBlip.triggerAttackRelease('C5', '8n', now); synths.spinNoise.triggerAttack(now); },
        playWheelTick: () => {
            if (!isInitialized) return;
            const now = window.Tone.now();
            if (now - lastTickTime > 0.03) {
                synths.tick.triggerAttackRelease('C7', '32n', now);
                synths.tickNoise.triggerAttackRelease('32n', now);
                lastTickTime = now;
            }
        },
        playWheelStopSound: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.wheelStopChord.triggerAttackRelease(['E4', 'G4', 'C5'], '4n', now); synths.wheelStopArpSeq.start(now).stop(now + 0.5); },
        playModalOpen: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.modalWhoosh.triggerAttack(now); synths.modalShimmer.triggerAttackRelease('2n', now + 0.1); },
        playModalClose: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.modalClose.triggerAttack('G5', now); synths.modalClose.triggerAttack('C4', now + 0.1); },
        playCorrect: () => { if (!isInitialized) return; synths.correct.triggerAttackRelease(['C5', 'E5', 'G5'], '8n', window.Tone.now()); },
        playWrong: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.wrong.frequency.setValueAtTime('G4', now); synths.wrong.frequency.linearRampToValueAtTime('G3', now + 0.4); synths.wrong.triggerAttack(now); synths.wrong.triggerRelease(now + 0.4); },
        playExtremePrompt: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.extremeSwell.triggerAttack(now); synths.extremeHit.triggerAttackRelease('C1', '1m', now + 1.4); },
        playRefuse: () => {
          if (!isInitialized) return;
          const now = window.Tone.now();
          synths.refuse.triggerAttackRelease("C6", "8n", now);
          synths.refuse.triggerAttackRelease("C4", "8n", now + 0.1);
        },
        playUIConfirm: () => { if (!isInitialized) return; synths.uiConfirm.triggerAttackRelease('C6', '16n'); }
    };
    return publicApi;
})();


// --- DATA & PROMPTS ---
const defaultPrompts = { truthPrompts: { normal: [ "Would you remarry if your partner died?", "Do you ever regret marrying your partner?", "What's your biggest regret? Explain.", "What's your favorite thing that your partner does for you?", "What do you envision the next 50 years with your partner being like? Explain in great detail.", "Tell your partner something that they need to improve on. Go into great detail.", "What's one thing you're scared to ask me, but really want to know?", "What is a secret you've kept from your parents?", "Describe a dream you've had about me.", "If you could change one thing about our history, what would it be?", "What's the most childish thing you still do?", "What do you think is your partner's biggest strength?", "If money didn't matter, what would you want your partner to do with their life?", "What song always makes you think of your partner?", "What was your happiest childhood memory?", "What's one thing you've always wanted to tell your partner, but never have?", "What scares you most about the future with your partner?", "What's one thing you wish you and your partner could do more often?", "If you could relive one day of your relationship, which would it be?" ], spicy: [ "What's your favorite part of your partner's body?", "Describe a time they turned you on without even realizing it.", "Tell me a sexual fantasy involving us you've never shared.", "What's the most embarrassing thing that's ever happened to you during sex?", "Who's the best sexual partner you've ever had? And why?", "Name a celebrity you've had a sexual fantasy about.", "If you could only do one sex act for the rest of your life, what would it be?", "Have you ever cheated on a partner?", "Have you ever faked an orgasm with your current partner?", "Tell your partner what you're thinking about in great detail, when you're horny prior to sex.", "What's the naughtiest thought you've had about me this week?", "Rank your top three favorite positions.", "What's one thing you want me to do to you in bed more often?", "What's the sexiest dream you've ever had about your partner?", "What's the dirtiest compliment you secretly want from your partner?", "Where's the riskiest place you'd want to fool around with your partner?", "If you could make your partner wear any outfit for you, what would it be?", "What's your favorite way your partner touches you when you want it to lead to sex?", "What's a fantasy involving your partner you've never admitted out loud?", "If you could freeze time, what would you do to your partner while no one else was watching?", "What's a kink you're curious about but nervous to try with your partner?", "Which body part of your partner do you think about most when they're not around?", "What's your favorite way your partner has teased you without realizing it?" ], extreme: [ "Describe your partner's genitals in great detail.", "Which ex would you most likely allow to have a threesome with you and your partner?", "Which ex looked the best naked?", "Describe a sexual experience with an ex in great detail.", "Have you ever masturbated in an inappropriate time or place?", "What do you want to do to your partner right now? Be detailed.", "Tell your partner any ways that they can improve in bed.", "What is the biggest lie you have ever told me?", "Have you ever considered leaving me? If so, why?", "Describe the most intense orgasm you've ever had, with or without me.", "What is something you've never told anyone about your sexual history?", "Describe, in detail, your perfect sexual scenario with your partner.", "What's the nastiest thought you've ever had about your partner in public?", "If you could film yourself and your partner doing anything in bed, what would you want captured?", "What's the dirtiest porn search you've ever typed that you'd want to try with your partner?", "Which of your partner's friends have you thought about sexually (even fleetingly)?", "What's the roughest or wildest thing you secretly want your partner to do to you?", "What's your most shameful fantasy you'd never tell your partner's family?", "If you could erase one sexual experience from your past before meeting your partner, what would it be?", "What do you imagine when you masturbate that you haven't told your partner?" ] }, darePrompts: { normal: [ "Take a cute selfie with your partner.", "Give your best impression of your partner.", "Let your partner tickle you for 30 seconds.", "Give your partner a shoulder rub for 3 minutes.", "Do a somersault.", "Do 10 jumping jacks.", "Give your partner a hug, as if they were dying.", "Post a picture of your partner on social media with a loving caption.", "Let your partner draw a temporary tattoo on you with a pen.", "Serenade your partner with a love song, even if you can't sing.", "Do your best runway walk for your partner.", "Take a silly selfie right now and show your partner.", "Speak in an accent for the next 2 rounds with your partner.", "Tell your partner two truths and a lie.", "Share your screen time stats with your partner.", "Do your best dance move for your partner for 20 seconds.", "Hug a pillow and pretend it's your partner for one minute.", "Let your partner pick a silly nickname for you for the rest of the game.", "Text a random emoji to a friend and show your partner the reply.", "Sing your favorite chorus from memory to your partner.", "Pretend to be your partner for one round." ], spicy: [ "Give me a passionate kiss, as if we haven't seen each other in a month.", "Whisper what you want to do to me later tonight in my ear.", "Gently remove one item of my clothing.", "Sit in your partner's lap for 3 rounds.", "Touch your partner through their clothes until they're aroused.", "Take a sexy selfie in only your underwear and send it to your partner.", "Flash your partner a private part of your choosing.", "Explain in graphic detail how you like to masturbate.", "Give your partner a topless lap dance.", "Gently kiss your partner's naked genitals.", "Let me choose an item of your clothing for you to remove.", "Give your partner a hickey somewhere they can hide it.", "Describe how you would tease me if we were in public right now.", "Describe out loud how you'd undress your partner right now.", "Let your partner choose a body part for you to kiss.", "Show your partner how you'd seduce them in public without anyone noticing.", "Whisper something filthy in your partner's ear.", "Stroke your partner's hand or arm like you would in foreplay.", "Show your partner your sexiest facial expression.", "Bite your lip and hold eye contact with your partner for 30 seconds.", "Kiss your partner as if it were your first time.", "Moan your partner's name in a way that turns them on." ], extreme: [ "Give your partner a hand job for 3 minutes.", "Sit on your partner's face, or let them sit on your face for 3 minutes.", "Soak for 5 minutes.", "Masturbate for 5 minutes while watching porn that your partner picked.", "Edge your partner twice.", "Perform oral sex on your partner for 2 minutes.", "Use a sex toy on your partner for 3 minutes.", "Allow your partner to use any sex toy they'd like on your for the next 5 minutes.", "Wear a butt plug for the next 10 minutes.", "Let your partner tie you up for 5 minutes and do what they want.", "Roleplay a fantasy of your partner's choosing for 5 minutes.", "Take a nude photo and send it to your partner right now.", "Lick or suck on a body part your partner chooses.", "Let your partner spank you as hard as they want 5 times.", "Send your partner a dirty voice note moaning their name.", "Simulate oral sex on your fingers for 30 seconds in front of your partner.", "Strip completely naked and pose however your partner says.", "Show your partner how you masturbate, in detail.", "Act out your favorite porn scene with your partner.", "Put something of your partner's in your mouth and treat it like foreplay.", "Let your partner tie your hands for the next 3 rounds.", "Edge yourself while your partner watches for 2 minutes.", "Edge your partner while you watch for 2 minutes." ] }, triviaQuestions: { normal: [ "What is your partner's birthday?", "What is your partner's favorite show?", "What is their biggest insecurity?", "What is your partner's biggest fear?", "What is their dream job if money were no object?", "What is one thing your partner has always wanted to try but hasn't yet?", "What is the first gift you gave each other?", "What is your partner's favorite childhood cartoon?", "What is the name of your partner's first pet?", "What is your partner's favorite board game?", "Would you rather go into the past and meet your ancestors or go into the future and meet your great-great grandchildren?", "What was their favorite band in high school?", "What do they love most about themselves?", "What do they love the most about you?", "What's my favorite animal?", "If they could haunt anyone as a ghost, who would it be?", "What is their dream vacation?", "What accomplishment are they most proud of?", "What historical figure would they most want to have lunch with?", "What is their least favorite food?", "What's your partner's go-to comfort food?", "What movie does your partner always want to rewatch?", "What's your partner's biggest pet peeve?", "Which holiday does your partner love the most?", "What's your partner's dream car?", "What color does your partner secretly dislike wearing?", "Who was your partner's first celebrity crush?", "What's your partner's most annoying habit (to you)?", "If your partner could instantly master one skill, what would it be?" ] }, consequences: { normal: [ "You have to call your partner a name of their choosing for the rest of the game.", "Every wrong answer for the rest of the game gets you tickled for 20 seconds.", "Go get your partner a drink.", "Make your partner a snack.", "You have to end every sentence with 'my love' for the next 3 rounds.", "Give your partner your phone and let them send one playful text to anyone.", "Compliment your partner 5 times in a row.", "Give your partner control of the TV remote tonight.", "Swap seats with your partner for the next round.", "Tell your partner a secret you've never told them.", "Let your partner take an unflattering picture of you.", "You can only answer your partner with 'yes, my love' until your next turn.", "Wear a silly hat (or make one) until the game ends with your partner.", "Post a sweet compliment about your partner on social media." ], spicy: [ "Play the next 3 rounds topless.", "For the next 5 rounds, every time it's your turn, you have to start by kissing your partner.", "Your partner gets to give you one command, and you must obey.", "Play the next 3 rounds bottomless.", "Every wrong answer or refusal requires you to send your partner a nude picture for the rest of the game. Even your partner's wrong answers.", "Remove an article of clothing each round for the remainder of the game.", "Do ten jumping jacks completely naked.", "Swap clothes with your partner for the remainder of the game.", "Your partner gets to spank you, as hard as they want, 5 times.", "Kiss your partner somewhere unexpected.", "Tell your partner your dirtiest thought in the last 24 hours.", "For the next round, sit on your partner's lap.", "Let your partner bite or nibble a place of their choice.", "You have to let your partner mark you with lipstick or a marker.", "Show your partner your favorite sex position (with clothes on).", "Tease your partner without kissing for 1 minute.", "Send your partner a sexy text right now while sitting next to them.", "Give your partner a 1-minute lap dance." ], extreme: [ "Wear a butt plug for the remainder of the game.", "Record yourself masturbating right now and send it to your partner.", "Use a sex toy of your partner's choosing for the remainder of the game.", "Edge yourself for the remainder of the game.", "Allow your partner to act out a fantasy of theirs, and you can't say no.", "You must perform any sexual act your partner demands, right now.", "Send your partner the filthiest nude you've ever taken.", "Use your tongue on any body part your partner picks.", "Strip completely and stay that way until the round ends with your partner.", "Let your partner spank or choke you until they're satisfied.", "Put on a show of how you like to be touched for your partner.", "Allow your partner to record 30 seconds of you doing something sexual.", "Play with a toy in front of your partner right now.", "Moan out loud for 1 minute straight for your partner.", "Let your partner pick your sexual punishment and don't complain." ] } };

/* --- SECRET ROUND (KATY) --- */
const secretRoundPrompts = [
    {
        type: 'secret',
        text: 'Will you love Aaron forever?',
        outcomes: {
            accept: {
                title: 'Forever Yours 💜',
                message: 'When we met four years ago, I was lost. I had nothing to give to anyone, not even myself. I was the empty shell of the man I used to be. But when you came along, I realized that the man I used to be was empty as well. You have made me a better man, a better father, and a better person than I ever thought I could be. I’ve had my struggles as of late, and I’ve doubted myself, my abilities, and my choices. But one thing I’ve never doubted is you. You’ve been the one constant in a sea of chaos, and I love you more than I ever thought I could love something. Happy four years, and here’s to another sixty!',
            },
            refuse: {
                title: 'A Hesitant Heart 💔',
                message: 'Even though you pressed refuse, I know you don’t mean it. You think you’re so funny! When we met four years ago, I was lost. I had nothing to give to anyone, not even myself. I was the empty shell of the man I used to be. But when you came along, I realized that the man I used to be was empty as well. You have made me a better man, a better father, and a better person than I ever thought I could be. I’ve had my struggles as of late, and I’ve doubted myself, my abilities, and my choices. But one thing I’ve never doubted is you. You’ve been the one constant in a sea of chaos, and I love you more than I ever thought I could love something. Happy four years, and here’s to another sixty!',
            },
        },
    },
    {
        type: 'secret',
        text: 'I dare you to love Aaron forever.',
        outcomes: {
            accept: {
                title: 'Forever Yours 💜',
                message: 'When we met four years ago, I was lost. I had nothing to give to anyone, not even myself. I was the empty shell of the man I used to be. But when you came along, I realized that the man I used to be was empty as well. You have made me a better man, a better father, and a better person than I ever thought I could be. I’ve had my struggles as of late, and I’ve doubted myself, my abilities, and my choices. But one thing I’ve never doubted is you. You’ve been the one constant in a sea of chaos, and I love you more than I ever thought I could love something. Happy four years, and here’s to another sixty!',
            },
            refuse: {
                title: 'A Hesitant Heart 💔',
                message: 'Even though you pressed refuse, I know you don’t mean it. You think you’re so funny! When we met four years ago, I was lost. I had nothing to give to anyone, not even myself. I was the empty shell of the man I used to be. But when you came along, I realized that the man I used to be was empty as well. You have made me a better man, a better father, and a better person than I ever thought I could be. I’ve had my struggles as of late, and I’ve doubted myself, my abilities, and my choices. But one thing I’ve never doubted is you. You’ve been the one constant in a sea of chaos, and I love you more than I ever thought I could love something. Happy four years, and here’s to another sixty!',
            },
        },
    },
];

const cloneDefaultPrompts = () => structuredClone(defaultPrompts);

const hasArrayBuckets = (bucket, keys) => {
    if (!bucket || typeof bucket !== 'object') return false;
    return keys.every((key) => Array.isArray(bucket[key]));
};

// RELIABILITY: Normalize stored prompt payloads to avoid malformed queue crashes.
const normalizeStoredPrompts = (value) => {
    const defaults = cloneDefaultPrompts();
    if (!value || typeof value !== 'object') {
        return defaults;
    }
    try {
        const truthValid = hasArrayBuckets(value.truthPrompts, ['normal', 'spicy', 'extreme']);
        const dareValid = hasArrayBuckets(value.darePrompts, ['normal', 'spicy', 'extreme']);
        const triviaValid = hasArrayBuckets(value.triviaQuestions, ['normal']);
        const consequenceValid = hasArrayBuckets(value.consequences, ['normal', 'spicy', 'extreme']);

        if (!(truthValid && dareValid && triviaValid && consequenceValid)) {
            return defaults;
        }

        return {
            ...defaults,
            ...value,
            truthPrompts: { ...defaults.truthPrompts, ...value.truthPrompts },
            darePrompts: { ...defaults.darePrompts, ...value.darePrompts },
            triviaQuestions: { ...defaults.triviaQuestions, ...value.triviaQuestions },
            consequences: { ...defaults.consequences, ...value.consequences },
        };
    } catch (err) {
        console.warn('[Reliability] Failed to normalize stored prompts, using defaults instead.', err);
        return defaults;
    }
};

const useLocalStoragePrompts = () => {
    // RELIABILITY: Initialize prompt state with normalized defaults.
    const [prompts, setPrompts] = useState(() => cloneDefaultPrompts());
    // RELIABILITY: Track async prompt hydration status.
    const [isPromptsLoading, setIsPromptsLoading] = useState(true);

    // RELIABILITY: hydrate prompts from IndexedDB store on mount.
    useEffect(() => {
        let isActive = true;
        (async () => {
            try {
                const stored = await dbStore.getPrompt('prompts');
                if (stored) {
                    const normalized = normalizeStoredPrompts(stored);
                    if (isActive) {
                        setPrompts(normalized);
                    }
                    return;
                }

                const legacy = localStorage.getItem('prompts');
                if (legacy) {
                    try {
                        const parsed = JSON.parse(legacy);
                        const normalized = normalizeStoredPrompts(parsed);
                        if (isActive) {
                            setPrompts(normalized);
                        }
                        await dbStore.setPrompt('prompts', normalized);
                        localStorage.removeItem('prompts');
                        return;
                    } catch (err) {
                        // RELIABILITY: visibility into malformed legacy prompt payloads.
                        console.warn('[Reliability] Failed to parse legacy prompts during hydration', err);
                    }
                }

                if (isActive) {
                    setPrompts(cloneDefaultPrompts());
                }
            } catch (err) {
                // RELIABILITY: detect IndexedDB hydration failures promptly.
                console.warn('[Reliability] Failed to hydrate prompts from IndexedDB', err);
            } finally {
                if (isActive) {
                    setIsPromptsLoading(false);
                }
            }
        })();

        return () => {
            isActive = false;
        };
    }, []);

    // RELIABILITY: Keep prompts persisted when mutated.
    const updatePrompts = (newPrompts) => {
        const normalized = normalizeStoredPrompts(newPrompts);
        setPrompts(normalized);
        // RELIABILITY: persist normalized prompts through IndexedDB store.
        dbStore.setPrompt('prompts', normalized);
    };

    // RELIABILITY: Reset prompts to defaults and persist immediately.
    const resetPrompts = () => {
        const defaults = cloneDefaultPrompts();
        setPrompts(defaults);
        // RELIABILITY: persist reset prompts through IndexedDB store.
        dbStore.setPrompt('prompts', defaults);
    };

    return {
        prompts,
        updatePrompts,
        resetPrompts,
        isLoading: isPromptsLoading,
    };
};

const useParallax = (strength = 10) => {
    const ref = useRef(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const springX = useSpring(x, { stiffness: 300, damping: 30 });
    const springY = useSpring(y, { stiffness: 300, damping: 30 });

    const rotateX = useTransform(springY, [-0.5, 0.5], [`${strength}deg`, `-${strength}deg`]);
    const rotateY = useTransform(springX, [-0.5, 0.5], [`-${strength}deg`, `${strength}deg`]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        
        let ticking = false;

        const handleMouseMove = (e) => {
            if (!ticking) {
                ticking = true;
                window.requestAnimationFrame(() => {
                    const rect = el.getBoundingClientRect();
                    const width = rect.width;
                    const height = rect.height;
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    const xPct = mouseX / width - 0.5;
                    const yPct = mouseY / height - 0.5;
                    x.set(xPct);
                    y.set(yPct);
                    ticking = false;
                });
            }
        };

        const handleMouseLeave = () => {
            x.set(0);
            y.set(0);
        };

        el.addEventListener("mousemove", handleMouseMove);
        el.addEventListener("mouseleave", handleMouseLeave);
        return () => {
            if (el) {
                el.removeEventListener("mousemove", handleMouseMove);
                el.removeEventListener("mouseleave", handleMouseLeave);
            }
        };
    }, [x, y]);

    return { ref, style: { rotateX, rotateY, transformStyle: "preserve-3d" } };
};

const CloseIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>);
const SettingsIcon = React.memo(() => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1.51-1V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V12c0 .36.05.7.14 1.03.22.84.97 1.34 1.77 1.34h.09a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09A1.65 1.65 0 0 0 19.4 15z"></path></svg>));
const SpeakerIcon = React.memo(({ muted }) => ( muted ? (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="22" y1="9" x2="16" y2="15"></line><line x1="16" y1="9" x2="22" y2="15"></line></svg>) : (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>) ));
const CustomPromptIcon = React.memo(() => (<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--theme-highlight)] opacity-70" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>));
const TrashIcon = React.memo(() => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#F777B6] hover:text-[#FFC0CB]" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>));
const SpinLoader = () => (<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="animate-spin" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" strokeDasharray="16 12" opacity="0.4"></circle><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" strokeDasharray="56.548" strokeDashoffset="42.411" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" /></circle></svg>);

const hexToRgb = (hex) => {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};

const ParticleBackground = React.memo(({ currentTheme, pulseLevel, bpm, reducedMotion, style }) => {
    const canvasRef = useRef(null);
    const animationFrameId = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let width, height, particles = [];
        let isHidden = document.hidden;

        canvas.style.position = 'fixed';
        canvas.style.inset = '0';

        const handleVisibilityChange = () => {
            isHidden = document.hidden;
            if (!isHidden && !reducedMotion && !animationFrameId.current) {
                animationFrameId.current = requestAnimationFrame(animate);
            }
        };
        
        const isMobile = window.innerWidth < 768;
        
        const themeConfig = {
            velourNights: { num: isMobile ? 80 : 120, palette: ['#F777B6', '#FFD700', '#FFFFFF'], type: 'ember' },
            lotusDreamscape: { num: isMobile ? 60 : 100, palette: ['#6A5ACD', '#FFFFFF', '#ADD8E6'], type: 'mote' },
            velvetCarnival: { num: isMobile ? 100 : 150, palette: ['#FFD700', '#FF4500', '#FFFFFF', '#F777B6'], type: 'confetti' },
            starlitAbyss: { num: isMobile ? 150 : 250, palette: ['#FFFFFF', '#E6E6FA', '#D8BFD8'], type: 'star' },
            crimsonFrenzy: { num: isMobile ? 80 : 120, palette: ['#FFD700', '#DC2626', '#FF4500'], type: 'spark' },
            lavenderPromise: { num: isMobile ? 120 : 280, palette: ['#b8a1ff', '#e2d4ff', '#f2e6ff'], type: 'slowFloat' },
            foreverPromise: { num: isMobile ? 120 : 280, palette: ['#B88BFF', '#E8D8FF', '#6B45C6'], type: 'slowFloat' }
        };

        const activeConfig = themeConfig[currentTheme] || themeConfig.velourNights;
        
        const drawStatic = () => {
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            ctx.clearRect(0, 0, width, height);
            const staticConfig = themeConfig[currentTheme] || themeConfig.starlitAbyss;
            const numStaticStars = staticConfig.num / 3;
            for (let i = 0; i < numStaticStars; i++) {
                const color = staticConfig.palette[Math.floor(Math.random() * staticConfig.palette.length)];
                ctx.fillStyle = color;
                const x = Math.random() * width;
                const y = Math.random() * height;
                const r = Math.random() * 1.2;
                ctx.globalAlpha = Math.random() * 0.5 + 0.1;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        };
        
        const createParticles = () => {
            particles = [];
            for (let i = 0; i < activeConfig.num; i++) {
                particles.push(new Particle(i));
            }
        };

        const resizeCanvas = () => {
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            const w = window.innerWidth;
            const h = window.innerHeight;
            canvas.width = Math.max(1, Math.floor(w * ratio));
            canvas.height = Math.max(1, Math.floor(h * ratio));
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            width = w; 
            height = h;
            if (reducedMotion) drawStatic(); else createParticles();
        };

        if (reducedMotion) {
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
            return () => {
                window.removeEventListener('resize', resizeCanvas);
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange);

        class Particle {
            constructor(i) {
                this.index = i;
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.layer = Math.random();
                const baseColorHex = activeConfig.palette[Math.floor(Math.random() * activeConfig.palette.length)];
                this.baseColorRgb = hexToRgb(baseColorHex);
                this.type = activeConfig.type;
                this.initType();
            }

            initType() {
                const intensity = pulseLevel / 100;
                let speedMultiplier = 1;
                if (pulseLevel > 80) speedMultiplier = 1.8;
                else if (pulseLevel > 50) speedMultiplier = 1.5;

                switch(this.type) {
                    case 'star':
                        this.radius = Math.random() * (this.layer > 0.6 ? 1.2 : 0.7) + 0.1;
                        this.speedX = Math.max(-0.5, Math.min(0.5, (Math.random() - 0.5) * 0.05 * this.layer * speedMultiplier));
                        this.speedY = Math.max(-0.5, Math.min(0.5, (Math.random() - 0.5) * 0.05 * this.layer * speedMultiplier));
                        this.shadowBlur = this.radius * 3 + (intensity * 3);
                        this.baseAlpha = 0.2 + this.layer * 0.8;
                        break;
                    case 'ember':
                    case 'spark':
                        this.radius = Math.random() * 1.5 + 0.5;
                        this.speedX = Math.max(-0.5, Math.min(0.5, (Math.random() - 0.5) * (0.1 + intensity * 0.3) * speedMultiplier));
                        this.speedY = Math.max(-0.5, Math.min(0.5, -Math.random() * (0.3 + intensity * 0.7) * speedMultiplier));
                        this.shadowBlur = this.radius * 4 + (intensity * 4);
                        this.baseAlpha = Math.random() * 0.5 + 0.2;
                        this.life = Math.random() * 50 + 50;
                        break;
                    case 'slowFloat':
                        this.radius = Math.random() * 1.5 + 0.5;
                        this.speedX = (Math.random() - 0.5) * 0.1;
                        this.speedY = -(Math.random() * 0.2 + 0.1);
                        this.shadowBlur = this.radius * 5;
                        this.baseAlpha = Math.random() * 0.4 + 0.3;
                        break;
                    default: // mote, confetti
                        this.radius = Math.random() * (this.type === 'confetti' ? 2.5 : 1.5) + 0.5;
                        this.speedX = Math.max(-0.5, Math.min(0.5, (Math.random() - 0.5) * (0.2 + intensity * 0.4) * speedMultiplier));
                        this.speedY = Math.max(-0.5, Math.min(0.5, (Math.random() - 0.5) * (0.2 + intensity * 0.4) * speedMultiplier));
                        this.shadowBlur = this.radius * 2;
                        this.baseAlpha = Math.random() * 0.6 + 0.1;
                }
            }

            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                
                if (this.type === 'ember' || this.type === 'spark') {
                    this.life--;
                    if(this.life <= 0) {
                        this.x = Math.random() * width;
                        this.y = height + this.radius * 2;
                        this.life = Math.random() * 50 + 50;
                        this.baseAlpha = Math.random() * 0.5 + 0.2;
                    }
                } else {
                     if (this.x < -this.radius) this.x = width + this.radius;
                     if (this.x > width + this.radius) this.x = -this.radius;
                     if (this.y < -this.radius) this.y = height + this.radius;
                     if (this.y > height + this.radius) this.y = -this.radius;
                }
            }

            draw(frameCount) {
                const beatDuration = 60 / bpm;
                const bpmFactor = Math.max(0.8, Math.min(1.4, 1 / beatDuration));
                const twinkleSpeed = (0.005 + (this.index % 10) * 0.001) * bpmFactor;

                const twinkleValue = this.type === 'star' ? 0.5 + 0.5 * Math.abs(Math.sin(frameCount * twinkleSpeed + this.index)) : 1;
                let alpha = this.baseAlpha * twinkleValue;
                if(this.type === 'ember' || this.type === 'spark') alpha *= this.life / 50;
                
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                const color = `rgba(${this.baseColorRgb.r}, ${this.baseColorRgb.g}, ${this.baseColorRgb.b}, ${alpha})`;
                
                if (pulseLevel > 80 && this.type !== 'slowFloat') {
                    ctx.shadowBlur = this.radius * 6; // Streak effect
                    ctx.shadowColor = `rgba(${this.baseColorRgb.r}, ${this.baseColorRgb.g}, ${this.baseColorRgb.b}, ${alpha * 0.5})`;
                } else {
                    ctx.shadowBlur = this.shadowBlur;
                    ctx.shadowColor = `rgba(${this.baseColorRgb.r}, ${this.baseColorRgb.g}, ${this.baseColorRgb.b}, 0.8)`;
                }
                
                ctx.fillStyle = color;
                ctx.fill();
            }
        }
        
        let frameCount = 0;
        const animate = () => { 
            if (isHidden || !canvasRef.current || reducedMotion) {
                animationFrameId.current = null;
                return;
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height); 
            particles.forEach(p => { p.update(); p.draw(frameCount); }); 
            frameCount++;
            animationFrameId.current = requestAnimationFrame(animate); 
        };

        resizeCanvas(); 
        animate();
        
        window.addEventListener('resize', resizeCanvas);
        
        return () => { 
            window.removeEventListener('resize', resizeCanvas); 
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = null;
            }
        };
    }, [currentTheme, pulseLevel, bpm, reducedMotion]);

    return <canvas ref={canvasRef} className="particle-canvas" style={style}></canvas>;
});

const Confetti = ({ onFinish, origin, theme, reducedMotion }) => {
    const canvasRef = useRef(null);
    const originRef = useRef(origin);

    useEffect(() => {
        originRef.current = origin;
    }, [origin]);

    useEffect(() => {
        if (reducedMotion) {
            if (onFinish) onFinish();
            return;
        }

        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        
        const resizeConfetti = () => {
            let width = canvas.offsetWidth;
            let height = canvas.offsetHeight;
            canvas.width = width * ratio;
            canvas.height = height * ratio;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        };
        window.addEventListener('resize', resizeConfetti);
        resizeConfetti();
        
        const themePalettes = {
            velourNights: ['#F777B6', '#FFD700', '#FFFFFF'],
            lotusDreamscape: ['#6A5ACD', '#FFFFFF', '#ADD8E6'],
            velvetCarnival: ['#FFD700', '#FF4500', '#FFFFFF'],
            starlitAbyss: ['#FFFFFF', '#E6E6FA', '#D8BFD8'],
            crimsonFrenzy: ['#FFD700', '#DC2626', '#FFFFFF'],
            lavenderPromise: ['#b8a1ff', '#e2d4ff', '#f2e6ff'],
            foreverPromise: ['#B88BFF', '#E8D8FF', '#6B45C6']
        };
        const colors = themePalettes[theme] || themePalettes.velourNights;

        const particles = [];
        const particleCount = 200;
        const gravity = 0.1;
        const friction = 0.98;
        
        const currentOriginX = originRef.current.x * canvas.offsetWidth;
        const currentOriginY = originRef.current.y * canvas.offsetHeight;

        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 4;
            particles.push({ 
                x: currentOriginX, 
                y: currentOriginY, 
                vx: Math.cos(angle) * speed, 
                vy: Math.sin(angle) * speed, 
                radius: Math.random() * 6 + 4, 
                color: colors[Math.floor(Math.random() * colors.length)], 
                tiltAngle: Math.random() * Math.PI, 
                tiltAngleIncrement: Math.random() * 0.1 - 0.05,
                alpha: 1
            });
        }
        
        let animationFrameId;
        const startTime = Date.now();
        const animate = () => {
            const allFaded = particles.every(p => p.alpha <= 0);
            if (Date.now() - startTime > 4000 || allFaded) { 
                if (animationFrameId) cancelAnimationFrame(animationFrameId); 
                if(onFinish) onFinish(); 
                return; 
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach((p) => {
                p.vy += gravity;
                p.vx *= friction;
                p.vy *= friction;
                p.x += p.vx;
                p.y += p.vy;
                p.alpha -= 0.005;
                p.tiltAngle += p.tiltAngleIncrement;
                
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.max(0, p.alpha);
                ctx.beginPath(); 
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.tiltAngle);
                ctx.fillRect(-p.radius/2, -p.radius, p.radius*2, p.radius*2);
                ctx.restore();
            });
            ctx.globalAlpha = 1;
            animationFrameId = requestAnimationFrame(animate);
        };
        animate();
        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', resizeConfetti);
            particles.length = 0;
        };
    }, [onFinish, theme, reducedMotion]);

    return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full z-[100] pointer-events-none" />;
};

const CATEGORIES = ['TRUTH', 'DARE', 'TRIVIA'];

const Wheel = React.memo(({onSpinFinish, onSpinStart, playWheelSpinStart, playWheelTick, playWheelStop, setIsSpinInProgress, currentTheme, canSpin, reducedMotion, safeOpenModal, handleThemeChange, setGameState, setSecretSticky, setIsSecretThemeUnlocked, isSpinInProgress, modalStateRef, registerWatchdogControl}) => {
    const [isSpinning, setIsSpinning] = useState(false);
    const [isPointerSettling, setIsPointerSettling] = useState(false);
    const rotationRef = useRef(0);
    const wheelCanvasRef = useRef(null);
  const secretPressTimerRef = useRef(null);
  const failsafeRef = useRef(null);
    const animationFrameRef = useRef(null);
    const spinLock = useRef(false);
    const lastSpinTimeRef = useRef(0);

    useEffect(() => {
        if (!registerWatchdogControl) return;
        // RELIABILITY: Surface finalize hook so watchdog routes through finishSpinNow.
        registerWatchdogControl({
            finish: (reason = 'watchdog') => finishSpinNow(reason),
            isLocked: () => !!spinLock.current,
        });
        return () => registerWatchdogControl(null);
    }, [registerWatchdogControl, finishSpinNow]);

    const finalizeSpin = useCallback((reason = 'complete') => {
        const rotation = rotationRef.current;
        const sliceAngle = 360 / CATEGORIES.length;
        const normalizedAngle = (-rotation + 90 + 360) % 360;
        const EPSILON = 0.0001;
        const sliceIndex = Math.round((normalizedAngle + EPSILON) / sliceAngle) % CATEGORIES.length;
        // RELIABILITY: capture raw winner before normalization
        const rawWinner = CATEGORIES[sliceIndex];
        // RELIABILITY: guard undefined winner/payload to prevent .toLowerCase() crash
        if (typeof rawWinner !== 'string' || !rawWinner) {
            console.warn("[Reliability] Invalid winner payload:", rawWinner);
            return;
        }
        // RELIABILITY: safe normalization of winner label
        const winner = rawWinner.toLowerCase();
        // DIAGNOSTIC: verify winner dispatch target is callable before invoking
        if (typeof onSpinFinish !== 'function') {
            console.warn('[DIAGNOSTIC][App.jsx][Wheel.finalizeSpin] onSpinFinish handler missing:', onSpinFinish);
            return;
        }
        onSpinFinish(winner, { source: reason });
    }, [onSpinFinish]);

    const finishSpinNow = useCallback((reason = 'complete') => {
        if (!spinLock.current) return; // Already finalized or never started

        try {
            playWheelStop();
            finalizeSpin(reason);
        } finally {
            if (failsafeRef.current) { clearTimeout(failsafeRef.current); failsafeRef.current = null; }
            if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }

            setIsSpinning(false);
            setIsPointerSettling(true);
            setTimeout(() => { setIsPointerSettling(false); }, 500);
            spinLock.current = false;
            setIsSpinInProgress(false);
        }
    }, [finalizeSpin, playWheelStop, setIsSpinInProgress]);

    // RELIABILITY: Force finalize when visibility changes or page hides mid-spin.
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden && spinLock.current) {
                finishSpinNow('visibility');
            }
        };
        const handlePageHide = () => {
            if (spinLock.current) {
                finishSpinNow('pagehide');
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('pagehide', handlePageHide);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('pagehide', handlePageHide);
        };
    }, [finishSpinNow]);

    useEffect(() => () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
    }, []);

    useEffect(() => {
        const handler = setTimeout(() => {
            if (reducedMotion && wheelCanvasRef.current && !spinLock.current) {
                wheelCanvasRef.current.style.transform = 'none';
            }
        }, 100);

        return () => clearTimeout(handler);
    }, [reducedMotion]);

    const drawWheel = useMemo(() => (ctx, size) => {
        if (!ctx) return;
        const center = size / 2;
        const radius = Math.max(0, center - 15);
        const hubRadius = size / 11.5;
        const arc = (2 * Math.PI) / CATEGORIES.length;
        
        ctx.clearRect(0, 0, size, size);

        const themePalettes = {
            velourNights: { rim: { base: '#D4AF37', high: '#FFD700', low: '#7A5C00' }, slices: { DARE: { base: "#DC143C", high: "#FF6F91", low: "#7A1C1C" }, TRUTH: { base: "#6A0DAD", high: "#B266FF", low: "#2E003E" }, TRIVIA: { base: "#D4AF37", high: "#FFD700", low: "#7A5C00" } } },
            lotusDreamscape: { rim: { base: '#C0C0C0', high: '#E6E6FA', low: '#5A5A7A' }, slices: { DARE: { base: "#DA70D6", high: "#FFB7FF", low: "#5A2D6A" }, TRUTH: { base: "#4169E1", high: "#7AA2FF", low: "#1A1A66" }, TRIVIA: { base: "#C0C0C0", high: "#E6E6FA", low: "#5A5A7A" } } },
            velvetCarnival: { rim: { base: '#FF4500', high: '#FF944D', low: '#662200' }, slices: { DARE: { base: "#FF4500", high: "#FF944D", low: "#662200" }, TRUTH: { base: "#9B111E", high: "#FF4C5B", low: "#400000" }, TRIVIA: { base: "#D4AF37", high: "#FFD700", low: "#7A5C00" } } },
            starlitAbyss: { rim: { base: '#4C4A9E', high: '#8A2BE2', low: '#1C1030' }, slices: { DARE: { base: "#483D8B", high: "#8A2BE2", low: "#1C1030" }, TRUTH: { base: "#191970", high: "#4169E1", low: "#0A0A33" }, TRIVIA: { base: "#6C5CE7", high: "#A29BFE", low: "#2D3436" } } },
            crimsonFrenzy: { rim: { base: '#8B0000', high: '#DC143C', low: '#3D0000' }, slices: { DARE: { base: '#DC143C', high: '#FF6F91', low: '#7A1C1C' }, TRUTH: { base: "#483D8B", high: "#8A2BE2", low: "#1C1030" }, TRIVIA: { base: "#D4AF37", high: "#FFD700", low: "#7A5C00" } } },
            lavenderPromise: {
              rim: { base: '#5B2E99', high: '#E8D8FF', low: '#311A63' },
              slices: {
                DARE:   { base: '#8F5CFF', high: '#E8D8FF', low: '#4B2AA6' },
                TRUTH:  { base: '#7D4FFF', high: '#E4D0FF', low: '#3F1D8B' },
                TRIVIA: { base: '#9C70FF', high: '#F3ECFF', low: '#5630B8' }
              }
            },
            foreverPromise: { 
                rim: { base: '#835cae', high: '#e6e6fa', low: '#4F377A' }, 
                slices: { 
                    DARE: { base: "#835cae", high: "#eeade6", low: "#624A87" }, 
                    TRUTH: { base: "#835cae", high: "#e6e6fa", low: "#624A87" }, 
                    TRIVIA: { base: "#835cae", high: "#EADDF8", low: "#624A87" } 
                } 
            }
        };

        const activePalette = themePalettes[currentTheme] || themePalettes.velourNights;
        const rimColors = activePalette.rim;

        CATEGORIES.forEach((category, i) => {
            const sliceColorSet = activePalette.slices[category];
            if (!sliceColorSet) return;
            const { base, high, low } = sliceColorSet;
            const startAngle = i * arc - Math.PI / 2 - (arc / 2); // Center categories
            const endAngle = (i + 1) * arc - Math.PI / 2 - (arc / 2);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(center, center);
            if (radius > 0) ctx.arc(center, center, radius, startAngle, endAngle);
            ctx.closePath();
            
            const grad = ctx.createRadialGradient(center, center, hubRadius, center, center, radius);
            grad.addColorStop(0, high);
            grad.addColorStop(0.8, base);
            grad.addColorStop(1, low);
            ctx.fillStyle = grad;
            ctx.fill();

            ctx.clip();
            const stripeGrad = ctx.createLinearGradient(0,0,size,size);
            stripeGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
            stripeGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
            stripeGrad.addColorStop(1, 'rgba(255,255,255,0.08)');
            ctx.fillStyle = stripeGrad;
            
            ctx.save();
            ctx.translate(center, center);
            ctx.rotate(Math.PI / 6);
            ctx.fillRect(-size, -size/4, size*2, size/2);
            ctx.rotate(-Math.PI / 3);
            ctx.fillRect(-size, -size/4, size*2, size/2);
            ctx.restore();
            ctx.restore();
        });
        
        for(let i=0; i < CATEGORIES.length; i++) {
            const angle = i * arc - Math.PI / 2 - (arc / 2);
            ctx.save();
            ctx.translate(center, center);
            ctx.rotate(angle);

            ctx.beginPath();
            ctx.moveTo(hubRadius - 5, 0);
            ctx.lineTo(radius + 2, 0);
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(hubRadius - 5, -1);
            ctx.lineTo(radius + 2, -1);
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }

        const rimWidth = 8;
        ctx.strokeStyle = rimColors.low;
        ctx.lineWidth = rimWidth + 2;
        const host = document.getElementById('app-container') || document.documentElement;
        const themeHighlight = getComputedStyle(host).getPropertyValue('--theme-highlight').trim() || '#FFD700';
        ctx.shadowColor = themeHighlight;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        if (radius > 0) ctx.arc(center, center, radius + rimWidth / 2, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.shadowBlur = 0;

        const rimGrad = ctx.createLinearGradient(center - radius, center - radius, center + radius, center + radius);
        rimGrad.addColorStop(0, rimColors.high);
        rimGrad.addColorStop(0.5, rimColors.base);
        rimGrad.addColorStop(1, rimColors.low);
        ctx.strokeStyle = rimGrad;
        ctx.lineWidth = rimWidth;
        ctx.beginPath();
        if (radius > 0) ctx.arc(center, center, radius + rimWidth / 2, 0, 2 * Math.PI);
        ctx.stroke();
        
        for(let i=1; i <= 12; i++) {
            ctx.beginPath();
            if (radius > 0) ctx.arc(center, center, radius + (rimWidth/2) - (i*0.5), 0, 2*Math.PI);
            ctx.strokeStyle = `rgba(0,0,0,${i % 2 === 0 ? 0.1 : 0.05})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (radius > 0) ctx.arc(center, center, radius, 0, 2 * Math.PI);
        ctx.stroke();

        CATEGORIES.forEach((category, i) => {
            const textAngle = i * arc - Math.PI / 2;
            ctx.save();
            ctx.translate(center, center);
            ctx.rotate(textAngle);
            const fontSize = Math.max(20, size / 13);
            ctx.font = `800 ${fontSize}px 'Inter', sans-serif`;
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.9)';
            ctx.shadowBlur = 10;
            const textRadius = radius * 0.6;
            ctx.fillText(category, textRadius, 0);
            ctx.restore();
        });

    }, [currentTheme]);

    useEffect(() => {
        const canvas = wheelCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const container = canvas.parentElement;

        let resizeHandle;
        const resizeCanvas = () => {
             if (spinLock.current) return;
            const size = Math.max(280, Math.min(container.offsetWidth, container.offsetHeight, 480));
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            const needsResize = canvas.width !== size * ratio || canvas.height !== size * ratio;
            if (needsResize) {
                canvas.width = size * ratio;
                canvas.height = size * ratio;
                canvas.style.width = `${size}px`;
                canvas.style.height = `${size}px`;
                ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            }
            drawWheel(ctx, size);
        };
        
        // RELIABILITY: guard against browsers lacking FontFaceSet API
        const scheduleResize = () => {
            resizeHandle = requestAnimationFrame(resizeCanvas);
        };

        if (document.fonts?.ready) {
            document.fonts.ready.then(scheduleResize);
        } else {
            // RELIABILITY: fallback — schedule resize on next frame
            resizeHandle = requestAnimationFrame(resizeCanvas);
        }
        window.addEventListener('resize', resizeCanvas);

        return () => {
             window.removeEventListener('resize', resizeCanvas);
             if (resizeHandle) cancelAnimationFrame(resizeHandle);
        }
    }, [drawWheel]);

    const handleSpin = useCallback(() => {
        const now = Date.now();
        if (spinLock.current || !canSpin || now - lastSpinTimeRef.current < 2000) {
            return;
        }
        lastSpinTimeRef.current = now;
        spinLock.current = true; // Acquire lock

        if (window?.Tone?.context?.state === 'suspended') {
            // RELIABILITY: Resume audio on direct spin gesture after background suspension.
            resumeAudioOnGesture();
        }

        if (wheelCanvasRef.current) wheelCanvasRef.current.style.transition = 'none';
        
        setIsSpinning(true);
        setIsSpinInProgress(true);
        if (onSpinStart) {
            onSpinStart({ source: 'wheel' });
        }
        playWheelSpinStart();

        failsafeRef.current = setTimeout(() => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            console.warn('Failsafe spin timer triggered. Finalizing spin now.');
            rotationRef.current += (Math.random() * 180 - 90);
            if(wheelCanvasRef.current) wheelCanvasRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
            finishSpinNow('failsafe');
        }, 7000);

        if (reducedMotion) {
            const startAngle = rotationRef.current % 360;
            const spinDegrees = 360 + Math.random() * 360;
            const targetAngle = startAngle + spinDegrees;
            
            rotationRef.current = targetAngle;
            if (wheelCanvasRef.current) {
                wheelCanvasRef.current.style.transition = 'transform 0.5s ease-out';
                wheelCanvasRef.current.style.transform = `rotate(${targetAngle}deg)`;
            }

            playWheelTick();
            setTimeout(() => playWheelTick(), 80);

            setTimeout(() => {
                if (failsafeRef.current) { clearTimeout(failsafeRef.current); failsafeRef.current = null; }
                finishSpinNow('reducedMotion');
            }, 500);
            return;
        }

        const rand = Math.random();
        const duration = 4500 + rand * 1000;
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
        const start = performance.now();
        const startAngle = rotationRef.current % 360;
        const spinDegrees = 7200 + rand * 3600;
        const targetAngle = startAngle + spinDegrees;
        let lastTickAngle = startAngle;

        const animate = (now) => {
            if (!spinLock.current) {
                if (failsafeRef.current) { clearTimeout(failsafeRef.current); failsafeRef.current = null; }
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
                return;
            }

            const elapsed = now - start;
            const t = Math.min(elapsed / duration, 1);
            const eased = easeOutCubic(t);
            const currentAngle = startAngle + eased * spinDegrees;
            
            if(wheelCanvasRef.current) wheelCanvasRef.current.style.transform = `rotate(${currentAngle}deg)`;
            rotationRef.current = currentAngle;

            const TICK_DEGREES = 360 / CATEGORIES.length / 2;
            if (currentAngle - lastTickAngle >= TICK_DEGREES) {
                playWheelTick();
                lastTickAngle += TICK_DEGREES;
            }

            if (t < 1) {
                animationFrameRef.current = requestAnimationFrame(animate);
            } else {
                if (failsafeRef.current) { clearTimeout(failsafeRef.current); failsafeRef.current = null; }
                animationFrameRef.current = null;
                rotationRef.current = targetAngle;
                finishSpinNow('complete');
            }
        };
        animationFrameRef.current = requestAnimationFrame(animate);
    }, [canSpin, reducedMotion, playWheelSpinStart, playWheelTick, finishSpinNow, setIsSpinInProgress, onSpinStart]);


    return (
        <div className="wheel-container" role="img" aria-label="Game wheel">
            <canvas ref={wheelCanvasRef} className="wheel-canvas"></canvas>
            <div className="pointer">
                <motion.div
                    className="pointer-anim"
                    animate={isPointerSettling ? 'settle' : 'rest'}
                    variants={{
                        rest: { rotate: 0 },
                        settle: { rotate: [0, -3, 2.5, -1.5, 0.5, 0] },
                    }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    onAnimationComplete={() => setIsPointerSettling(false)}
                >
                    <div className="pointer-tip-outer">
                        <div className="pointer-tip-inner" />
                    </div>
                </motion.div>
            </div>
            <div
  className="spin-button-wrapper"
  onContextMenu={(e) => e.preventDefault()}
  onPointerDown={() => {
    if (!canSpin || spinLock.current) return;
    secretPressTimerRef.current = setTimeout(() => {
        const secretRoundPrompt = secretRoundPrompts[Math.floor(Math.random() * secretRoundPrompts.length)];
        setGameState("secretLoveRound");
        handleThemeChange("foreverPromise");
        setSecretSticky(true);
        setIsSecretThemeUnlocked(true);
        safeOpenModal("secretPrompt", { prompt: secretRoundPrompt });
        if (typeof secretPromptOpenAt !== 'undefined') { secretPromptOpenAt.t = Date.now(); }

        secretPressTimerRef.current = null;
    }, 850);
  }}
  onPointerUp={() => {
    if (secretPressTimerRef.current) {
      clearTimeout(secretPressTimerRef.current);
      secretPressTimerRef.current = null;
      handleSpin();
    }
  }}
  onPointerLeave={() => {
    if (secretPressTimerRef.current) {
      clearTimeout(secretPressTimerRef.current);
      secretPressTimerRef.current = null;
    }
  }}
  onPointerCancel={() => {
    if (secretPressTimerRef.current) {
      clearTimeout(secretPressTimerRef.current);
      secretPressTimerRef.current = null;
      handleSpin();
    }
  }}
>
<motion.button
                    aria-label="Spin"
                    className="spin-button" onContextMenu={(e) => e.preventDefault()}
                    onClick={handleSpin}
                    whileTap={{ scale: 0.95 }}
                >
                    {isSpinning ? <SpinLoader /> : 'SPIN'}
                </motion.button>
            </div>
        </div>
    );
});

const PulseMeter = ({ level }) => {
    return (
        <div className="pulse-meter">
            <div className="pulse-meter__fill" style={{ width: `${level}%` }}/>
            <div className="pulse-meter__wave" />
            <div className="pulse-meter__gloss" />
        </div>
    );
};

// --- MODAL & OVERLAY COMPONENTS (Re-implemented) ---
const Modal = ({ isOpen, onClose, title, children, activeVisualTheme, customClasses = "" }) => {
  const parallax = useParallax(8);
  const visible = !!isOpen;

  React.useEffect(() => {
    if (!visible) return;
    const prevActive = document.activeElement;
    const focusTimer = setTimeout(() => {
      const root = parallax.ref.current;
      const first = root?.querySelector('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
      (first ?? root)?.focus?.();
    }, 0);

    const onKeyDown = (e) => {
      if (e.key === "Escape") { onClose?.(); return; }
      if (e.key === "Tab" && parallax.ref.current) {
        const nodes = Array.from(parallax.ref.current.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'));
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { last.focus(); e.preventDefault(); }
        } else {
          if (document.activeElement === last) { first.focus(); e.preventDefault(); }
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      prevActive?.focus?.();
    };
  }, [visible, onClose, parallax.ref]);

  if (!visible) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[110] flex justify-center items-start md:items-center p-4 pt-[15vh] md:pt-4"
      onClick={onClose}
      initial={{ backgroundColor: "rgba(0,0,0,0)" }}
      animate={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      exit={{ backgroundColor: "rgba(0,0,0,0)" }}
    >
      <motion.div
        ref={parallax.ref}
        style={parallax.style}
        tabIndex={-1}
        className={`relative outline-none w-full max-w-sm flex flex-col modal-metallic ${activeVisualTheme?.themeClass ?? ""} ${customClasses}`}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0, y: 30, filter: "blur(8px)" }}
        animate={{ scale: 1, opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ scale: 0.95, opacity: 0, y: 30, filter: "blur(8px)" }}
        transition={{ type: "tween", duration: 0.25 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          {title && <h2 id="modal-title" className="modal-title text-3xl text-white">{title}</h2>}
          <motion.button aria-label="Close modal" onClick={onClose} className="modal-close-button text-white/70 hover:text-white" whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }}>
            <CloseIcon />
          </motion.button>
        </div>
        <div className="modal-body">{children}</div>
      </motion.div>
    </motion.div>
  );
};
const Vignette = () => <div className="fixed inset-0 z-10 pointer-events-none vignette-overlay" />;
const NoiseOverlay = ({ reducedMotion }) => <div className={`fixed inset-0 z-10 pointer-events-none opacity-[0.04] ${reducedMotion ? '' : 'noise-animated'}`} />;
const RadialLighting = ({ reducedMotion }) => {
    const lightX = useMotionValue('-100%');
    const lightY = useMotionValue('-100%');
    useEffect(() => {
        if (reducedMotion) return;
        const handleMouseMove = (e) => {
            lightX.set(`${e.clientX}px`);
            lightY.set(`${e.clientY}px`);
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [lightX, lightY, reducedMotion]);
    return <motion.div className="radial-light-overlay" style={{ '--light-x': lightX, '--light-y': lightY }} />;
};
const PowerSurgeEffect = ({ onComplete, reducedMotion }) => (
    <motion.div
        className="fixed inset-0 z-[130] pointer-events-none bg-power-surge"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 3, opacity: [0, 1, 0] }}
        transition={{ duration: reducedMotion ? 0.1 : 1.5, ease: "easeInOut" }}
        onAnimationComplete={onComplete}
    />
);

const ExtremeIntroEffect = ({ theme, reducedMotion }) => (
    <motion.div
        className={`fixed inset-0 z-[125] pointer-events-none extreme-effect-bg ${theme}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
    >
        {!reducedMotion && <div className="extreme-scanlines" />}
    </motion.div>
);
const OnboardingScreen = ({ children, activeVisualTheme }) => <div className={`onboarding-screen-container w-full h-full flex flex-col items-center justify-center p-8 text-center ${activeVisualTheme.themeClass}`}>{children}</div>;

const AudioUnlockScreen = ({ onUnlock, disabled, activeVisualTheme }) => (
    <OnboardingScreen activeVisualTheme={activeVisualTheme}>
        <div className="onboarding-content-block">
          <h1 className="text-8xl font-['Great_Vibes']" style={{ filter: `drop-shadow(0 0 15px ${activeVisualTheme.titleShadow})` }}>Pulse</h1>
          <p className="text-xl mt-4 text-white/80 max-w-xs">The intimate couples game. <br/>Best with sound on.</p>
          <motion.button onClick={onUnlock} disabled={disabled} className="btn btn--primary mt-12 text-2xl px-12 py-5 begin-button" whileTap={{ scale: 0.95 }}>
              {disabled ? <SpinLoader /> : "Begin"}
          </motion.button>
        </div>
    </OnboardingScreen>
);
const OnboardingIntro = ({ onNext, activeVisualTheme }) => (
    <OnboardingScreen activeVisualTheme={activeVisualTheme}>
        <div className="onboarding-content-block">
            <h2 className="text-4xl font-bold">Welcome to Pulse</h2>
            <p className="text-lg mt-4 text-white/70 max-w-sm">Get ready to connect on a deeper level. Answer truths, complete dares, and see how well you really know each other.</p>
            <motion.button onClick={onNext} className="btn btn--primary text-xl px-10 py-4 mt-10" whileTap={{ scale: 0.95 }}>Continue</motion.button>
        </div>
    </OnboardingScreen>
);
const OnboardingVibePicker = ({ onVibeSelect, currentTheme, activeVisualTheme }) => {
    const themes = [
        { id: 'velourNights', name: 'Velour Nights', colors: ['#F777B6', '#FFD700', '#6A0DAD'] },
        { id: 'lotusDreamscape', name: 'Lotus Dreamscape', colors: ['#6A5ACD', '#FFFFFF', '#ADD8E6'] },
        { id: 'velvetCarnival', name: 'Velvet Carnival', colors: ['#FFD700', '#FF4500', '#9B111E'] },
        { id: 'starlitAbyss', name: 'Starlit Abyss', colors: ['#FFFFFF', '#E6E6FA', '#483D8B'] },
    ];
    return (
        <OnboardingScreen activeVisualTheme={activeVisualTheme}>
            <div className="onboarding-content-block">
                <h2 className="text-4xl font-bold">Choose Your Vibe</h2>
                <p className="text-lg mt-2 text-white/70">Set the mood for your night.</p>
                <div className="flex flex-col gap-4 mt-8 w-full max-w-xs">
                    {themes.map(theme => (
                        <motion.div key={theme.id} onClick={() => onVibeSelect(theme.id)} className="theme-swatch" whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.03 }}>
                            <div className="theme-chips">{theme.colors.map(c => <div key={c} className="theme-chip" style={{ backgroundColor: c }} />)}</div>
                            <span className="font-bold text-lg">{theme.name}</span>
                        </motion.div>
                    ))}
                </div>
            </div>
        </OnboardingScreen>
    );
};
const PlayerNameScreen = ({ onStart, activeVisualTheme }) => {
    const [p1, setP1] = useState('');
    const [p2, setP2] = useState('');
    return (
        <OnboardingScreen activeVisualTheme={activeVisualTheme}>
            <div className="onboarding-content-block">
                <h2 className="text-4xl font-bold">Who's Playing?</h2>
                {/* // QA: add accessible identifiers for onboarding form */}
                <form id="player-name-form" name="player-name-form" onSubmit={(e) => { e.preventDefault(); onStart({ p1: p1 || 'Player 1', p2: p2 || 'Player 2' }); }} className="flex flex-col gap-5 mt-8 w-full max-w-xs">
                    <div className="metallic-input-wrapper">
                        {/* // QA: ensure player one field has identifiers */}
                        <input id="player-one-name" name="player-one-name" type="text" value={p1} onChange={(e) => setP1(e.target.value)} placeholder="Player 1 Name" className="w-full h-full p-4 text-center text-xl text-[var(--theme-highlight)]"/>
                    </div>
                    <div className="metallic-input-wrapper">
                        {/* // QA: ensure player two field has identifiers */}
                        <input id="player-two-name" name="player-two-name" type="text" value={p2} onChange={(e) => setP2(e.target.value)} placeholder="Player 2 Name" className="w-full h-full p-4 text-center text-xl text-[var(--theme-highlight)]"/>
                    </div>
                    <motion.button type="submit" className="btn btn--primary text-xl px-10 py-4 mt-4" whileTap={{ scale: 0.95 }}>Start Game</motion.button>
                </form>
            </div>
        </OnboardingScreen>
    );
};
const ExtremeIntroModal = ({ isOpen, onClose, activeVisualTheme }) => (
    <Modal isOpen={isOpen} onClose={onClose} activeVisualTheme={activeVisualTheme}>
        <div className="text-center">
            <h2 className="text-5xl font-black text-[var(--theme-highlight)] uppercase tracking-wider" style={{ WebkitTextStroke: '1px black' }}>EXTREME</h2>
            <p className="text-2xl font-bold mt-2 text-white">The game is heating up!</p>
            <p className="mt-4 text-white/80">The prompts are about to get much more intense. Are you ready?</p>
            <motion.button onClick={onClose} className="btn btn--danger text-xl w-full mt-8" whileTap={{ scale: 0.95 }}>Let's Do It</motion.button>
        </div>
    </Modal>
);

const PromptModal = ({ isOpen, onClose, onRefuse, prompt, activeVisualTheme }) => (
    <Modal isOpen={isOpen} onClose={onClose} title={prompt.title} activeVisualTheme={activeVisualTheme}>
        <div className="text-center flex flex-col gap-6">
            <p className="text-2xl font-semibold leading-relaxed text-white">{prompt.text}</p>
            <div className="flex gap-4">
                <motion.button onClick={onClose} className="btn btn--primary flex-1" whileTap={{ scale: 0.95 }}>Done</motion.button>
                <motion.button onClick={onRefuse} className="btn btn--secondary flex-1" whileTap={{ scale: 0.95 }}>Refuse</motion.button>
            </div>
        </div>
    </Modal>
);

const ConsequenceModal = ({ isOpen, onClose, text, activeVisualTheme }) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Consequence" activeVisualTheme={activeVisualTheme}>
        <div className="text-center flex flex-col gap-6">
            <p className="text-2xl font-semibold leading-relaxed text-white">{text}</p>
            <motion.button onClick={onClose} className="btn btn--danger w-full" whileTap={{ scale: 0.95 }}>Accept Fate</motion.button>
        </div>
    </Modal>
);
const EditorModal = ({ isOpen, onClose, prompts: initialPrompts, onReset, activeVisualTheme }) => {
    const [prompts, setPrompts] = useState(() => structuredClone(initialPrompts));
    const handleSave = () => onClose(prompts);
    const scrollRef = useRef(null);
    const [isAtTop, setIsAtTop] = useState(true);
    const [isAtBottom, setIsAtBottom] = useState(false);
    
    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setIsAtTop(el.scrollTop <= 0);
        setIsAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
    }, []);

    useEffect(() => { handleScroll(); }, [handleScroll]);

    const handleChange = (category, type, index, value) => {
        const newPrompts = structuredClone(prompts);
        newPrompts[category][type][index] = value;
        setPrompts(newPrompts);
    };
    const handleRemove = (category, type, index) => {
        const newPrompts = structuredClone(prompts);
        newPrompts[category][type].splice(index, 1);
        setPrompts(newPrompts);
    };
    const handleAdd = (category, type) => {
        const newPrompts = structuredClone(prompts);
        newPrompts[category][type].push("");
        setPrompts(newPrompts);
    };

    return (
        <Modal isOpen={isOpen} onClose={handleSave} title="Edit Prompts" activeVisualTheme={activeVisualTheme} customClasses="max-w-lg">
            <div className="flex flex-col gap-4 text-white">
                <div ref={scrollRef} onScroll={handleScroll} className="editor-scroll-area pr-2" data-at-top={isAtTop} data-at-bottom={isAtBottom}>
                {Object.entries(prompts).map(([category, types]) => (
                    <div key={category} className="mb-6">
                        <h3 className="text-2xl font-bold capitalize mb-3 text-[var(--theme-highlight)]">{category.replace(/([A-Z])/g, ' $1').trim()}</h3>
                        {Object.entries(types).map(([type, list]) => (
                            <div key={type} className="mb-4 pl-4 border-l-2 border-white/10">
                                <h4 className="font-semibold capitalize text-white/80 mb-2">{type}</h4>
                                {list.map((prompt, i) => (
                                    <div key={i} className="flex items-center gap-2 mb-2">
                                        <input type="text" value={prompt} onChange={(e) => handleChange(category, type, i, e.target.value)} className="w-full bg-black/20 rounded-md p-2 border border-white/20 focus:border-[var(--theme-highlight)] focus:ring-0" />
                                        <motion.button onClick={() => handleRemove(category, type, i)} whileTap={{scale:0.9}}><TrashIcon /></motion.button>
                                    </div>
                                ))}
                                <button onClick={() => handleAdd(category, type)} className="btn--inline text-sm">+ Add</button>
                            </div>
                        ))}
                    </div>
                ))}
                </div>
                 <div className="flex justify-between items-center pt-4 border-t border-white/10">
                    <button onClick={onReset} className="btn--inline text-sm text-red-400 border-red-400/50 hover:bg-red-500/10">Reset All to Default</button>
                    <motion.button onClick={handleSave} className="btn btn--primary" whileTap={{ scale: 0.95 }}>Save & Close</motion.button>
                </div>
            </div>
        </Modal>
    );
};
const SettingsModal = ({ isOpen, onClose, settings, onSettingsChange, isMuted, onMuteToggle, onEditPrompts, currentTheme, onThemeChange, onRestart, onQuit, activeVisualTheme, reducedMotion, onReducedMotionToggle, canUseForeverTheme }) => {
    const themes = [
        { id: 'velourNights', name: 'Velour Nights', colors: ['#F777B6', '#FFD700', '#6A0DAD'] },
        { id: 'lotusDreamscape', name: 'Lotus Dreamscape', colors: ['#6A5ACD', '#FFFFFF', '#ADD8E6'] },
        { id: 'velvetCarnival', name: 'Velvet Carnival', colors: ['#FFD700', '#FF4500', '#9B111E'] },
        { id: 'starlitAbyss', name: 'Starlit Abyss', colors: ['#FFFFFF', '#E6E6FA', '#483D8B'] },
        ...(canUseForeverTheme ? [
            { id: 'foreverPromise', name: 'Forever Promise', colors: ['#B88BFF','#E8D8FF','#6B45C6'] }
          ] : [])
    ];
    return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings" activeVisualTheme={activeVisualTheme}>
        <div className="flex flex-col gap-6 text-white">
            <div className="settings-section">
                <h3 className="text-xl font-bold mb-3 text-[var(--theme-label)]">Audio</h3>
                <div className="flex items-center justify-between mb-2">
                    <label htmlFor="master-vol">Master</label>
                    <button onClick={onMuteToggle}><SpeakerIcon muted={isMuted} /></button>
                </div>
                <input id="master-vol" type="range" min="0" max="100" value={settings.masterVolume} onChange={e => onSettingsChange({ masterVolume: +e.target.value })} className="w-full"/>
                <label htmlFor="music-vol" className="mt-2 block">Music</label>
                <input id="music-vol" type="range" min="0" max="100" value={settings.musicVolume} onChange={e => onSettingsChange({ musicVolume: +e.target.value })} className="w-full"/>
                <label htmlFor="sfx-vol" className="mt-2 block">SFX</label>
                <input id="sfx-vol" type="range" min="0" max="100" value={settings.sfxVolume} onChange={e => onSettingsChange({ sfxVolume: +e.target.value })} className="w-full"/>
            </div>
            <div className="settings-section">
                <h3 className="text-xl font-bold mb-3 text-[var(--theme-label)]">Vibe</h3>
                <div className="flex flex-col gap-2">
                {themes.map(theme => (
                    <div key={theme.id} onClick={() => onThemeChange(theme.id)} className={`theme-swatch ${currentTheme === theme.id ? 'ring-2 ring-[var(--theme-highlight)]' : ''}`}>
                        <div className="theme-chips">{theme.colors.map(c => <div key={c} className="theme-chip" style={{backgroundColor: c}}/>)}</div>
                        <span className="font-bold">{theme.name}</span>
                    </div>
                ))}
                </div>
            </div>
            <div className="settings-section">
                <h3 className="text-xl font-bold mb-3 text-[var(--theme-label)]">Game</h3>
                 <button onClick={onEditPrompts} className="btn--inline w-full flex items-center justify-center gap-2"><CustomPromptIcon /> Edit Custom Prompts</button>
                 <div className="flex items-center justify-between mt-3">
                     <label htmlFor="reduced-motion">Reduced Motion</label>
                     <input type="checkbox" id="reduced-motion" checked={reducedMotion} onChange={onReducedMotionToggle} className="w-5 h-5 rounded text-[var(--theme-highlight)] bg-white/10 border-white/20 focus:ring-[var(--theme-highlight)]" />
                 </div>
            </div>
            <div className="flex gap-2">
                <motion.button onClick={onRestart} className="btn btn--secondary flex-1" whileTap={{scale:0.95}}>Restart</motion.button>
                <motion.button onClick={onQuit} className="btn btn--danger flex-1" whileTap={{scale:0.95}}>Quit</motion.button>
            </div>
        </div>
    </Modal>
)};
const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, activeVisualTheme }) => (
    <Modal isOpen={isOpen} onClose={onClose} title={title} activeVisualTheme={activeVisualTheme}>
        <div className="text-center flex flex-col gap-6">
            <p className="text-lg text-white/80">{message}</p>
            <div className="flex gap-4">
                <motion.button onClick={onClose} className="btn btn--secondary flex-1" whileTap={{scale:0.95}}>Cancel</motion.button>
                <motion.button onClick={onConfirm} className="btn btn--danger flex-1" whileTap={{scale:0.95}}>Confirm</motion.button>
            </div>
        </div>
    </Modal>
);

/* --- SECRET ROUND (KATY) --- */
const SecretPromptModal = ({ isOpen, prompt, onAccept, onRefuse, activeVisualTheme }) => (
    <Modal isOpen={isOpen} onClose={onRefuse} title="A Question..." activeVisualTheme={activeVisualTheme} customClasses="secret-message">
        <div className='text-center'>
            <h2 className='text-3xl font-semibold mb-4'>{prompt.text}</h2>
            <div className='flex justify-center gap-6 mt-6'>
                <button className='btn btn--primary' onClick={onAccept}>Accept</button>
                <button className='btn btn--secondary' onClick={onRefuse}>Refuse</button>
            </div>
        </div>
    </Modal>
);

const SecretMessageModal = ({ isOpen, outcome, onClose, activeVisualTheme }) => (
    <Modal isOpen={isOpen} onClose={onClose} title={outcome.title} activeVisualTheme={activeVisualTheme} customClasses="secret-message">
        <div className='text-center'>
            <p className='text-lg leading-relaxed whitespace-pre-line'>
                {outcome.message}
            </p>
            <div className='flex justify-center mt-6'>
                <button className='btn btn--primary' onClick={onClose}>Close</button>
            </div>
        </div>
    </Modal>
);


const getInitialSettings = () => {
    const defaults = {
        theme: 'velourNights',
        volumes: { masterVolume: 100, musicVolume: 80, sfxVolume: 100 },
        reducedMotion: false,
    };
    try {
        const stored = localStorage.getItem('settings');
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...defaults, ...parsed };
        }
    } catch (e) {
        console.warn("Could not parse settings, using defaults.", e);
    }
    return defaults;
};

const PROMPT_QUEUE_INITIAL_STATE = {
    queue: [],
    active: null,
    deliveryLock: false,
    lastDeliveryPath: 'init',
    enqueueWhileLocked: 0,
    watchdogFires: 0,
};

const promptQueueReducer = (state, action) => {
    switch (action.type) {
        case 'ENQUEUE': {
            // RELIABILITY: validate payload structure
            if (!action.payload || typeof action.payload !== 'object' || typeof action.payload.category !== 'string' || !action.payload.category.trim()) {
                console.warn("[Reliability] Skipping enqueue of invalid payload:", action.payload);
                return state;
            }
            const source = action.meta?.source || action.payload?.source || 'wheel';
            const payload = { ...action.payload, source };
            const nextQueue = [...state.queue, payload];
            const locked = state.deliveryLock || !!state.active;
            const enqueueWhileLocked = locked ? state.enqueueWhileLocked + 1 : state.enqueueWhileLocked;
            const watchdogFires = source === 'watchdog' ? state.watchdogFires + 1 : state.watchdogFires;
            return { ...state, queue: nextQueue, enqueueWhileLocked, watchdogFires };
        }
        case 'LOCK': {
            if (state.deliveryLock) return state;
            return { ...state, deliveryLock: true };
        }
        case 'DEQUEUE': {
            if (!state.queue.length) {
                return { ...state, active: null };
            }
            const [next, ...rest] = state.queue;
            const source = next?.source || action.meta?.source || state.lastDeliveryPath;
            return { ...state, queue: rest, active: next, lastDeliveryPath: source };
        }
        case 'UNLOCK': {
            return { ...state, deliveryLock: false, active: null };
        }
        case 'RESET': {
            return {
                ...PROMPT_QUEUE_INITIAL_STATE,
                lastDeliveryPath: state.lastDeliveryPath,
                watchdogFires: state.watchdogFires,
            };
        }
        default:
            return state;
    }
};

// RELIABILITY: Prompt queue reducer ensures deterministic delivery order.
function usePromptQueue() {
    const [modalState, setModalState] = useState({ type: "", data: null });
    const [queueState, dispatchQueue] = useReducer(promptQueueReducer, PROMPT_QUEUE_INITIAL_STATE);

    const enqueuePrompt = useCallback((payload, meta = {}) => {
        dispatchQueue({ type: 'ENQUEUE', payload, meta });
    }, []);

    useEffect(() => {
        if (queueState.active || !queueState.queue.length || queueState.deliveryLock) return;
        if (modalState?.type) return;
        dispatchQueue({ type: 'LOCK' });
        scheduleMicrotask(() => dispatchQueue({ type: 'DEQUEUE' }));
    }, [queueState.active, queueState.queue.length, queueState.deliveryLock, modalState?.type]);

    useEffect(() => {
        if (!queueState.active) return;
        const id = safeUUID();
        setModalState({ type: 'prompt', data: { ...queueState.active, _id: id } });
    }, [queueState.active]);

    const resetQueue = useCallback(() => dispatchQueue({ type: 'RESET' }), []);

    return { modalState, setModalState, enqueuePrompt, queueState, dispatchQueue, resetQueue };
}

function App() {
    // DIAGNOSTIC: log render cycle entry for App component
    console.log('[APP] Rendering main App component...');
    const { prompts, updatePrompts, resetPrompts, isLoading } = useLocalStoragePrompts();
    const [scriptLoadState, setScriptLoadState] = useState('loading');
    const [isUnlockingAudio, setIsUnlockingAudio] = useState(false);

    useEffect(() => {
        // DIAGNOSTIC: confirm primary App effect mounted
        console.log('[APP] useEffect mounted');
        // RELIABILITY: establish gesture unlock and error suppression before any audio runs
        attachAudioGestureListeners();
        silenceToneErrors();
    }, []);

    useEffect(() => {
        // RELIABILITY: migrate legacy localStorage prompts to IndexedDB
        (async () => {
            const legacy = legacyPromptSnapshot ?? localStorage.getItem('prompts');
            if (legacy) {
                try {
                    const parsed = JSON.parse(legacy);
                    await dbStore.setPrompt('prompts', parsed);
                    localStorage.removeItem('prompts');
                } catch (err) {
                    // RELIABILITY: expose migration failures for debugging.
                    console.warn('[Reliability] Failed to migrate legacy prompts', err);
                }
            }
        })();
    }, []);

    // Use the new prompt queue hook
    const { modalState, setModalState, enqueuePrompt, queueState, dispatchQueue, resetQueue } = usePromptQueue();
    const modalStateRef = useRef(modalState); // Keep ref for legacy dependencies if any

    useLayoutEffect(() => {
        modalStateRef.current = modalState;
    }, [modalState]);

    useLayoutEffect(() => {
        if (!modalState?.type) return;
        const activeEl = document.activeElement;
        if (activeEl && typeof activeEl.blur === 'function') {
            // RELIABILITY: Blur focused controls before aria-hidden background.
            activeEl.blur();
        }
    }, [modalState?.type]);

    useEffect(() => {
        const container = document.getElementById('app-content');
        if (!container) return;
        if (modalState.type) {
            // RELIABILITY: Inert background while modal is active to prevent focus conflicts.
            container.setAttribute('inert', '');
        } else {
            container.removeAttribute('inert');
        }
        return () => {
            container.removeAttribute('inert');
        };
    }, [modalState.type]);

    const promptQueueStateRef = useRef(queueState);
    useLayoutEffect(() => {
        promptQueueStateRef.current = queueState;
    }, [queueState]);
    
    const initialSettings = getInitialSettings();
    const [currentTheme, setCurrentTheme] = useState(initialSettings.theme);
    const [settings, setSettings] = useState(initialSettings.volumes);
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(initialSettings.reducedMotion);
    
    const [backgroundTheme, setBackgroundTheme] = useState(initialSettings.theme);
    const [activeBg, setActiveBg] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [pulseLevel, setPulseLevel] = useState(0);
    const [showPowerSurge, setShowPowerSurge] = useState(false);
    const [roundCount, setRoundCount] = useState(0);
    const [isExtremeMode, setIsExtremeMode] = useState(false);
    const [extremeModeReady, setExtremeModeReady] = useState(false);
    const [extremeRoundSource, setExtremeRoundSource] = useState(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [confettiOrigin, setConfettiOrigin] = useState({x: 0.5, y: 0.5 });
    const [isSpinInProgress, setIsSpinInProgress] = useState(false);
    const [pendingExtremeRound, setPendingExtremeRound] = useState(null);
    const [audioInitFailed, setAudioInitFailed] = useState(false);
    const [gameState, setGameState] = useState('unlock');
    const [isSecretThemeUnlocked, setIsSecretThemeUnlocked] = useState(false);
    const [secretSticky, setSecretSticky] = useState(false);
    const [players, setPlayers] = useState({ p1: 'Player 1', p2: 'Player 2' });
    const [currentPlayer, setCurrentPlayer] = useState('p1');
    const [recentPrompts, setRecentPrompts] = useState({ truth: [], dare: [], trivia: [] });
    const [secretRoundUsed, setSecretRoundUsed] = useState(false);
    const mainContentRef = useRef(null);

    const turnIntroTimeoutRef = useRef(null);
    const previousThemeRef = useRef(initialSettings.theme);
    const themeNameBeforeSecretRef = useRef(null);
    const pendingPromptRef = useRef(null);
    const spinWatchdogRef = useRef(null);

    // AudioContext autoplay warning fix
    useEffect(() => {
        const resumeAudioContext = () => {
            resumeAudioOnGesture();
        };
        const attachUnlockListener = () => {
            document.removeEventListener('click', resumeAudioContext);
            document.addEventListener('click', resumeAudioContext, { once: true });
        };

        attachUnlockListener();

        const handleVisibility = () => {
            if (document.hidden) return;
            if (window?.Tone?.context?.state === 'suspended') {
                // RELIABILITY: Re-arm gesture listener after background resume.
                attachUnlockListener();
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            document.removeEventListener('click', resumeAudioContext);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);
    
    const visualThemes = {
        velourNights: { bg: 'theme-velour-nights-bg', titleText: 'text-white', titleShadow: '#F777B6', themeClass: 'theme-velour-nights' },
        lotusDreamscape: { bg: 'theme-lotus-dreamscape-bg', titleText: 'text-white', titleShadow: '#F777B6', themeClass: 'theme-lotus-dreamscape' },
        velvetCarnival: { bg: 'theme-velvet-carnival-bg', titleText: 'text-white', titleShadow: '#FFD700', themeClass: 'theme-velvet-carnival' },
        starlitAbyss: { bg: 'theme-starlit-abyss-bg', titleText: 'text-white', titleShadow: '#8A2BE2', themeClass: 'theme-starlit-abyss' },
        crimsonFrenzy: { bg: 'theme-crimson-frenzy-bg', titleText: 'text-white', titleShadow: '#ff0000', themeClass: 'theme-crimson-frenzy' },
        lavenderPromise: { bg: 'theme-lavender-promise-bg', titleText: 'text-white', titleShadow: '#e2d4ff', themeClass: 'theme-lavender-promise' },
        foreverPromise: { bg: 'theme-forever-promise-bg', titleText: 'text-white', titleShadow: '#e2d4ff', themeClass: 'theme-forever-promise' },
    };
    const activeVisualTheme = visualThemes[currentTheme] || visualThemes.velourNights;
    const activeBackgroundClass = visualThemes[backgroundTheme]?.bg || visualThemes.velourNights.bg;

    const [prevBackgroundClass, setPrevBackgroundClass] = useState(activeBackgroundClass);

    useEffect(() => {
        try {
            const settingsToSave = {
                theme: currentTheme,
                volumes: settings,
                reducedMotion: prefersReducedMotion,
            };
            localStorage.setItem('settings', JSON.stringify(settingsToSave));
        } catch (e) {
            console.error("Failed to save settings to localStorage", e);
        }
    }, [currentTheme, settings, prefersReducedMotion]);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
        if (localStorage.getItem('settings') === null) {
            handleChange();
        }
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    const wheelControlRef = useRef(null);
    const registerWheelControl = useCallback((api) => {
        wheelControlRef.current = api;
    }, []);

    const resolveStalledSpin = useCallback((reason = 'watchdog') => {
        const queueSnapshot = promptQueueStateRef.current;
        const activeModalType = modalStateRef.current?.type;
        if (activeModalType === 'prompt') return false;
        if (queueSnapshot.active || queueSnapshot.queue.length || queueSnapshot.deliveryLock) return false;

        const wheelApi = wheelControlRef.current;
        if (wheelApi && typeof wheelApi.isLocked === 'function' && wheelApi.isLocked()) {
            wheelApi.finish(reason);
            return true;
        }

        if (pendingPromptRef.current) {
            enqueuePrompt(pendingPromptRef.current, { source: reason });
            pendingPromptRef.current = null;
            return true;
        }

        return false;
    }, [enqueuePrompt]);

    useEffect(() => {
        window.debugReset = () => resolveStalledSpin('manual');
        let watchdog;
        if (isSpinInProgress) {
            watchdog = setInterval(() => {
                const wheelApi = wheelControlRef.current;
                if (!wheelApi || typeof wheelApi.isLocked !== 'function' || !wheelApi.isLocked()) return;
                if (document.querySelector('.spin-button:disabled')) return;
                const isSpinningVisually = !!document.querySelector('.spin-button svg.animate-spin');
                if (isSpinningVisually) return;
                resolveStalledSpin('watchdog');
            }, 2000);
        }
        return () => {
            delete window.debugReset;
            if (watchdog) clearInterval(watchdog);
        };
    }, [isSpinInProgress, resolveStalledSpin]);

    // [GeminiFix: PromptReliability] Watchdog removed.

    useEffect(() => {
        // DIAGNOSTIC: validate gameState before executing turnIntro side effects
        if (typeof gameState !== 'string') {
            console.warn('[DIAGNOSTIC][App.jsx][useEffect:turnIntro] gameState invalid:', gameState);
            return;
        }
        clearTimeout(turnIntroTimeoutRef.current);
        if (gameState === 'turnIntro') {
            turnIntroTimeoutRef.current = setTimeout(() => {
                setGameState('playing');
            }, 2800);
        }
        return () => clearTimeout(turnIntroTimeoutRef.current);
    }, [gameState]);

    const safeOpenModal = useCallback((type, data = {}) => {
        if (type === 'secretPrompt') {
            const id = safeUUID();
            try { secretPromptOpenAt.t = Date.now(); } catch {}
            setModalState({ type, data: { ...data, _id: id } });
            return;
        }
        setModalState({ type, data });
      }, [setModalState]);

    useEffect(() => { 
        if (window.Tone) { 
            setScriptLoadState('loaded'); 
            return; 
        } 
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/tone@14.7.77/build/Tone.min.js";
        script.async = true;
        script.onload = () => {
            if (window.Tone) setScriptLoadState('loaded');
        };
        script.onerror = () => setScriptLoadState('error');
        document.body.appendChild(script);
        return () => { if (script.parentNode) script.parentNode.removeChild(script); };
    }, []);

    useEffect(() => {
        if (modalState.type && modalState.type !== 'settings' && modalState.type !== 'editor' && modalState.type !== 'closing' ) {
            resumeAudioOnGesture();
            audioEngine.playModalOpen();
        }
    }, [modalState.type]);
    
    useEffect(() => { const convertToDb = (v) => (v === 0 ? -Infinity : (v / 100) * 40 - 40); audioEngine.setMasterVolume(convertToDb(settings.masterVolume)); audioEngine.setMusicVolume(convertToDb(settings.musicVolume)); audioEngine.setSfxVolume(convertToDb(settings.sfxVolume)); }, [settings]);
    useEffect(() => { audioEngine.toggleMute(isMuted); }, [isMuted]);
    
    
    useEffect(() => {
        let t = currentTheme;
        if (isExtremeMode) t = 'crimsonFrenzy';
        if (modalState.type === 'secretPrompt' || modalState.type === 'secretMessage') t = 'lavenderPromise';
        
        if (t !== backgroundTheme) {
            setPrevBackgroundClass(visualThemes[backgroundTheme]?.bg);
            setActiveBg(prev => (prev === 1 ? 2 : 1));
            setBackgroundTheme(t);
        }
    }, [currentTheme, isExtremeMode, modalState.type, backgroundTheme, visualThemes]);
    
    // [GeminiFix: ForeverPromiseAudio]
    useEffect(() => {
        // DIAGNOSTIC: verify theme and modal state payloads before orchestrating theme transitions
        if (typeof currentTheme !== 'string') {
            console.warn('[DIAGNOSTIC][App.jsx][useEffect:secretTheme] currentTheme invalid during modal transition:', currentTheme);
            return;
        }
        if (!modalState || typeof modalState !== 'object') {
            console.warn('[DIAGNOSTIC][App.jsx][useEffect:secretTheme] modalState invalid during modal transition:', modalState);
            return;
        }
        if (modalState.type === 'secretPrompt' && !themeNameBeforeSecretRef.current) {
            themeNameBeforeSecretRef.current = currentTheme;
            (async () => {
                await audioEngine.stopTheme();
                await new Promise(res => setTimeout(res, 350));
                await audioEngine.startTheme('firstDanceMix');
            })();
        } else if (modalState.type !== 'secretPrompt' && modalState.type !== 'secretMessage' && themeNameBeforeSecretRef.current) {
            const prev = themeNameBeforeSecretRef.current;
            const targetAudioTheme = (prev === 'lavenderPromise' || prev === 'foreverPromise') ? 'firstDanceMix' : prev;
            (async () => {
                await audioEngine.stopTheme();
                await new Promise(res => setTimeout(res, 350));
                await audioEngine.startTheme(targetAudioTheme);
            })();
            themeNameBeforeSecretRef.current = null;
        }
    }, [modalState.type, currentTheme]);

    // [GeminiFix: ForeverPromiseAudio]
    const handleThemeChange = useCallback(async (themeId) => {
        // DIAGNOSTIC: ensure requested themeId is a usable string before mutating theme state
        if (typeof themeId !== 'string' || !themeId.trim()) {
            console.warn('[DIAGNOSTIC][App.jsx][handleThemeChange] Invalid themeId provided:', themeId);
            return;
        }
        const next = themeId;
        setCurrentTheme(prev => (previousThemeRef.current = prev, next));
        const audioTheme = (next === 'lavenderPromise' || next === 'foreverPromise') ? 'firstDanceMix' : next;

        try {
            await audioEngine.startTheme(audioTheme);
        } catch(e) {
            console.error("Failed to start theme audio", e)
        } 
    
    }, [setCurrentTheme, previousThemeRef]);

    const triggerExtremeRound = useCallback((source) => {
        const wheelEl = mainContentRef.current?.querySelector('.spin-button');
        if (wheelEl) {
            const rect = wheelEl.getBoundingClientRect();
            const originX = (rect.left + rect.width / 2) / window.innerWidth;
            const originY = (rect.top + rect.height / 2 + window.scrollY) / document.documentElement.scrollHeight;
            setConfettiOrigin({ x: originX, y: originY });
        }
        setShowPowerSurge(true);
        audioEngine.playExtremePrompt();
        previousThemeRef.current = currentTheme;
        setShowConfetti(true);
        setExtremeRoundSource(source);
        safeOpenModal('extremeIntro');
    }, [safeOpenModal, currentTheme]);

    useEffect(() => { 
        if (!isSpinInProgress && !modalState.type && pendingExtremeRound) { 
            triggerExtremeRound(pendingExtremeRound); 
            setPendingExtremeRound(null); 
        } 
    }, [isSpinInProgress, modalState.type, pendingExtremeRound, triggerExtremeRound]);

    const handleUnlockAudio = useCallback(async () => {
        if (isUnlockingAudio) return;
        setIsUnlockingAudio(true);
    
        const attemptAudioInit = async () => {
            if (!window.Tone || !window.Tone.context) {
                setScriptLoadState('error');
                return false;
            }
            try {
                await resumeAudioOnGesture();
            } catch (e) {
                console.error("Audio unlock failed:", e);
                return false;
            }
            const success = await audioEngine.initialize();
            if (success) {
                await audioEngine.startTheme("velourNights");
            }
            return success;
        };
    
        try {
            const success = await attemptAudioInit();
            if (!success) {
                setTimeout(async () => {
                    const retrySuccess = await attemptAudioInit();
                    if (!retrySuccess) setAudioInitFailed(true);
                }, 1000);
            }
        } catch (err) {
            console.error("Audio init failed:", err);
            setAudioInitFailed(true);
        } finally {
            setGameState('onboarding_intro');
            setIsUnlockingAudio(false);
        }
    }, [isUnlockingAudio]);

    const handleNameEntry = useCallback((playerNames) => { 
        setPlayers(playerNames); 
        setGameState('turnIntro'); 
    }, []);

    const handleToggleMute = useCallback(() => setIsMuted(prev => !prev), []);

    const endRoundAndStartNew = useCallback(() => {
        const nextPlayerId = currentPlayer === 'p1' ? 'p2' : 'p1';
        const activePlayerName = players[nextPlayerId];

        setTimeout(() => {
            // RELIABILITY: safely normalize active player name before comparisons
            const normalizedActivePlayerName = typeof activePlayerName === 'string' ? activePlayerName.toLowerCase() : '';
            // [GeminiFix: NullGuard]
            if (
                gameState !== 'secretLoveRound' &&
                normalizedActivePlayerName === 'katy' &&
                !secretRoundUsed &&
                Math.random() < 0.15
            ) {
                setSecretRoundUsed(true);
                const secretPrompt = secretRoundPrompts[Math.floor(Math.random() * secretRoundPrompts.length)];
                setGameState("secretLoveRound");
                handleThemeChange("foreverPromise");
                setSecretSticky(true);
                setIsSecretThemeUnlocked(true);
                safeOpenModal("secretPrompt", { prompt: secretPrompt });
            }
        }, 100);

        if (isExtremeMode || gameState === 'secretLoveRound') {
            setIsExtremeMode(false);
            setExtremeRoundSource(null);
            if (!(isSecretThemeUnlocked && secretSticky)) {
                handleThemeChange(previousThemeRef.current || "velourNights");
            }
        }

        const newRoundCount = roundCount + 1;
        setRoundCount(newRoundCount);
        setCurrentPlayer(nextPlayerId);
        setGameState('turnIntro');
        let increment = 5;
        if (newRoundCount > 10) {
            increment = 20;
        } else if (newRoundCount > 5) {
            increment = 10;
        }
        
        const newPulseLevel = Math.min(pulseLevel + increment, 100);

        if (newPulseLevel >= 100 && !isExtremeMode) {
             setPendingExtremeRound('spark');
             setPulseLevel(100);
        } else {
            setPulseLevel(newPulseLevel);
        }
    
        if (!isExtremeMode && newPulseLevel < 100 && Math.random() < 0.1) {
            if (isSpinInProgress || modalState.type) {
                setPendingExtremeRound('random');
            } else {
                triggerExtremeRound('random');
            }
        }
    }, [isExtremeMode, roundCount, pulseLevel, isSpinInProgress, modalState.type, triggerExtremeRound, players, currentPlayer, handleThemeChange, gameState, secretRoundUsed, secretSticky, safeOpenModal, isSecretThemeUnlocked]);
    
    const closeModal = useCallback(() => {
        audioEngine.playModalClose();
        setModalState({ type: "", data: null });
    }, [setModalState]);

    const handlePromptModalClose = useCallback(() => {
        closeModal();
        dispatchQueue({ type: 'UNLOCK' });
        pendingPromptRef.current = null;
        endRoundAndStartNew();
    }, [closeModal, endRoundAndStartNew, dispatchQueue]);

    const handleConsequenceClose = useCallback(() => {
        closeModal();
        dispatchQueue({ type: 'UNLOCK' });
        pendingPromptRef.current = null;
        endRoundAndStartNew();
    }, [closeModal, endRoundAndStartNew, dispatchQueue]);

    const handleSecretLoveRoundClose = useCallback(() => {
        setModalState({ type: "", data: null });
        endRoundAndStartNew();
    }, [setModalState, endRoundAndStartNew]);

    const handleExtremeIntroClose = useCallback(() => {
        setModalState({ type: "", data: null });
        setIsExtremeMode(true);
        handleThemeChange('crimsonFrenzy');
        setGameState("extremeRound");
        setExtremeModeReady(true);
        if (extremeRoundSource === 'spark' && (roundCount + 1) % 5 === 0) {
            setTimeout(() => setPulseLevel(0), 1000);
        }
    }, [extremeRoundSource, roundCount, handleThemeChange, setModalState]);

    const pickPrompt = useCallback((category, list) => {
        // DIAGNOSTIC: validate prompt selection inputs before accessing caches
        if (typeof category !== 'string' || !category.trim()) {
            console.warn('[DIAGNOSTIC][App.jsx][pickPrompt] Invalid category key supplied:', category);
            return '';
        }
        if (!Array.isArray(list)) {
            console.warn('[DIAGNOSTIC][App.jsx][pickPrompt] Prompt list missing or malformed for category:', category, list);
            return '';
        }
        const recent = recentPrompts && typeof recentPrompts === 'object' ? recentPrompts[category] || [] : [];
        if (recentPrompts && typeof recentPrompts !== 'object') {
            console.warn('[DIAGNOSTIC][App.jsx][pickPrompt] recentPrompts state invalid:', recentPrompts);
        }
        // RELIABILITY: Ensure recent prompt cache supports includes lookups.
        const available = list.filter(p => !(Array.isArray(recent) && recent.includes(p)));
        const choice = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : list[Math.floor(Math.random() * list.length)] || 'No prompts available.';
        setRecentPrompts(prev => ({ ...prev, [category]: [...recent.slice(-4), choice] }));
        return choice;
    }, [recentPrompts]);
    
    const handleSpinStart = useCallback((meta = { source: 'wheel' }) => {
        if (spinWatchdogRef.current) {
            clearTimeout(spinWatchdogRef.current);
        }
        pendingPromptRef.current = null;
        spinWatchdogRef.current = setTimeout(() => {
            const queueSnapshot = promptQueueStateRef.current;
            const activeModalType = modalStateRef.current?.type;
            if (activeModalType === 'prompt') return;
            if (queueSnapshot.active || queueSnapshot.queue.length || queueSnapshot.deliveryLock) return;
            if (pendingPromptRef.current) {
                enqueuePrompt(pendingPromptRef.current, { source: 'watchdog' });
                pendingPromptRef.current = null;
            }
        }, 6000);
    }, [enqueuePrompt]);

    const handleSpinFinish = useCallback((category, meta = { source: 'wheel' }) => {
        // RELIABILITY: guard undefined winner/payload to prevent .toLowerCase() crash
        if (typeof category !== 'string' || !category.trim()) {
            console.warn("[Reliability] Invalid winner payload:", category);
            // DIAGNOSTIC: report invalid winner payload in diagnostic channel
            console.warn('[DIAGNOSTIC][App.jsx][handleSpinFinish] Winner category invalid:', category);
            return;
        }
        // RELIABILITY: safe normalization of category string
        const normalizedCategory = category.toLowerCase();
        // DIAGNOSTIC: ensure prompts payload is available before destructuring
        if (!prompts || typeof prompts !== 'object') {
            console.warn('[DIAGNOSTIC][App.jsx][handleSpinFinish] Prompts state unavailable:', prompts);
            return;
        }
        const { truthPrompts, darePrompts, triviaQuestions } = prompts;
        if (!truthPrompts || typeof truthPrompts !== 'object' || !darePrompts || typeof darePrompts !== 'object' || !triviaQuestions || typeof triviaQuestions !== 'object') {
            console.warn('[DIAGNOSTIC][App.jsx][handleSpinFinish] Prompt collections malformed:', { truthPrompts, darePrompts, triviaQuestions });
            return;
        }
        const source = meta?.source || 'wheel';
        // RELIABILITY: branch prompt pools using normalized category
        const list =
            normalizedCategory === 'truth'
                ? (isExtremeMode ? truthPrompts.extreme : [...truthPrompts.normal, ...truthPrompts.spicy])
                : normalizedCategory === 'dare'
                ? (isExtremeMode ? darePrompts.extreme : [...darePrompts.normal, ...darePrompts.spicy])
                : [...triviaQuestions.normal];

        // DIAGNOSTIC: prevent downstream includes/filter operations on invalid prompt lists
        if (!Array.isArray(list)) {
            console.warn('[DIAGNOSTIC][App.jsx][handleSpinFinish] Derived prompt list invalid for category:', normalizedCategory, list);
            return;
        }

        const validList = list.filter(p => typeof p === 'string' && p.trim() !== '');
        // RELIABILITY: ensure prompt selection uses normalized category key
        const text = pickPrompt(normalizedCategory, validList);
        // RELIABILITY: ensure title lookup uses normalized key
        const title = { truth: 'The Velvet Truth...', dare: 'The Royal Dare!', trivia: 'The Trivia Challenge' }[normalizedCategory] || 'Your Challenge';

        if (!text) return;

        // RELIABILITY: ensure prompt includes normalized category for queue validation
        const prompt = { title, text, type: normalizedCategory, category: normalizedCategory, source };
        pendingPromptRef.current = prompt;
        enqueuePrompt(prompt, { source });
    }, [prompts, isExtremeMode, pickPrompt, enqueuePrompt]);

    useEffect(() => {
        if (queueState.active || modalState.type === 'prompt') {
            if (spinWatchdogRef.current) {
                clearTimeout(spinWatchdogRef.current);
                spinWatchdogRef.current = null;
            }
        }
    }, [queueState.active, modalState.type]);

    useEffect(() => () => {
        if (spinWatchdogRef.current) {
            clearTimeout(spinWatchdogRef.current);
            spinWatchdogRef.current = null;
        }
    }, []);

    const handleRefuse = useCallback(() => {
        audioEngine.playRefuse();
        setModalState({type: "", data: null});

        const list = isExtremeMode ? [...(prompts.consequences.extreme || [])] : [...(prompts.consequences.normal || []), ...(prompts.consequences.spicy || [])];
        const filteredList = list.filter(c => c && c.trim() !== '');
        const text = filteredList.length > 0 ? filteredList[Math.floor(Math.random() * filteredList.length)] : "Add consequences in the editor!";

        setTimeout(() => {
            safeOpenModal('consequence', { text });
        }, 50);
        pendingPromptRef.current = null;
    }, [isExtremeMode, prompts, safeOpenModal, setModalState]);

    const handleEditorClose = useCallback((updatedPrompts) => { 
        if (updatedPrompts) { 
            audioEngine.playCorrect(); 
            updatePrompts(updatedPrompts); 
        }
        if (modalState.data?.from === 'settings') {
             setModalState({ type: 'settings', data: null });
        } else {
             closeModal();
        }
    }, [updatePrompts, modalState.data, closeModal, setModalState]);

    const handleConfirmReset = useCallback(() => { 
        audioEngine.playRefuse(); 
        resetPrompts(); 
        setModalState({ type: 'editor', data: { from: 'settings' } }); 
    }, [resetPrompts, setModalState]);

    const handleRestartGame = useCallback(() => {
        setPulseLevel(0);
        setRoundCount(0);
        setPlayers({ p1: 'Player 1', p2: 'Player 2' });
        setCurrentPlayer('p1');
        setIsExtremeMode(false);
        setSecretRoundUsed(false);
        resetQueue();
        pendingPromptRef.current = null;
        if (spinWatchdogRef.current) {
            clearTimeout(spinWatchdogRef.current);
            spinWatchdogRef.current = null;
        }
        setModalState({ type: "", data: null });
        setGameState('onboarding_intro');
        setSecretSticky(false);
        setIsSecretThemeUnlocked(false);
    }, [setModalState, resetQueue]);

    const handleQuitGame = useCallback(() => {
        handleRestartGame();
        setGameState('unlock');
    }, [handleRestartGame]);
    
    const renderContent = () => {
        const onboardingProps = { activeVisualTheme };
        const motionProps = {
            className: "w-full h-full absolute inset-0",
            initial: { x: '100%', opacity: 0 },
            animate: { x: 0, opacity: 1 },
            exit: { x: '-100%', opacity: 0 },
            transition: { duration: 0.4, ease: 'easeInOut' }
        };

        if (isLoading) { return <div className="flex items-center justify-center h-screen"><p className="text-[#FFD700] text-3xl font-['Great_Vibes'] animate-pulse">Setting the Mood...</p></div>; }
        
        const canSpin = !isSpinInProgress && !modalState.type && (gameState === 'playing' || (gameState === 'extremeRound' && extremeModeReady));

        return (
            <AnimatePresence mode="wait" initial={false}>
                {gameState === "unlock" && (
                <motion.div key="unlock" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
                     <AudioUnlockScreen onUnlock={handleUnlockAudio} disabled={isUnlockingAudio} {...onboardingProps} />
                </motion.div>
                )}
                {gameState === "onboarding_intro" && (
                <motion.div key="onboarding_intro" {...motionProps}>
                    <OnboardingIntro onNext={() => setGameState("onboarding_vibe")} {...onboardingProps} />
                </motion.div>
                )}
                {gameState === "onboarding_vibe" && (
                <motion.div key="onboarding_vibe" {...motionProps}>
                    <OnboardingVibePicker currentTheme={currentTheme} onVibeSelect={(theme) => { handleThemeChange(theme); setGameState("enterNames"); }} {...onboardingProps} />
                </motion.div>
                )}
                {gameState === "enterNames" && (
                <motion.div key="enterNames" {...motionProps}>
                    <PlayerNameScreen onStart={handleNameEntry} {...onboardingProps} />
                </motion.div>
                )}
                {(gameState === "playing" || gameState === "turnIntro" || gameState === "extremeRound" || gameState === "secretLoveRound") && (
                <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
                    <div ref={mainContentRef} className="w-full h-full z-[60] flex flex-col">
                        <header className="relative w-full flex justify-center items-center p-4 pt-6 shrink-0">
                            <h1 className={`text-6xl ${activeVisualTheme.titleText} font-['Great_Vibes']`} style={{ filter: `drop-shadow(0 0 15px ${activeVisualTheme.titleShadow})` }}>
                                Pulse
                            </h1>
                            <motion.button onClick={() => { audioEngine.playUIConfirm(); setModalState({ type: "settings", data: null }); }} className="absolute top-6 right-4 text-[#FFD700] hover:text-yellow-300 bg-black/20 backdrop-blur-md border border-white/10 p-3 rounded-full shadow-lg" whileTap={{ scale: 0.9, rotate: -15 }} whileHover={{ scale: 1.15, rotate: 15, boxShadow: "0 0 25px var(--theme-highlight)" }} aria-label="Settings">
                                <SettingsIcon />
                            </motion.button>
                        </header>
                        <main className="w-full flex-grow flex flex-col items-center justify-start pt-4 md:pt-0 md:justify-center px-4" style={{ perspective: "1000px" }}>
                            {gameState !== 'secretLoveRound' && 
                                <Wheel
                                    onSpinFinish={handleSpinFinish}
                                    onSpinStart={handleSpinStart}
                                    playWheelSpinStart={audioEngine.playWheelSpinStart}
                                    playWheelTick={audioEngine.playWheelTick}
                                    playWheelStop={audioEngine.playWheelStopSound}
                                    setIsSpinInProgress={setIsSpinInProgress} 
                                    currentTheme={currentTheme} 
                                    canSpin={canSpin} 
                                    reducedMotion={prefersReducedMotion} 
                                    safeOpenModal={safeOpenModal} 
                                    handleThemeChange={handleThemeChange}
                                    setGameState={setGameState}
                                    setSecretSticky={setSecretSticky}
                                    setIsSecretThemeUnlocked={setIsSecretThemeUnlocked}
                                    isSpinInProgress={isSpinInProgress}
                                    modalStateRef={modalStateRef}
                                    registerWatchdogControl={registerWheelControl}
                                />
                            }
                            <div className="relative mt-8">
                                <PulseMeter level={pulseLevel} />
                                {(gameState === 'playing' || gameState === 'extremeRound' || gameState === 'turnIntro') && (
                                    <div className="turn-banner">
                                        {players[currentPlayer]}'s Turn!
                                    </div>
                                )}
                                 {gameState === 'secretLoveRound' && (
                                    <div className="turn-banner text-2xl text-[#e2d4ff]">
                                        A Special Question for {players[currentPlayer]}...
                                    </div>
                                )}
                            </div>
                        </main>
                        <footer className="w-full p-4 flex flex-col items-center shrink-0">
                        </footer>
                        {audioInitFailed && (
                            <div className="fixed bottom-24 right-4 z-[60] bg-red-900/50 text-white text-xs px-3 py-1 rounded-full border border-red-500 backdrop-blur-sm">
                            Audio failed to initialize.
                            </div>
                        )}
                    </div>
                </motion.div>
                )}
            </AnimatePresence>
        );
    };

    return (
        <div
            id="app-container"
            className={`min-h-screen ${activeVisualTheme.themeClass} font-['Inter',_sans-serif] text-white flex flex-col items-center overflow-hidden relative ${prefersReducedMotion ? 'reduced-motion' : ''}`}
            style={{
                '--pulse-glow-intensity': `${pulseLevel / 100}`,
                '--beat-duration': `${60 / audioEngine.getCurrentBpm()}s`
            }}
        >
            <MotionConfig transition={{ type: "spring", stiffness: 240, damping: 24 }}>
                <div className={`bg-layer ${activeBg === 1 ? 'opacity-100' : 'opacity-0'} ${prevBackgroundClass}`} />
                <div className={`bg-layer ${activeBg === 2 ? 'opacity-100' : 'opacity-0'} ${activeBackgroundClass}`} />
                
                <ParticleBackground
                    currentTheme={backgroundTheme}
                    pulseLevel={pulseLevel}
                    bpm={audioEngine.getCurrentBpm()}
                    reducedMotion={prefersReducedMotion}
                />
                <div className="hdr-glow-overlay" />
                <Vignette />
                <NoiseOverlay reducedMotion={prefersReducedMotion} />
                <div className="aurora-reflect" />
                <RadialLighting reducedMotion={prefersReducedMotion} />
                
                <AnimatePresence>
                {showConfetti && (
                    <Confetti key="confetti" onFinish={() => setShowConfetti(false)} origin={confettiOrigin} theme={currentTheme} reducedMotion={prefersReducedMotion} />
                )}
                {showPowerSurge && (
                    <PowerSurgeEffect key="power-surge" onComplete={() => setShowPowerSurge(false)} reducedMotion={prefersReducedMotion} />
                )}
                </AnimatePresence>

                <div id="app-content" aria-hidden={!!modalState.type} className="w-full h-screen relative overflow-hidden">
                    {renderContent()}
                </div>
                
                <AnimatePresence initial={false}>
                    <ModalManager
                        modalState={modalState}
                        handlePromptModalClose={handlePromptModalClose}
                        handleConsequenceClose={handleConsequenceClose}
                        handleRefuse={handleRefuse}
                        setModalState={setModalState}
                        activeVisualTheme={activeVisualTheme}
                    />
                    {modalState.type === "extremeIntro" && (
                        <>
                        <ExtremeIntroEffect key={`introfx-${currentTheme}`} theme={currentTheme} reducedMotion={prefersReducedMotion} />
                        <ExtremeIntroModal isOpen={true} onClose={handleExtremeIntroClose} activeVisualTheme={activeVisualTheme} />
                        </>
                    )}
                    {modalState.type === "secretMessage" && (
                        <SecretMessageModal 
                            key="secret-message" 
                            isOpen={true} 
                            outcome={modalState.data.outcome} 
                            onClose={handleSecretLoveRoundClose} 
                            activeVisualTheme={activeVisualTheme} />
                    )}
                    {modalState.type === "editor" && (
                        <EditorModal key="editor" isOpen={true} onClose={handleEditorClose} prompts={prompts} onReset={() => setModalState({ type: "confirmReset", data: { from: "settings" } })} activeVisualTheme={activeVisualTheme} />
                    )}
                    {modalState.type === "settings" && (
                        <SettingsModal
                        key="settings"
                        isOpen={true}
                        onClose={() => setModalState({ type: "", data: null })}
                        settings={settings}
                        onSettingsChange={(newSettings) => setSettings((prev) => ({ ...prev, ...newSettings }))}
                        isMuted={isMuted}
                        onMuteToggle={handleToggleMute}
                        onEditPrompts={() => setModalState({ type: "editor", data: { from: "settings" } })}
                        onThemeChange={handleThemeChange}
                        currentTheme={currentTheme}
                        onRestart={() => setModalState({ type: "confirmRestart", data: {} })}
                        onQuit={() => setModalState({ type: "confirmQuit", data: {} })}
                        activeVisualTheme={activeVisualTheme}
                        reducedMotion={prefersReducedMotion}
                        onReducedMotionToggle={() => setPrefersReducedMotion((p) => !p)}
                        canUseForeverTheme={isSecretThemeUnlocked}
                        />
                    )}
                    {modalState.type === "confirmReset" && (
                        <ConfirmModal key="confirm-reset" isOpen={true} onClose={() => { setModalState({ type: modalState.data?.from === "settings" ? "editor" : "settings", data: { from: "settings" } }); }} onConfirm={handleConfirmReset} title="Confirm Reset" message="Are you sure? This will replace all prompts with the defaults." activeVisualTheme={activeVisualTheme} />
                    )}
                    {modalState.type === "confirmRestart" && (
                        <ConfirmModal key="confirm-restart" isOpen={true} onClose={() => setModalState({ type: "settings", data: null })} onConfirm={handleRestartGame} title="Confirm Restart" message="Are you sure? This will restart the game and reset all progress." activeVisualTheme={activeVisualTheme} />
                    )}
                    {modalState.type === "confirmQuit" && (
                        <ConfirmModal key="confirm-quit" isOpen={true} onClose={() => setModalState({ type: "settings", data: null })} onConfirm={handleQuitGame} title="Confirm Quit" message="Are you sure you want to quit? All progress will be lost." activeVisualTheme={activeVisualTheme} />
                    )}
                </AnimatePresence>
            </MotionConfig>
        </div>
    );
}

// === MODAL MANAGER (Atomic Mount/Ack System) ===
function ModalManager({ modalState, handlePromptModalClose, handleConsequenceClose, handleRefuse, setModalState, activeVisualTheme }) {
    if (!modalState?.type) return null;

    const { type, data } = modalState;
    // Only manage the core gameplay modals here. Others are handled directly in App.
    if (type !== 'prompt' && type !== 'consequence' && type !== 'secretPrompt') {
      return null;
    }

    const key = data?._id || safeUUID();

    switch (type) {
      case "prompt":
        return <PromptModal key={key} isOpen={true} prompt={data} onClose={handlePromptModalClose} onRefuse={handleRefuse} activeVisualTheme={activeVisualTheme} />;
      case "consequence":
        return <ConsequenceModal key={key} isOpen={true} text={data.text} onClose={handleConsequenceClose} activeVisualTheme={activeVisualTheme} />;
      case "secretPrompt":
         const handleAccept = () => setModalState({ type: 'secretMessage', data: { outcome: data.prompt.outcomes.accept } });
         const handleSecretRefuse = () => setModalState({ type: 'secretMessage', data: { outcome: data.prompt.outcomes.refuse } });
        return <SecretPromptModal key={key} isOpen={true} prompt={data.prompt} onAccept={handleAccept} onRefuse={handleSecretRefuse} activeVisualTheme={activeVisualTheme} />;
      default:
        return null;
    }
}


export default App;
