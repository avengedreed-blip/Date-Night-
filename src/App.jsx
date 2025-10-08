import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  motion,
  AnimatePresence,
  MotionConfig,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import * as Tone from "tone";
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Polyfill for structuredClone if needed
if (typeof structuredClone !== "function") {
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// ==================== FIREBASE CONFIG ====================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ==================== AUDIO ENGINE ====================
const audioEngine = (() => {
  let isInitialized = false;
  const synths = {};
  let activeTheme = null;
  let bpm = 100;

  const init = async () => {
    if (isInitialized) return;
    await Tone.start();
    Tone.Transport.bpm.value = bpm;

    // Audio latency tuning
    Tone.context.lookAhead = 0.03;
    Tone.context.latencyHint = "interactive";
    Tone.Transport.lookAhead = 0.03;

    synths.tick = new Tone.MembraneSynth().toDestination();
    synths.blip = new Tone.Synth().toDestination();
    isInitialized = true;
  };

  const playTick = () => synths.tick?.triggerAttackRelease("C2", "8n");
  const playBlip = () => synths.blip?.triggerAttackRelease("C5", "16n");
  const setTheme = (theme) => (activeTheme = theme);

  return { init, playTick, playBlip, setTheme };
})();

// ==================== MAIN APP ====================
export default function App() {
  const [activeScreen, setActiveScreen] = useState("start");
  const [theme, setTheme] = useState("velourNights");
  const [spinResult, setSpinResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [angle, setAngle] = useState(0);

  const wheelRef = useRef(null);
  const spinButtonRef = useRef(null);
  const activeBg = useRef("theme-velour-nights-bg");
  const prevBg = useRef("theme-velour-nights-bg");

  // Theme definitions
  const visualThemes = useMemo(
    () => ({
      velourNights: { bg: "theme-velour-nights-bg", vars: "theme-velour-nights" },
      lotusDreamscape: { bg: "theme-lotus-dreamscape-bg", vars: "theme-lotus-dreamscape" },
      velvetCarnival: { bg: "theme-velvet-carnival-bg", vars: "theme-velvet-carnival" },
      starlitAbyss: { bg: "theme-starlit-abyss-bg", vars: "theme-starlit-abyss" },
      crimsonFrenzy: { bg: "theme-crimson-frenzy-bg", vars: "theme-crimson-frenzy" },
    }),
    []
  );

  const currentTheme = visualThemes[theme];

  const spinWheel = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    audioEngine.playBlip();

    const newAngle = angle + 720 + Math.floor(Math.random() * 360);
    setAngle(newAngle);

    setTimeout(() => {
      setSpinResult(["truth", "dare", "trivia"][Math.floor(Math.random() * 3)]);
      setSpinning(false);
    }, 4500);
  }, [spinning, angle]);

  useEffect(() => {
    audioEngine.init();
  }, []);

  const renderScreen = () => {
    switch (activeScreen) {
      case "start":
        return (
          <div className="flex flex-col items-center justify-center min-h-screen gap-6">
            <h1 className="text-5xl font-black text-white drop-shadow-lg">Date Night</h1>
            <button className="btn btn--primary" onClick={() => setActiveScreen("game")}>
              Tap to Begin
            </button>
          </div>
        );
      case "game":
        return (
          <div className="flex flex-col items-center justify-center min-h-screen relative">
            <canvas ref={wheelRef} id="wheelCanvas" className="z-10"></canvas>
            <motion.button
              ref={spinButtonRef}
              className="btn btn--primary absolute z-20"
              style={{ bottom: "8%" }}
              whileTap={{ scale: 0.92 }}
              onClick={spinWheel}
              disabled={spinning}
            >
              {spinning ? "Spinning..." : "SPIN"}
            </motion.button>
            <div className="pulse-meter absolute bottom-[18%] z-30">{pulse}</div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`relative overflow-hidden w-full h-full ${currentTheme.vars}`}>
      <div className={`bg-layer ${prevBg.current}`}></div>
      <div className={`bg-layer ${activeBg.current}`}></div>

      {/* overlays */}
      <div className="hdr-glow-overlay"></div>
      <div className="aurora-reflect"></div>
      <div className="vignette-overlay"></div>
      <div className="noise-animated"></div>
      <div className="radial-light-overlay"></div>

      <div className="relative z-40 flex flex-col items-center justify-center w-full h-full">
        <MotionConfig transition={{ type: "spring", stiffness: 240, damping: 24 }}>
          {renderScreen()}
        </MotionConfig>
      </div>
    </div>
  );
}
