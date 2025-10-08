import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "esnext",
    cssMinify: true,
    minify: "terser",
    sourcemap: false,
    outDir: "dist",
    assetsInlineLimit: 8192,
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true, passes: 2 },
      format: { comments: false },
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  optimizeDeps: {
    include: ["tone", "framer-motion"],
  },
  esbuild: {
    legalComments: "none",
  },
});
