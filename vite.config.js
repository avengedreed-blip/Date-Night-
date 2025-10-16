import fs from "fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// RELIABILITY: optional safety — clear old cache on build start
try {
  fs.rmSync(".vite_cache", { recursive: true, force: true });
  console.log("[Reliability] Cleared old Vite cache before build");
} catch {}

export default defineConfig({
  // RELIABILITY: ensure SW + manifest load from root scope on Vercel
  base: "/",
  plugins: [react()],
  publicDir: "public",
  // RELIABILITY: Ensure idb-keyval imports resolve to local shim for offline builds.
  resolve: {
    alias: {
      'idb-keyval': '/src/internal-idb-keyval.js',
    },
  },
  build: {
    target: "esnext",
    cssMinify: true,
    minify: "terser",
    sourcemap: false,
    outDir: "dist",
    assetsInlineLimit: 8192,

    // RELIABILITY: safer Terser config to prevent variable hoisting/mangling crash
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 1, // ↓ reduce optimization passes (was 2)
        hoist_funs: false, // ↓ prevent function hoisting reordering
        hoist_vars: false, // ↓ prevent variable hoisting
        inline: 1, // ↓ restrict inlining depth for React lambdas
      },
      mangle: {
        keep_classnames: true, // ↓ preserve React component names
        keep_fnames: true, // ↓ preserve function names
        safari10: true, // ↓ fix Safari parsing quirks
      },
      format: { comments: false },
    },

    // RELIABILITY: ensure consistent output hash naming
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  // RELIABILITY: extra hardening for build caching and Vercel consistency
  optimizeDeps: {
    include: ["tone", "framer-motion"],
    esbuildOptions: {
      keepNames: true, // keep function/class names for debug clarity
    },
  },
  esbuild: {
    legalComments: "none",
    keepNames: true, // ensure esbuild respects React names too
  },
  cacheDir: ".vite_cache", // stable local build cache
});
