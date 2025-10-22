import fs from "fs";
import { brotliCompressSync } from "zlib";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// [Fix BOOT-005] CSS preload safeguard — prevent hashed CSS preload crash on deploy
const criticalPreloadPlugin = () => ({
  name: "critical-preload-injector",
  transformIndexHtml(html) {
    const preloadTags = [
      {
        tag: "link",
        attrs: {
          rel: "preload",
          as: "style",
          href: "https://fonts.googleapis.com/css2?family=Great+Vibes&family=Inter:wght@400..900&display=swap",
          "data-preload-id": "critical-font-css",
        },
        injectTo: "head",
      },
      {
        tag: "link",
        attrs: {
          rel: "preload",
          as: "image",
          href: "/icon-512.png",
          fetchpriority: "high",
          imagesrcset: "/icon-512.png 512w, /icon-192.png 192w",
          "data-preload-id": "hero-stage-image",
        },
        injectTo: "head",
      },
    ];
    return { html, tags: preloadTags };
  },
});

// [Optimize QA-010] Lightweight Brotli copies for hosting layers that serve precompressed assets
const brotliBundlePlugin = () => ({
  name: "pulse-brotli-writer",
  apply: "build",
  generateBundle(_, bundle) {
    const compressible = /\.(js|css|html|svg)$/i;
    for (const [fileName, output] of Object.entries(bundle)) {
      if (!compressible.test(fileName)) continue;
      const payload = output.type === "asset" ? output.source : output.code;
      if (!payload) continue;

      try {
        const buffer = typeof payload === "string" ? Buffer.from(payload) : Buffer.from(payload);
        const compressed = brotliCompressSync(buffer);
        this.emitFile({
          type: "asset",
          fileName: `${fileName}.br`,
          source: compressed,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.warn(`[Optimize QA-010] Skipped Brotli compression for ${fileName}: ${reason}`);
      }
    }
  },
});

// RELIABILITY: optional safety — clear old cache on build start
try {
  fs.rmSync(".vite_cache", { recursive: true, force: true });
  console.log("[Reliability] Cleared old Vite cache before build");
} catch {}

export default defineConfig({
  // RELIABILITY: Use root-relative base to keep PWA asset URLs consistent in all environments
  base: "./",
  plugins: [
    react(),
    criticalPreloadPlugin(), // [Fix PERF-03]
    brotliBundlePlugin(), // [Optimize QA-010]
  ],
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
    chunkSizeWarningLimit: 1500,

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
