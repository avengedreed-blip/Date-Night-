/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
      colors: {
        highlight: "var(--theme-highlight)",
        base: "var(--theme-base)",
        shadow: "var(--theme-shadow)",
        label: "var(--theme-label)",
      },
      boxShadow: {
        glow: "0 0 12px rgba(255,255,255,0.25)",
      },
      transitionTimingFunction: {
        "soft-spring": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        pulseBeat: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.85" },
          "50%": { transform: "scale(1.08)", opacity: "1" },
        },
      },
      animation: {
        pulseBeat: "pulseBeat 1.2s ease-in-out infinite",
      },
    },
  },
  corePlugins: {
    preflight: true,
  },
  plugins: [],
  safelist: [
    'animate-pulse',
    'animate-pulseBeat',
    'animate-[pulseBeat]',
    'text-[var(--theme-highlight)]', // [Fix BOOT-004] Preserve theme-driven text utility
    'text-[var(--theme-label)]', // [Fix BOOT-004]
    'ring-[var(--theme-highlight)]', // [Fix BOOT-004]
    'focus:border-[var(--theme-highlight)]', // [Fix BOOT-004]
    'focus:ring-[var(--theme-highlight)]', // [Fix BOOT-004]
  ],
};
