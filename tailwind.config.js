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
    },
  },
  corePlugins: {
    preflight: true,
  },
  plugins: [],
  safelist: [{ pattern: /(text|bg|border|ring)-\[var\(--.+\)\]/ }],
};
