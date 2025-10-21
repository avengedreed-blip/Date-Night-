// TRACE: module load marker
try { console.log('[INIT]', 'App.jsx'); } catch {}
// DIAGNOSTIC: module load marker
console.log('[APP] App.jsx module loading...');
/* --- PROMPT RELIABILITY FIX --- */
/* --- SECRET ROUND TIMING PATCH --- */
/* --- UNIVERSAL TRIPLE-TAP RESTORE --- */
import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer, useLayoutEffect, useId } from 'react'; // [Fix A11Y-03]
import { createPortal } from 'react-dom'; // RELIABILITY: safe import
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, MotionConfig } from 'framer-motion';
// RELIABILITY: IndexedDB prompt storage helpers.
// RELIABILITY: Lazily access prompt storage to avoid TDZ on circular imports.
import { getDbStoreInstance, subscribePromptStoreFallback } from './utils/promptStoreCore.js'; // RELIABILITY: lazy access to store to avoid TDZ
// RELIABILITY: load gesture logic first (inert)
import { attachAudioGestureListeners, silenceToneErrors } from './audioGate.js';
// RELIABILITY: then load core engine (lazy async Tone)
import { getAudioEngine, resumeAudioOnGesture, loadTone } from './core/audioCore.js'; // [Fix H2]

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

// Registry to suppress click immediately after a secret round opens
const secretPromptOpenAt = { t: 0 };

// Polyfill for structuredClone for wider browser compatibility.
if (typeof structuredClone !== "function") {
    globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// VISUAL: particles mounted outside stacking contexts
function ParticleLayerPortal({ children }) {
  const target = typeof document !== 'undefined' ? document.body : null;
  return target ? createPortal(children, target) : null;
}

// RELIABILITY: Lazy audio engine accessor exposed for runtime consumers.
// RELIABILITY: Provide synchronous placeholder that upgrades once the async audio engine resolves.
const getAudioEngineInstance = () => {
  // RELIABILITY: holder caches the resolved engine for downstream delegates.
  const engineHolder = { current: null };
  // RELIABILITY: helper ensures the Tone-backed engine loads only once per component lifecycle.
  const ensureEngine = async () => {
    if (engineHolder.current) return engineHolder.current;
    try {
      const engine = await getAudioEngine();
      engineHolder.current = engine;
      return engineHolder.current;
    } catch (err) {
      // RELIABILITY: surface loader failures without interrupting render work
      console.warn('[Reliability] Failed to load audio engine:', err);
      return null;
    }
  };
  // [Fix PERF-01] Defer engine loading until a consumer explicitly invokes an action.
  // RELIABILITY: asynchronous methods that must return promises for compatibility with existing awaiters.
  const asyncMethods = ['initialize', 'startTheme', 'stopTheme'];
  // RELIABILITY: synchronous fire-and-forget methods invoked from UI interactions.
  const syncMethods = [
    'toggleMute',
    'setMasterVolume',
    'setMusicVolume',
    'setSfxVolume',
    'playWheelSpinStart',
    'playWheelTick',
    'playWheelStopSound',
    'playModalOpen',
    'playModalClose',
    'playCorrect',
    'playWrong',
    'playExtremePrompt',
    'playRefuse',
    'playUIConfirm',
  ];
  // RELIABILITY: placeholder delegates to real engine once available while providing safe fallbacks.
  const placeholder = {
    // RELIABILITY: deterministic BPM fallback keeps timing tokens stable pre-initialization.
    getCurrentBpm: () => (engineHolder.current?.getCurrentBpm ? engineHolder.current.getCurrentBpm() : 85),
  };
  // RELIABILITY: wire asynchronous delegates that await engine resolution before invoking.
  asyncMethods.forEach((method) => {
    placeholder[method] = async (...args) => {
      const engine = await ensureEngine();
      if (!engine || typeof engine[method] !== 'function') return method === 'initialize' ? false : undefined;
      return engine[method](...args);
    };
  });
  // RELIABILITY: wire synchronous delegates that no-op until the engine becomes available.
  syncMethods.forEach((method) => {
    placeholder[method] = (...args) => {
      const engine = engineHolder.current;
      if (!engine || typeof engine[method] !== 'function') return undefined;
      return engine[method](...args);
    };
  });
  return placeholder;
};

// THEME: Global theme profiles including backgrounds and accents for CSS propagation.
const themeProfiles = Object.freeze({
  // THEME: Velour Nights palette and theming variables.
  velourNights: {
    name: "Velour Nights",
    background: "linear-gradient(145deg, #13001f 0%, #250037 60%, #170020 100%)",
    highlight: "#FFD700",
    accent: "#F777B6",
    meter: ["#F777B6", "#FFD700", "#FFFFFF"],
    music: "Velour Nights",
  },
  // THEME: Lotus Dreamscape palette and theming variables.
  lotusDreamscape: {
    name: "Lotus Dreamscape",
    background: "linear-gradient(145deg, #1a1632 0%, #2d2447 60%, #191526 100%)",
    highlight: "#C0C0FF",
    accent: "#6A5ACD",
    meter: ["#6A5ACD", "#FFFFFF", "#ADD8E6"],
    music: "Lotus Dreamscape",
  },
  // THEME: Velvet Carnival palette and theming variables.
  velvetCarnival: {
    name: "Velvet Carnival",
    background: "linear-gradient(145deg, #3a0c00 0%, #6b2c00 60%, #2e1100 100%)",
    highlight: "#FFD700",
    accent: "#FF4500",
    meter: ["#FFD700", "#FF4500", "#FFFFFF"],
    music: "Velvet Carnival",
  },
  // THEME: Starlit Abyss palette and theming variables.
  starlitAbyss: {
    name: "Starlit Abyss",
    background: "linear-gradient(145deg, #020212 0%, #05051a 60%, #0a0b20 100%)",
    highlight: "#9EBEFF",
    accent: "#8CA6FF",
    meter: ["#FFFFFF", "#E6E6FA", "#D8BFD8"],
    music: "Starlit Abyss",
  },
  // THEME: Crimson Frenzy palette and theming variables.
  crimsonFrenzy: {
    name: "Crimson Frenzy",
    background: "radial-gradient(circle at center, #1a0000 0%, #4b0000 100%)",
    highlight: "#FF004D",
    accent: "#FF477E",
    meter: ["#FF477E", "#FF004D", "#800020"],
    music: "Crimson Frenzy",
  },
  // THEME: Lavender Promise palette and theming variables.
  lavenderPromise: {
    name: "Lavender Promise",
    background: "linear-gradient(145deg, #544b80 0%, #b8a1ff 40%, #e4dfff 100%)",
    highlight: "#F6A2FF",
    accent: "#D47AFF",
    meter: ["#B8A1FF", "#E2D4FF", "#F2E6FF"],
    music: "Lavender Promise",
  },
  // THEME: Forever Promise palette and theming variables.
  foreverPromise: {
    name: "Forever Promise",
    background:
      "radial-gradient(60% 60% at 50% 40%, rgba(230,160,255,0.95), rgba(140,60,200,0.9) 60%, rgba(60,20,120,0.92) 100%), linear-gradient(180deg, rgba(60,20,120,0.9), rgba(30,10,80,0.95))",
    highlight: "#F2AAFF",
    accent: "#D88BF2",
    meter: ["#8C42C6", "#D88BF2", "#F2AAFF"],
    music: "Forever Promise",
  },
});


// --- DATA & PROMPTS ---
let promptDataCache = null; // [Fix PERF-02]
let promptDataPromise = null; // [Fix PERF-02]

const loadPromptData = async () => { // [Fix PERF-02]
  if (promptDataCache) {
    return promptDataCache;
  }
  if (!promptDataPromise) {
    promptDataPromise = import('./data/prompts.json')
      .then((mod) => {
        promptDataCache = mod?.default ?? mod;
        return promptDataCache;
      })
      .catch((err) => {
        console.warn('[Reliability] Failed to load prompt catalog:', err);
        promptDataPromise = null;
        throw err;
      });
  }
  return promptDataPromise;
};

const clonePromptData = (data) => (data ? structuredClone(data) : null); // [Fix PERF-02]


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

const hasArrayBuckets = (bucket, keys) => {
    if (!bucket || typeof bucket !== 'object') return false;
    return keys.every((key) => Array.isArray(bucket[key]));
};

// RELIABILITY: Normalize stored prompt payloads to avoid malformed queue crashes.
const normalizeStoredPrompts = (value, defaults) => { // [Fix PERF-02]
    const base = clonePromptData(defaults);
    if (!base) {
        return value && typeof value === 'object' ? structuredClone(value) : null;
    }
    if (!value || typeof value !== 'object') {
        return base;
    }
    try {
        const truthValid = hasArrayBuckets(value.truthPrompts, ['normal', 'spicy', 'extreme']);
        const dareValid = hasArrayBuckets(value.darePrompts, ['normal', 'spicy', 'extreme']);
        const triviaValid = hasArrayBuckets(value.triviaQuestions, ['normal']);
        const consequenceValid = hasArrayBuckets(value.consequences, ['normal', 'spicy', 'extreme']);

        if (!(truthValid && dareValid && triviaValid && consequenceValid)) {
            return base;
        }

        return {
            ...base,
            ...value,
            truthPrompts: { ...base.truthPrompts, ...value.truthPrompts },
            darePrompts: { ...base.darePrompts, ...value.darePrompts },
            triviaQuestions: { ...base.triviaQuestions, ...value.triviaQuestions },
            consequences: { ...base.consequences, ...value.consequences },
        };
    } catch (err) {
        console.warn('[Reliability] Failed to normalize stored prompts, using defaults instead.', err);
        return base;
    }
};

const useLocalStoragePrompts = () => {
    const [defaultPromptsState, setDefaultPromptsState] = useState(promptDataCache); // [Fix PERF-02]
    const [prompts, setPrompts] = useState(() => clonePromptData(promptDataCache)); // [Fix PERF-02]
    const [isPromptsLoading, setIsPromptsLoading] = useState(true);
    const dbStore = useMemo(() => getDbStoreInstance(), []);

    useEffect(() => {
        let isActive = true;
        (async () => {
            try {
                const defaults = await loadPromptData();
                if (!isActive) return;
                setDefaultPromptsState(defaults);

                const stored = await dbStore.getPrompt('prompts');
                if (stored) {
                    const normalized = normalizeStoredPrompts(stored, defaults);
                    if (isActive && normalized) {
                        setPrompts(normalized);
                        return;
                    }
                }

                const legacy = typeof localStorage !== 'undefined' ? localStorage.getItem('prompts') : null;
                if (legacy) {
                    try {
                        const parsed = JSON.parse(legacy);
                        const normalized = normalizeStoredPrompts(parsed, defaults);
                        const next = normalized || (parsed && typeof parsed === 'object' ? structuredClone(parsed) : null);
                        if (next) {
                            if (isActive) {
                                setPrompts(next);
                            }
                            await dbStore.setPrompt('prompts', next);
                            if (typeof localStorage !== 'undefined') {
                                localStorage.removeItem('prompts');
                            }
                            return;
                        }
                    } catch (err) {
                        console.warn('[Reliability] Failed to parse legacy prompts during hydration', err);
                    }
                }

                if (isActive) {
                    setPrompts(clonePromptData(defaults));
                }
            } catch (err) {
                console.warn('[Reliability] Failed to hydrate prompts from IndexedDB', err);
                if (isActive && promptDataCache) {
                    setPrompts(clonePromptData(promptDataCache));
                }
            } finally {
                if (isActive) {
                    setIsPromptsLoading(false);
                }
            }
        })();

        return () => {
            isActive = false;
        };
    }, [dbStore]);

    useEffect(() => { // [Fix A1] Ensure fade effect runs within hook scope
        const el = document.getElementById('app-content') || document.body;
        if (!el) return;
        try {
            el.style.transition = 'background 0.6s ease-in-out, opacity 0.5s ease-in-out';
            el.style.opacity = '0.85';
            requestAnimationFrame(() => { el.style.opacity = '1'; });
        } catch {}
    }, []);

    const updatePrompts = useCallback((newPrompts) => { // [Fix PERF-02]
        const defaults = defaultPromptsState || promptDataCache;
        const normalized = normalizeStoredPrompts(newPrompts, defaults);
        const next = normalized || (newPrompts && typeof newPrompts === 'object' ? structuredClone(newPrompts) : null);
        if (!next) return;
        setPrompts(next);
        dbStore.setPrompt('prompts', next);
    }, [defaultPromptsState, dbStore]);

    const resetPrompts = useCallback(() => { // [Fix PERF-02]
        const defaults = defaultPromptsState || promptDataCache;
        if (defaults) {
            const cloned = clonePromptData(defaults);
            setPrompts(cloned);
            dbStore.setPrompt('prompts', cloned);
            return;
        }
        loadPromptData()
            .then((loaded) => {
                setDefaultPromptsState(loaded);
                const cloned = clonePromptData(loaded);
                setPrompts(cloned);
                dbStore.setPrompt('prompts', cloned);
            })
            .catch((err) => {
                console.warn('[Reliability] Failed to reset prompts to defaults:', err);
            });
    }, [defaultPromptsState, dbStore]);

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

const ParticleBackground = React.memo(({ currentTheme, pulseLevel, bpm, reducedMotion, style, className }) => {
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

    // VISUAL: ensure particle canvas renders above parallax but below primary UI
    return (
        <canvas
            ref={canvasRef}
            // VISUAL: allow external className injection for global positioning overrides
            className={`particle-canvas${className ? ` ${className}` : ''}`}
            style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, ...(style || {}) }}
        ></canvas>
    );
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

    const resolvedClassName = className ? `particle-canvas ${className}` : 'particle-canvas';
    return <canvas ref={canvasRef} className={resolvedClassName} style={style} />;
};

const CATEGORIES = ['TRUTH', 'DARE', 'TRIVIA'];

const Wheel = React.memo(({onSpinFinish, onSpinStart, playWheelSpinStart, playWheelTick, playWheelStop, setIsSpinInProgress, currentTheme, canSpin, reducedMotion, safeOpenModal, handleThemeChange, safeSetGameState, safeSetSecretSticky, safeSetIsSecretThemeUnlocked, safeSetSecretRoundUsed, safeSetPulseLevel, extremeActive, isSpinInProgress, modalStateRef, registerWatchdogControl}) => { // [Fix RC-02][Fix SM-01][Fix A11Y-04]
    const [isSpinning, setIsSpinning] = useState(false);
    const [isPointerSettling, setIsPointerSettling] = useState(false);
    const rotationRef = useRef(0);
    const wheelCanvasRef = useRef(null);
  const LONG_PRESS_MS = 650; // INTERACT: secret round activation threshold for long-press gesture
  const longPressRef = useRef({ timer: null, active: false, triggered: false }); // INTERACT: maintain timer lifecycle and trigger gating
  const failsafeRef = useRef(null);
    const animationFrameRef = useRef(null);
    const spinLock = useRef(false);
    const lastSpinTimeRef = useRef(0);
    const [liveAnnouncement, setLiveAnnouncement] = useState(''); // [Fix A11Y-04]
    const clearLongPressTimer = useCallback(() => { // [Fix RC-02]
      longPressRef.current.active = false;
      if (longPressRef.current.timer) {
        clearTimeout(longPressRef.current.timer);
        longPressRef.current.timer = null;
      }
    }, []);
    const lastExtremeState = useRef(false); // [Fix A11Y-04]

    const finalizeSpin = useCallback((reason = 'complete') => {
        const rotation = rotationRef.current;
        // RELIABILITY: compute winner category based on pointer alignment (bias slightly negative)
        // RELIABILITY: sub-degree-stable alignment to prevent boundary misclassification
        const sliceAngle = 360 / CATEGORIES.length; // RELIABILITY: stable slice width for category segmentation
        const normalized = ((-rotation + 90) % 360 + 360) % 360; // RELIABILITY: normalized pointer angle within [0, 360)
        const EPSILON = 0.00001; // RELIABILITY: epsilon guards against floating-point drift
        const adjusted = (normalized - sliceAngle / 6 + 360 + EPSILON) % 360; // RELIABILITY: bias centers pointer with jitter padding
        let sliceIndex = Math.floor(adjusted / sliceAngle); // RELIABILITY: floor index to map to slice
        // RELIABILITY: clamp overflow for 359.9999° edge cases
        if (sliceIndex >= CATEGORIES.length) sliceIndex = CATEGORIES.length - 1; // RELIABILITY: enforce upper bound safety net
        // RELIABILITY: capture raw winner before normalization
        const rawWinner = CATEGORIES[sliceIndex];
        // RELIABILITY: guard undefined winner/payload to prevent .toLowerCase() crash
        if (typeof rawWinner !== 'string' || !rawWinner) {
            console.warn("[Reliability] Invalid winner payload:", rawWinner);
            return;
        }
        // RELIABILITY: safe normalization of winner label
        const winner = rawWinner.toLowerCase();
        setLiveAnnouncement(`Wheel result: ${winner}`); // [Fix A11Y-04]
        // DIAGNOSTIC: verify winner dispatch target is callable before invoking
        if (typeof onSpinFinish !== 'function') {
            console.warn('[DIAGNOSTIC][App.jsx][Wheel.finalizeSpin] onSpinFinish handler missing:', onSpinFinish);
            return;
        }
        onSpinFinish(winner, { source: reason });
    }, [onSpinFinish, setLiveAnnouncement]);

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

  // INTERACT: encapsulate secret round trigger for long-press invocation
  const triggerSecretRound = useCallback(() => {
    const secretRoundPrompt = secretRoundPrompts[Math.floor(Math.random() * secretRoundPrompts.length)]; // INTERACT: derive secret prompt payload upon activation
    safeSetGameState("secretLoveRound"); // [Fix RC-02] transition game state when long-press fires
    handleThemeChange("foreverPromise"); // INTERACT: elevate secret theme for hidden round
    safeSetSecretSticky(true); // [Fix RC-02] persist secret theme selection
    safeSetIsSecretThemeUnlocked(true); // [Fix RC-02] flag secret theme as unlocked
    safeOpenModal("secretPrompt", { prompt: secretRoundPrompt }); // INTERACT: surface secret prompt modal when triggered
    safeSetSecretRoundUsed(true); // [Fix SM-01]
    safeSetPulseLevel(0); // [Fix SM-01]
    if (typeof secretPromptOpenAt !== 'undefined') { secretPromptOpenAt.t = Date.now(); } // INTERACT: update debounce timestamp for secret prompts
  }, [handleThemeChange, safeOpenModal, safeSetGameState, safeSetIsSecretThemeUnlocked, safeSetSecretSticky, safeSetSecretRoundUsed, safeSetPulseLevel]);

  // INTERACT: long-press detection for secret round
  const onSecretPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return; // INTERACT: ignore non-primary mouse buttons
    if (!canSpin || spinLock.current) return; // INTERACT: block secret gesture when wheel unavailable
    clearLongPressTimer(); // [Fix RC-02] reset any prior timers before scheduling a new long press
    longPressRef.current.active = true; // INTERACT: mark pointer as active for pending trigger
    longPressRef.current.triggered = false; // INTERACT: reset triggered flag for this gesture lifecycle
    longPressRef.current.timer = setTimeout(() => {
      if (longPressRef.current.active) { // INTERACT: only trigger when pointer still active
        longPressRef.current.triggered = true; // INTERACT: flag that secret round has fired
        longPressRef.current.timer = null; // INTERACT: release timer handle after firing
        try { triggerSecretRound(); } catch (err) { console.warn('[SecretRound]', err); } // INTERACT: invoke hidden round with error resilience
      }
    }, LONG_PRESS_MS); // INTERACT: delay invocation until long-press duration satisfied
  }, [canSpin, triggerSecretRound, clearLongPressTimer]);

  // INTERACT: cancel long-press timer when pointer lifts or leaves
  const onSecretPointerCancel = useCallback(() => {
    clearLongPressTimer(); // [Fix RC-02]
  }, [clearLongPressTimer]);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            return () => {};
        }
        const cancelOnBlur = () => clearLongPressTimer(); // [Fix RC-02]
        const cancelOnHide = () => {
            if (document.hidden) {
                clearLongPressTimer(); // [Fix RC-02]
            }
        };
        window.addEventListener('blur', cancelOnBlur);
        document.addEventListener('visibilitychange', cancelOnHide);
        return () => {
            clearLongPressTimer(); // [Fix RC-02]
            window.removeEventListener('blur', cancelOnBlur);
            document.removeEventListener('visibilitychange', cancelOnHide);
        };
    }, [clearLongPressTimer]);

    useEffect(() => {
        if (extremeActive && !lastExtremeState.current) {
            setLiveAnnouncement('Extreme round activated.'); // [Fix A11Y-04]
        }
        if (!extremeActive && lastExtremeState.current) {
            setLiveAnnouncement('Extreme round complete.'); // [Fix A11Y-04]
        }
        lastExtremeState.current = !!extremeActive;
    }, [extremeActive, setLiveAnnouncement]);

    // RELIABILITY: Register watchdog only after finishSpinNow is defined to avoid TDZ.
    useEffect(() => {
        if (!registerWatchdogControl) return;
        // RELIABILITY: Surface finalize hook so watchdog routes through finishSpinNow.
        registerWatchdogControl({
            finish: (reason = 'watchdog') => finishSpinNow(reason),
            isLocked: () => !!spinLock.current,
        });
        return () => registerWatchdogControl(null);
    }, [registerWatchdogControl, finishSpinNow]);

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
        // VISUAL: align rim highlight sampling with new root wrapper id
        const host = document.getElementById('app-root') || document.documentElement;
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

    const handleSpin = useCallback(async () => {
        const now = Date.now();
        if (spinLock.current || !canSpin || now - lastSpinTimeRef.current < 2000) {
            return;
        }
        if (longPressRef.current?.triggered) { // INTERACT: bypass standard spin when secret long-press already fired
            longPressRef.current.triggered = false; // INTERACT: reset trigger flag post-secret activation
            return; // INTERACT: exit without spinning after hidden round entry
        }
        lastSpinTimeRef.current = now;
        spinLock.current = true; // Acquire lock

        const toneReady = typeof window !== 'undefined' && !!window.Tone; // RELIABILITY: detect Tone availability before playback.
        if (toneReady && window.Tone.context?.state === 'suspended') {
            await resumeAudioOnGesture(); // RELIABILITY: Ensure gesture resume resolves before playback.
        }

        if (wheelCanvasRef.current) wheelCanvasRef.current.style.transition = 'none';

        setIsSpinning(true);
        setIsSpinInProgress(true);
        if (onSpinStart) {
            onSpinStart({ source: 'wheel' });
        }
        if (toneReady) { playWheelSpinStart(); } // RELIABILITY: only fire spin start audio when Tone is ready.

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

            if (toneReady) { playWheelTick(); } // RELIABILITY: guard tick playback behind Tone readiness.
            if (toneReady) { setTimeout(() => { if (toneReady) { playWheelTick(); } }, 80); } // RELIABILITY: schedule secondary tick only when audio is ready.

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
                if (toneReady) { playWheelTick(); } // RELIABILITY: gate tick sound during animation by Tone readiness.
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
        <div
            className="wheel-container"
            role="group"
            aria-label="Game wheel"
            tabIndex={0}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSpin();
                }
            }} // [Fix A11Y-04]
        >
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
            <div aria-live="polite" className="sr-only">{liveAnnouncement}</div> {/* [Fix A11Y-04] */}
            <div
  className="spin-button-wrapper"
  onContextMenu={(e) => e.preventDefault()}
>
<motion.button
                    aria-label="Spin"
                    className="spin-button" onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={onSecretPointerDown} // INTERACT: capture long-press initiation on spin button
                    onPointerUp={onSecretPointerCancel} // INTERACT: release long-press timer upon pointer up
                    onPointerLeave={onSecretPointerCancel} // INTERACT: cancel timer when pointer exits button bounds
                    onClick={handleSpin} // INTERACT: preserve standard spin activation on short tap
                    whileTap={{ scale: 0.95 }}
                >
                    {isSpinning ? <SpinLoader /> : 'SPIN'}
                </motion.button>
            </div>
        </div>
    );
});

const PulseMeter = ({ level }) => {
    const labelId = useId(); // [Fix A11Y-03]
    const clampedLevel = Math.max(0, Math.min(100, Number.isFinite(level) ? level : 0)); // [Fix A11Y-03]
    return (
        <div
            className="pulse-meter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(clampedLevel)}
            aria-labelledby={labelId}
        >
            <span id={labelId} className="sr-only">Connection pulse</span> {/* [Fix A11Y-03] */}
            <div className="pulse-meter__fill" style={{ width: `${clampedLevel}%` }}/>
            <div className="pulse-meter__wave" />
            <div className="pulse-meter__gloss" />
        </div>
    );
};

// --- MODAL & OVERLAY COMPONENTS (Re-implemented) ---
const Modal = ({ isOpen, onClose, title, children, activeVisualTheme, customClasses = "" }) => {
  const parallax = useParallax(8);
  const visible = !!isOpen;
  const titleId = useId(); // [Fix A11Y-02]

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

  // VISUAL: modal overlay/content align with z-index contract for click-through reliability
  return (
    <motion.div
      className="modal-overlay fixed inset-0 z-[110] flex justify-center items-start md:items-center p-4 pt-[15vh] md:pt-4"
      onClick={onClose}
      initial={{ backgroundColor: "rgba(0,0,0,0)" }}
      animate={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      exit={{ backgroundColor: "rgba(0,0,0,0)" }}
    >
      <motion.div
        ref={parallax.ref}
        style={parallax.style}
        tabIndex={-1}
        className={`modal-content relative outline-none w-full max-w-sm flex flex-col modal-metallic ${activeVisualTheme?.themeClass ?? ""} ${customClasses}`}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0, y: 30, filter: "blur(8px)" }}
        animate={{ scale: 1, opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ scale: 0.95, opacity: 0, y: 30, filter: "blur(8px)" }}
        transition={{ type: "tween", duration: 0.25 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-header">
          {title && <h2 id={titleId} className="modal-title text-3xl text-white">{title}</h2>}
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
const NoiseOverlay = ({ reducedMotion }) => ( // VISUAL: keep film-grain below particle canvas to avoid z-index ties
  <div className={`fixed inset-0 z-[9] pointer-events-none opacity-[0.04] ${reducedMotion ? '' : 'noise-animated'}`} />
);
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
    // VISUAL: keep radial light as non-interactive backdrop
    return <motion.div className="radial-light-overlay pointer-events-none" style={{ '--light-x': lightX, '--light-y': lightY }} />;
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
                        <motion.button
                            key={theme.id}
                            type="button"
                            role="button"
                            tabIndex={0}
                            onClick={() => onVibeSelect(theme.id)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    onVibeSelect(theme.id);
                                }
                            }}
                            className="theme-swatch"
                            aria-pressed={currentTheme === theme.id}
                            whileTap={{ scale: 0.97 }}
                            whileHover={{ scale: 1.03 }}
                        >{/* [Fix A11Y-01] */}
                            <div className="theme-chips">{theme.colors.map(c => <div key={c} className="theme-chip" style={{ backgroundColor: c }} />)}</div>
                            <span className="font-bold text-lg">{theme.name}</span>
                        </motion.button>
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
                    <button
                        key={theme.id}
                        type="button"
                        role="button"
                        tabIndex={0}
                        onClick={() => onThemeChange(theme.id)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onThemeChange(theme.id);
                            }
                        }}
                        className={`theme-swatch ${currentTheme === theme.id ? 'ring-2 ring-[var(--theme-highlight)]' : ''}`}
                        aria-pressed={currentTheme === theme.id}
                    >{/* [Fix A11Y-01] */}
                        <div className="theme-chips">{theme.colors.map(c => <div key={c} className="theme-chip" style={{backgroundColor: c}}/>)}</div>
                        <span className="font-bold">{theme.name}</span>
                    </button>
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
        if (typeof localStorage !== 'undefined') { // RELIABILITY: Guard settings access for non-browser environments.
            const stored = localStorage.getItem('settings'); // RELIABILITY: Retrieve persisted settings when available.
            if (stored) { // RELIABILITY: Only parse when serialized settings exist.
                const parsed = JSON.parse(stored); // RELIABILITY: Parse stored configuration safely.
                return { ...defaults, ...parsed }; // RELIABILITY: Merge persisted settings with defaults.
            }
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

    // RELIABILITY: dual-timer nudge to guarantee prompt queue progression
    useEffect(() => {
        if (queueState.active || !queueState.queue.length || queueState.deliveryLock) return;
        if (modalState?.type) return;

        const nudge = () => {
            // RELIABILITY: double-check that we’re still idle and a prompt is waiting
            if (
                !queueState.active &&
                queueState.queue.length &&
                !queueState.deliveryLock &&
                !modalState?.type
            ) {
                dispatchQueue({ type: 'LOCK' });
                scheduleMicrotask(() => dispatchQueue({ type: 'DEQUEUE' }));
            }
        };

        const t1 = setTimeout(nudge, 200);  // short-term recovery
        const t2 = setTimeout(nudge, 600);  // fallback recovery
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
        };
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
    const [storageWarningReason, setStorageWarningReason] = useState(null); // [Fix PRIV-01][Fix STOR-02]
    const storageWarningMessage = useMemo(() => { // [Fix PRIV-01][Fix STOR-02]
        if (!storageWarningReason) return null;
        return storageWarningReason === 'payload-too-large'
            ? 'Saved prompts exceed offline limits. Progress will reset after you close the app.'
            : 'Offline storage is unavailable. Prompts will reset if you reload.';
    }, [storageWarningReason]);

    useEffect(() => {
        const unsubscribe = subscribePromptStoreFallback((details = {}) => {
            setStorageWarningReason(details.reason || 'storage-unavailable');
        });
        return unsubscribe;
    }, []); // [Fix PRIV-01][Fix STOR-02]
    const [isUnlockingAudio, setIsUnlockingAudio] = useState(false);
    const dbStore = useMemo(() => getDbStoreInstance(), []); // RELIABILITY: Capture prompt store lazily once App is evaluating.
    useEffect(() => { // RELIABILITY: detect circular import regressions during runtime
        if (!dbStore) console.error('[Diag] dbStore unresolved – potential circular import');
    }, [dbStore]);
    const audioEngine = useMemo(() => getAudioEngineInstance(), []); // RELIABILITY: Acquire audio engine lazily during render to avoid TDZ import cycles.
    const legacyPromptSnapshotRef = useRef(null); // RELIABILITY: Track legacy prompt payloads across asynchronous migrations.
    const isMounted = useRef(true); // RELIABILITY: track component mount lifecycle for guarded state updates.

    useEffect(() => {
        // RELIABILITY: flag unmount to prevent post-teardown state writes.
        return () => { isMounted.current = false; };
    }, []);

    // RELIABILITY: async init for audio engine after mount
    useEffect(() => {
        // RELIABILITY: start asynchronous loader for Tone-backed audio engine
        (async () => {
            try {
                // RELIABILITY: await lazy singleton creation prior to initialization
                const engine = await getAudioEngine();
                // RELIABILITY: ensure initialize executes only when available
                if (engine?.initialize) await engine.initialize();
            } catch (err) {
                // RELIABILITY: guard against initialization failures without crashing UI
                console.warn('[Reliability] Audio engine init failed:', err);
            }
        })();
    }, []);

    useEffect(() => { // RELIABILITY: defer Tone and migration setup until after mount
        if (typeof window === 'undefined') { // RELIABILITY: skip browser-only wiring during SSR
            return undefined; // RELIABILITY: ensure cleanup contract when no window exists
        }

        try { // RELIABILITY: guard versioned migrations against storage failures
            const APP_VERSION = '1.3.0'; // RELIABILITY: version migration marker for prompt persistence
            let storedVersion = null; // RELIABILITY: default stored version when storage unavailable
            if (typeof localStorage !== 'undefined') { // RELIABILITY: confirm localStorage before access
                storedVersion = localStorage.getItem('app_version'); // RELIABILITY: inspect stored app version lazily
            }
            if (storedVersion !== APP_VERSION && typeof localStorage !== 'undefined') { // RELIABILITY: run migration only when versions differ and storage exists
                const storage = localStorage; // RELIABILITY: alias storage handle for clarity
                const keep = new Set(['app_version', 'settings', 'lastError', 'volume', 'musicVolume', 'sfxVolume', 'theme']); // RELIABILITY: preserve allowlisted keys during migration
                const legacyPrompts = storage.getItem('prompts'); // RELIABILITY: capture prompts prior to cleanup
                const toDelete = []; // RELIABILITY: stage disallowed keys for removal post-iteration
                for (let i = 0; i < storage.length; i++) { // RELIABILITY: iterate keys without mutating storage mid-loop
                    const key = storage.key(i); // RELIABILITY: read key safely from storage namespace
                    if (key && !keep.has(key)) { // RELIABILITY: validate key presence before queueing deletion
                        toDelete.push(key); // RELIABILITY: queue stale key for removal to avoid iterator invalidation
                    }
                }
                toDelete.forEach((key) => storage.removeItem(key)); // RELIABILITY: purge disallowed keys after enumeration completes
                storage.setItem('app_version', APP_VERSION); // RELIABILITY: persist updated app version marker
                if (legacyPrompts) { // RELIABILITY: ensure legacy prompts survive migration
                    storage.setItem('prompts', legacyPrompts); // RELIABILITY: restore preserved prompt payloads post-wipe
                }
                legacyPromptSnapshotRef.current = legacyPrompts; // RELIABILITY: retain migrated prompts for async IndexedDB seeding
            }
        } catch (e) { // RELIABILITY: gracefully handle storage access errors
            console.warn('[Reliability] localStorage unavailable:', e); // RELIABILITY: emit diagnostics for migration guard failures
        }

        const handleResize = () => { // RELIABILITY: attach resize listener safely
            if (typeof document === 'undefined' || !document.body?.style) { // RELIABILITY: guard DOM availability before mutation
                return; // RELIABILITY: bail when running without document context
            }
            document.body.style.setProperty('--vh', `${window.innerHeight * 0.01}px`); // RELIABILITY: update viewport unit custom property lazily
        };
        handleResize(); // RELIABILITY: initialize viewport sizing token immediately after mount
        window.addEventListener('resize', handleResize); // RELIABILITY: respond to viewport changes during runtime
        return () => window.removeEventListener('resize', handleResize); // RELIABILITY: cleanup resize listener on unmount
    }, []); // RELIABILITY: execute Tone and migration bootstrap once after mount.
    // RELIABILITY: Defer browser-only error listeners until after mount.
    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }
        const assetErrorHandler = (e) => {
            if (e.target instanceof HTMLScriptElement || e.target instanceof HTMLLinkElement) {
                const message = typeof e.message === 'string' ? e.message : '';
                if (message && (message.includes('manifest') || message.includes('favicon'))) {
                    e.preventDefault();
                }
            }
        };
        const diagnosticsLogger = (e) => {
            if (typeof window.localStorage === 'undefined') {
                return;
            }
            try {
                window.localStorage.setItem('lastError', e.message || '');
            } catch {}
        };
        window.addEventListener('error', assetErrorHandler, true);
        window.addEventListener('error', diagnosticsLogger);
        return () => {
            window.removeEventListener('error', assetErrorHandler, true);
            window.removeEventListener('error', diagnosticsLogger);
        };
    }, []);

    // RELIABILITY: async init for audio engine after mount
    useEffect(() => {
        const detachGestureListeners = attachAudioGestureListeners(); // [Fix C1][Fix M2]
        const cleanupToneErrors = silenceToneErrors(); // [Fix RC-01][Fix OBS-01]
        let cancelled = false; // [Fix C1]
        (async () => {
            try {
                await loadTone(); // [Fix H2]
                await getAudioEngine(); // [Fix C1]
                if (!cancelled) {
                    setScriptLoadState('loaded'); // [Fix C1]
                }
            } catch (err) {
                console.warn('[Reliability] Audio engine warm load failed:', err); // [Fix C1]
                if (!cancelled) {
                    setScriptLoadState('error'); // [Fix C1]
                }
            }
        })();
        return () => {
            cancelled = true; // [Fix C1]
            if (typeof detachGestureListeners === 'function') {
                detachGestureListeners(); // [Fix M2]
            }
            if (typeof cleanupToneErrors === 'function') {
                cleanupToneErrors(); // [Fix RC-01][Fix OBS-01]
            }
        };
    }, []);

    useEffect(() => { // RELIABILITY: migrate legacy localStorage prompts to IndexedDB lazily
        (async () => { // RELIABILITY: wrap in async IIFE to retain synchronous effect semantics
            const storedLegacy = legacyPromptSnapshotRef.current ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('prompts') : null); // RELIABILITY: capture legacy payload without assuming storage availability
            if (!storedLegacy) { // RELIABILITY: exit early when no legacy prompts to migrate
                return; // RELIABILITY: avoid unnecessary IndexedDB operations when nothing to migrate
            }
            try { // RELIABILITY: guard JSON parsing and IndexedDB writes
                const parsed = JSON.parse(storedLegacy); // RELIABILITY: parse legacy prompts safely
                await dbStore.setPrompt('prompts', parsed); // RELIABILITY: persist legacy prompts into IndexedDB store
                if (typeof localStorage !== 'undefined') { // RELIABILITY: ensure localStorage exists before mutation
                    localStorage.removeItem('prompts'); // RELIABILITY: clear migrated prompt payload from legacy storage
                }
                legacyPromptSnapshotRef.current = null; // RELIABILITY: reset migration snapshot after successful transfer
            } catch (err) { // RELIABILITY: expose migration failures for debugging
                console.warn('[Reliability] Failed to migrate legacy prompts', err); // RELIABILITY: log migration error for observability
            }
        })();
    }, [dbStore]);

    // Use the new prompt queue hook
    const { modalState, setModalState: setModalStateUnsafe, enqueuePrompt, queueState, dispatchQueue, resetQueue } = usePromptQueue();
    // RELIABILITY: guard modal state updates scheduled after async delays.
    const safeSetModalState = useCallback((next) => {
        if (isMounted.current) {
            setModalStateUnsafe(next);
        }
    }, [setModalStateUnsafe]);
    // RELIABILITY: guard script loader status transitions triggered by deferred callbacks.
    const safeSetScriptLoadState = useCallback((next) => {
        if (isMounted.current) {
            setScriptLoadState(next);
        }
    }, [setScriptLoadState]);
    // RELIABILITY: guard onboarding unlock flags updated from async flows.
    const safeSetIsUnlockingAudio = useCallback((next) => {
        if (isMounted.current) {
            setIsUnlockingAudio(next);
        }
    }, [setIsUnlockingAudio]);
    // RELIABILITY: guard audio failure flags to avoid writes after teardown.
    const safeSetAudioInitFailed = useCallback((next) => {
        if (isMounted.current) {
            setAudioInitFailed(next);
        }
    }, [setAudioInitFailed]);
    // RELIABILITY: guard game state transitions invoked from timers.
    const safeSetGameState = useCallback((next) => {
        if (isMounted.current) {
            setGameState(next);
        }
    }, [setGameState]);
    // RELIABILITY: guard secret round unlock toggles invoked asynchronously.
    const safeSetSecretRoundUsed = useCallback((next) => {
        if (isMounted.current) {
            setSecretRoundUsed(next);
        }
    }, [setSecretRoundUsed]);
    // RELIABILITY: guard sticky theme toggles when closing secret rounds.
    const safeSetSecretSticky = useCallback((next) => {
        if (isMounted.current) {
            setSecretSticky(next);
        }
    }, [setSecretSticky]);
    // RELIABILITY: guard secret theme unlock flag changes across async flows.
    const safeSetIsSecretThemeUnlocked = useCallback((next) => {
        if (isMounted.current) {
            setIsSecretThemeUnlocked(next);
        }
    }, [setIsSecretThemeUnlocked]);
    // RELIABILITY: guard pulse level adjustments scheduled from timers.
    const safeSetPulseLevel = useCallback((next) => {
        if (isMounted.current) {
            setPulseLevel(next);
        }
    }, [setPulseLevel]);
    const setModalState = safeSetModalState; // RELIABILITY: reuse safe setter across existing call sites.
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

    const mainContentRef = useRef(null); // INTERACT: track gameplay container for selective inerting

    // RELIABILITY: safe inert toggling to avoid null refs on unmount
    useEffect(() => {
        const el = mainContentRef?.current;
        if (!el) return;
        try {
            if (modalState?.type) {
                el.setAttribute('inert', '');
            } else {
                el.removeAttribute('inert');
            }
        } catch (err) {
            console.warn('[Inert toggle skipped]', err);
        }
        return () => {
            try {
                const node = mainContentRef?.current;
                if (node && node.hasAttribute('inert')) node.removeAttribute('inert');
            } catch (err) {
                console.warn('[Inert cleanup skipped]', err);
            }
        };
    }, [modalState?.type]);

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

    const turnIntroTimeoutRef = useRef(null);
    const previousThemeRef = useRef(initialSettings.theme);
    const themeNameBeforeSecretRef = useRef(null);
    const pendingPromptRef = useRef(null);
    const spinWatchdogRef = useRef(null);

    // AudioContext autoplay warning fix
    useEffect(() => {
        if (typeof document === 'undefined') {
            return undefined;
        }
        const resumeAudioContext = async () => {
            if (typeof window !== 'undefined' && window.Tone) { await resumeAudioOnGesture(); } // RELIABILITY: Ensure audio context resumes only when Tone is available.
        };
        const attachUnlockListener = () => {
            document.removeEventListener('click', resumeAudioContext);
            document.addEventListener('click', resumeAudioContext, { once: true });
        };

        attachUnlockListener();

        const handleVisibility = () => {
            if (document.hidden) return;
            if (typeof window !== 'undefined' && window.Tone?.context?.state === 'suspended') {
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
        if (typeof document === 'undefined') { return; }
        // RELIABILITY: surface particle mount diagnostics for QA verification
        console.info('[Particles] Portal mount:', !!document.querySelector('.particle-canvas'));
        const parallax = document.getElementById('parallax-bg');
        const glow = document.getElementById('ambient-glow');
        const parallaxZ = parallax ? getComputedStyle(parallax).zIndex : 'n/a';
        const glowZ = glow ? getComputedStyle(glow).zIndex : 'n/a';
        // RELIABILITY: confirm layering contract for parallax/glow planes
        console.info('[Layers] parallax z:', parallaxZ, 'glow z:', glowZ);
    }, [backgroundTheme]);

    const initialThemeRef = useRef(currentTheme); // RELIABILITY: capture initial theme for one-time mount sync.

    // RELIABILITY: apply stored or default theme immediately on mount
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const theme = themeProfiles[initialThemeRef.current];
        if (theme?.background) {
            document.documentElement.style.setProperty('--theme-bg', theme.background);
            const appContainer = document.getElementById('app-content') || document.body;
            if (appContainer) {
                appContainer.style.background = theme.background; // RELIABILITY: prime container background on mount.
            }
        }
    }, []);

    // VISUAL: derive RGB from theme accent for dynamic glow
    function hexToRgb(hex) {
        const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return match ? `${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)}` : '255,255,255';
    }

    // RELIABILITY: ensure full theme propagation including background sync
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const theme = themeProfiles[currentTheme];
        if (!theme) return;

        const root = document.documentElement;
        if (theme.background) {
            root.style.setProperty('--theme-bg', theme.background);
        }
        if (theme.highlight) {
            root.style.setProperty('--theme-highlight', theme.highlight);
            // VISUAL: provide highlight RGB for ambient glow animation.
            root.style.setProperty('--theme-highlight-rgb', hexToRgb(theme.highlight));
        } else {
            // VISUAL: clear highlight RGB when theme omits highlight tone.
            root.style.removeProperty('--theme-highlight-rgb');
        }
        if (theme.accent) {
            root.style.setProperty('--theme-accent', theme.accent);
            // VISUAL: expose accent RGB for parallax gradient transparency.
            root.style.setProperty('--theme-accent-rgb', hexToRgb(theme.accent));
        } else {
            // VISUAL: clear accent RGB token when accent is undefined.
            root.style.removeProperty('--theme-accent-rgb');
        }

        // RELIABILITY: trigger repaint for main container background sync
        const appContainer = document.getElementById('app-content') || document.body;
        if (theme.background && appContainer) {
            appContainer.style.background = theme.background;
        }

        console.info(`[Reliability] Theme synchronized: ${theme.name}`);
    }, [currentTheme]);

    useEffect(() => {
        try {
            const settingsToSave = {
                theme: currentTheme,
                volumes: settings,
                reducedMotion: prefersReducedMotion,
            };
            if (typeof localStorage !== 'undefined') { localStorage.setItem('settings', JSON.stringify(settingsToSave)); } // RELIABILITY: Persist settings only when storage exists.
        } catch (e) {
            console.error("Failed to save settings to localStorage", e);
        }
    }, [currentTheme, settings, prefersReducedMotion]);

    useEffect(() => {
        if (typeof window === 'undefined') { return undefined; } // RELIABILITY: Skip reduced-motion listener outside browsers.
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
        if (typeof localStorage !== 'undefined' && localStorage.getItem('settings') === null) { handleChange(); } // RELIABILITY: Initialize preference when storage lacks explicit value.
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
                // RELIABILITY: guard delayed turn transition against unmounted updates.
                safeSetGameState('playing');
            }, 2800);
        }
        return () => clearTimeout(turnIntroTimeoutRef.current);
    }, [gameState, safeSetGameState]);

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
        if (modalState.type && modalState.type !== 'settings' && modalState.type !== 'editor' && modalState.type !== 'closing' ) {
            // RELIABILITY: Ensure audio context resumes before playing modal SFX.
            (async () => {
                if (typeof window !== 'undefined' && window.Tone) { await resumeAudioOnGesture(); audioEngine.playModalOpen(); } // RELIABILITY: Guard modal audio playback behind Tone availability.
            })();
        }
    // RELIABILITY: Include deferred audio engine to avoid stale reference after lazy init.
    }, [modalState.type, audioEngine]);
    
    useEffect(() => {
        const convertToDb = (v) => (v === 0 ? -Infinity : (v / 100) * 40 - 40);
        audioEngine.setMasterVolume(convertToDb(settings.masterVolume));
        audioEngine.setMusicVolume(convertToDb(settings.musicVolume));
        audioEngine.setSfxVolume(convertToDb(settings.sfxVolume));
    // RELIABILITY: Depend on audio engine reference so deferred init stays consistent.
    }, [settings, audioEngine]);
    useEffect(() => { audioEngine.toggleMute(isMuted); }, [isMuted, audioEngine]);
    
    
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
    }, [modalState.type, currentTheme, audioEngine]);

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
    
    }, [setCurrentTheme, previousThemeRef, audioEngine]);

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
    }, [safeOpenModal, currentTheme, audioEngine]);

    useEffect(() => {
        if (!isSpinInProgress && !modalState.type && pendingExtremeRound) {
            triggerExtremeRound(pendingExtremeRound);
            setPendingExtremeRound(null);
        }
    }, [isSpinInProgress, modalState.type, pendingExtremeRound, triggerExtremeRound]);

    // RELIABILITY: runtime diagnostics
    useEffect(() => {
      const particle = document.querySelector('.particle-canvas');
      console.info('[Diagnostics] Particle canvas:', !!particle ? 'mounted' : 'missing');
      if (particle) console.info('[Diagnostics] Particle z-index:', getComputedStyle(particle).zIndex);
      const spin = document.querySelector('.spin-button');
      console.info('[Diagnostics] Spin button pointer-events:', spin ? getComputedStyle(spin).pointerEvents : 'N/A');
    }, []);

    const handleUnlockAudio = useCallback(async () => {
        if (isUnlockingAudio) return;
        setIsUnlockingAudio(true);
        safeSetAudioInitFailed(false); // [Fix M1]

        const attemptAudioInit = async () => {
            if (typeof window === 'undefined' || !window.Tone || !window.Tone.context) {
                safeSetScriptLoadState('error'); // [Fix C1]
                return false; // [Fix C1]
            }
            try {
                await resumeAudioOnGesture(); // [Fix C1]
            } catch (e) {
                console.error('Audio unlock failed:', e); // [Fix M1]
                return false; // [Fix M1]
            }
            const success = await audioEngine.initialize(); // [Fix C1]
            if (success) {
                await audioEngine.startTheme('velourNights'); // [Fix C1]
                safeSetScriptLoadState('ready'); // [Fix M1]
            }
            return success; // [Fix C1]
        };

        let unlockSucceeded = false; // [Fix M1]
        try {
            for (let attempt = 0; attempt < 2 && !unlockSucceeded; attempt += 1) { // [Fix M1]
                const success = await attemptAudioInit(); // [Fix C1]
                if (success) {
                    unlockSucceeded = true; // [Fix M1]
                } else if (attempt === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 1000)); // [Fix M1]
                }
            }
            if (!unlockSucceeded) {
                safeSetAudioInitFailed(true); // [Fix M1]
                safeSetScriptLoadState('error'); // [Fix M1]
            }
        } catch (err) {
            console.error('Audio init failed:', err); // [Fix M1]
            safeSetAudioInitFailed(true); // [Fix M1]
            safeSetScriptLoadState('error'); // [Fix M1]
        } finally {
            if (unlockSucceeded) {
                safeSetGameState('onboarding_intro'); // [Fix M1]
            }
            safeSetIsUnlockingAudio(false); // [Fix M1]
        }
    }, [isUnlockingAudio, audioEngine, safeSetScriptLoadState, safeSetAudioInitFailed, safeSetGameState, safeSetIsUnlockingAudio]);

    const handleNameEntry = useCallback((playerNames) => { 
        setPlayers(playerNames); 
        setGameState('turnIntro'); 
    }, []);

    const handleToggleMute = useCallback(() => setIsMuted(prev => !prev), []);

    const endRoundAndStartNew = useCallback(() => {
        const wasExtremeMode = isExtremeMode; // GAMELOGIC: capture previous extreme state before reset
        // GAMELOGIC: reset extreme mode at start of every round
        if (isExtremeMode) { // GAMELOGIC: only clear flag when previously active
            setIsExtremeMode(false); // GAMELOGIC: clear extreme flag for fresh round
            console.info('[Reliability] Extreme mode cleared for new round'); // GAMELOGIC: log lifecycle reset
        }
        const nextPlayerId = currentPlayer === 'p1' ? 'p2' : 'p1';
        const activePlayerName = players[nextPlayerId];

        setTimeout(() => {
            // RELIABILITY: verify mount state before secret round transitions.
            if (!isMounted.current) return;
            // RELIABILITY: safely normalize active player name before comparisons
            const normalizedActivePlayerName = typeof activePlayerName === 'string' ? activePlayerName.toLowerCase() : '';
            // [GeminiFix: NullGuard]
            if (
                gameState !== 'secretLoveRound' &&
                normalizedActivePlayerName === 'katy' &&
                !secretRoundUsed &&
                Math.random() < 0.15
            ) {
                safeSetSecretRoundUsed(true);
                const secretPrompt = secretRoundPrompts[Math.floor(Math.random() * secretRoundPrompts.length)];
                safeSetGameState("secretLoveRound");
                handleThemeChange("foreverPromise");
                safeSetSecretSticky(true);
                safeSetIsSecretThemeUnlocked(true);
                safeOpenModal("secretPrompt", { prompt: secretPrompt });
            }
        }, 100);

        if (wasExtremeMode || gameState === 'secretLoveRound') { // GAMELOGIC: maintain cleanup when prior round was extreme
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
            safeSetPulseLevel(100);
        } else {
            safeSetPulseLevel(newPulseLevel);
        }
    
        if (!isExtremeMode && newPulseLevel < 100 && Math.random() < 0.1) {
            if (isSpinInProgress || modalState.type) {
                setPendingExtremeRound('random');
            } else {
                triggerExtremeRound('random');
            }
        }
    }, [isExtremeMode, roundCount, pulseLevel, isSpinInProgress, modalState.type, triggerExtremeRound, players, currentPlayer, handleThemeChange, gameState, secretRoundUsed, secretSticky, safeOpenModal, isSecretThemeUnlocked, safeSetSecretRoundUsed, safeSetGameState, safeSetSecretSticky, safeSetIsSecretThemeUnlocked, safeSetPulseLevel]);
    
    const handleCloseModal = useCallback(() => {
        audioEngine.playModalClose();
        // RELIABILITY: debounce modal close to avoid race between exit animation and unmount
        setTimeout(() => {
            safeSetModalState({ type: "", data: null });
        }, 150);
    // RELIABILITY: Capture lazy audio engine reference for modal close sfx.
    }, [safeSetModalState, audioEngine]);

    const handlePromptModalClose = useCallback(() => {
        handleCloseModal();
        dispatchQueue({ type: 'UNLOCK' });
        pendingPromptRef.current = null;
        endRoundAndStartNew();
    }, [handleCloseModal, endRoundAndStartNew, dispatchQueue]);

    const handleConsequenceClose = useCallback(() => {
        handleCloseModal();
        dispatchQueue({ type: 'UNLOCK' });
        pendingPromptRef.current = null;
        endRoundAndStartNew();
    }, [handleCloseModal, endRoundAndStartNew, dispatchQueue]);

    const handleSecretLoveRoundClose = useCallback(() => {
        setModalState({ type: "", data: null });
        endRoundAndStartNew();
        safeSetPulseLevel(0); // [Fix SM-01]
    }, [setModalState, endRoundAndStartNew, safeSetPulseLevel]);

    const handleExtremeIntroClose = useCallback(() => {
        setModalState({ type: "", data: null });
        // GAMELOGIC: trigger extreme mode only if not already active this round
        if (!isExtremeMode) { // GAMELOGIC: guard against duplicate extreme activation in same round
            setIsExtremeMode(true); // GAMELOGIC: activate extreme flag for current round
            handleThemeChange('crimsonFrenzy'); // GAMELOGIC: shift theme into extreme palette once per round
            safeSetGameState("extremeRound"); // RELIABILITY: guard extreme round transition when modal closes asynchronously
            setExtremeModeReady(true); // GAMELOGIC: mark extreme prompt pipeline ready
        }
        if (extremeRoundSource === 'spark' && roundCount % 5 === 0) { // [Fix C2]
            setTimeout(() => {
                // RELIABILITY: guard spark reset pulse against unmounted component.
                safeSetPulseLevel(0);
            }, 1000);
        }
    }, [extremeRoundSource, roundCount, handleThemeChange, setModalState, isExtremeMode, safeSetGameState, safeSetPulseLevel]);

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
        // DEBUG: verify category-to-prompt mapping
        console.log(
            '[DEBUG] Winner category:',
            normalizedCategory,
            'First prompt sample:',
            prompts?.[normalizedCategory]?.normal?.[0]
        );
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
            // RELIABILITY: ensure consequence modal reopen skips after unmount.
            if (!isMounted.current) return;
            safeOpenModal('consequence', { text });
        }, 50);
        pendingPromptRef.current = null;
    // RELIABILITY: Include deferred audio engine in dependencies to preserve playback.
    }, [isExtremeMode, prompts, safeOpenModal, setModalState, audioEngine]);

    const handleEditorClose = useCallback((updatedPrompts) => {
        if (updatedPrompts) {
            audioEngine.playCorrect();
            updatePrompts(updatedPrompts);
        }
        if (modalState.data?.from === 'settings') {
             setModalState({ type: 'settings', data: null });
        } else {
             handleCloseModal();
        }
    // RELIABILITY: Ensure lazy audio engine dependency captured for editor confirmation.
    }, [updatePrompts, modalState.data, handleCloseModal, setModalState, audioEngine]);

    const handleConfirmReset = useCallback(() => {
        audioEngine.playRefuse();
        resetPrompts();
        setModalState({ type: 'editor', data: { from: 'settings' } });
    // RELIABILITY: Maintain lazy audio engine playback when resetting prompts.
    }, [resetPrompts, setModalState, audioEngine]);

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
                                    safeSetGameState={safeSetGameState}
                                    safeSetSecretSticky={safeSetSecretSticky}
                                    safeSetIsSecretThemeUnlocked={safeSetIsSecretThemeUnlocked}
                                    safeSetSecretRoundUsed={safeSetSecretRoundUsed}
                                    safeSetPulseLevel={safeSetPulseLevel}
                                    extremeActive={isExtremeMode}
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

    // RELIABILITY: runtime check
    useEffect(() => {
      const el = document.querySelector('.particle-canvas, .particle-background');
      console.info('[Diag] particle canvas mounted:', !!el);
      if (el) console.info('[Diag] particle z-index:', getComputedStyle(el).zIndex);
    }, []);

    return (
        <MotionConfig transition={{ type: "spring", stiffness: 240, damping: 24 }}>
            {storageWarningMessage && (
                <div className="storage-warning" role="alert">
                    {/* [Fix PRIV-01][Fix STOR-02] */}
                    {storageWarningMessage}
                </div>
            )}
            <div
                id="app-root"
                className={`min-h-screen ${activeVisualTheme.themeClass} font-['Inter',_sans-serif] text-white flex flex-col items-center overflow-hidden relative ${prefersReducedMotion ? 'reduced-motion' : ''}`}
                style={{
                    '--pulse-glow-intensity': `${pulseLevel / 100}`,
                    '--beat-duration': `${60 / audioEngine.getCurrentBpm()}s`
                }}
            >
                {/* VISUAL: root wrapper keeps visual layers aligned outside transformed regions */}
                {/* VISUAL: global particle layer – portal to <body> */}
                <ParticleLayerPortal>
                  <ParticleBackground
                      currentTheme={backgroundTheme}
                      pulseLevel={pulseLevel}
                      bpm={audioEngine.getCurrentBpm()}
                      reducedMotion={prefersReducedMotion}
                  />
                </ParticleLayerPortal>
                <div
                    id="app-content"
                    aria-hidden={!!modalState.type}
                    className="w-full h-screen relative overflow-hidden"
                >
                    <div className={`bg-layer ${activeBg === 1 ? 'opacity-100' : 'opacity-0'} ${prevBackgroundClass}`} />
                    <div className={`bg-layer ${activeBg === 2 ? 'opacity-100' : 'opacity-0'} ${activeBackgroundClass}`} />

                    {/* VISUAL: maintain background depth hierarchy inside app-content */}
                    {/* VISUAL: parallax background layer behind UI - reacts to isSpinning */}
                    <motion.div
                        id="parallax-bg"
                        className="fixed inset-0 pointer-events-none"
                        initial={{ scale: 1, opacity: 0.15 }}
                        animate={typeof isSpinning !== 'undefined' && isSpinning
                            ? { scale: 1.1, opacity: 0.3 }
                            : { scale: 1, opacity: 0.15 }}
                        transition={{ duration: 0.8, ease: 'easeInOut' }}
                    />
                    {/* VISUAL: ambient glow overlay above parallax but below interactive layers */}
                    <div
                        id="ambient-glow"
                        className="fixed inset-0 pointer-events-none"
                    />
                    {/* VISUAL: ensure overlays never block input */}
                    <div className="hdr-glow-overlay pointer-events-none" />
                    <Vignette />
                    <NoiseOverlay reducedMotion={prefersReducedMotion} />
                    <div className="aurora-reflect pointer-events-none" />
                    <RadialLighting reducedMotion={prefersReducedMotion} />

                    <AnimatePresence>
                        {showConfetti && (
                            <Confetti key="confetti" onFinish={() => setShowConfetti(false)} origin={confettiOrigin} theme={currentTheme} reducedMotion={prefersReducedMotion} />
                        )}
                        {showPowerSurge && (
                            <PowerSurgeEffect
                                key="power-surge"
                                onComplete={() => {
                                    setShowPowerSurge(false);
                                    if (extremeRoundSource === 'spark') {
                                        safeSetPulseLevel(0); // [Fix C2]
                                    }
                                }}
                                reducedMotion={prefersReducedMotion}
                            />
                        )}
                    </AnimatePresence>

                    {/* VISUAL: elevate primary UI above background stack */}
                    <div className="relative z-[20] h-full">
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
                </div>
            </div>
        </MotionConfig>
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

