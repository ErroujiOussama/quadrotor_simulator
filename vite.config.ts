/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Split heavy vendors into their own chunks for faster cold loads on Vercel.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          charts: ["chart.js", "react-chartjs-2", "recharts"],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  test: {
    // The headless core (src/core) runs in plain Node — no DOM. This enforces
    // constitution P3 (engine has zero browser deps) at test time.
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    globals: false,
  },
}));
