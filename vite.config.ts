import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['path', 'process', 'os', 'crypto', 'stream', 'util', 'events', 'buffer', 'http', 'https', 'net', 'tls', 'fs', 'url', 'zlib', 'dns', 'http2'],
    }),
  ],
  server: {
    port: 3000,
    host: "0.0.0.0",
    proxy: {
      "/api": { target: "http://localhost:3002", changeOrigin: true },
      "/ws": { target: "ws://localhost:3002", ws: true },
    },
  },
  build: {
    target: "esnext",
    sourcemap: false,
    rollupOptions: {
      external: [
        "child_process",
        "url",
        "path",
        "fs",
        "os",
        "crypto",
        "net",
        "tls",
        "http",
        "https",
        "stream",
        "zlib",
        "events",
        "util",
        "process",
        "dns",
        "http2",
        "https",
        "@temporalio/worker",
        "@temporalio/workflow",
        "@temporalio/activity",
        "@temporalio/client",
      ],
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts", "lightweight-charts"],
          motion: ["motion"],
          zustand: ["zustand"],
          gemini: ["@google/genai"],
          icons: ["lucide-react"],
          query: ["@tanstack/react-query"],
          langchain: ["langchain", "@langchain/core", "@langchain/community"],
          supabase: ["@supabase/supabase-js", "@supabase/postgrest-js"],
          forms: ["react-hook-form", "@hookform/resolvers", "zod"],
        },
      },
    },
  },
  preview: {
    port: 3000,
    headers: {
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: blob:",
        "font-src 'self' data:",
        "connect-src 'self' https://generativelanguage.googleapis.com https://api.github.com https://openrouter.ai https://api.deepseek.com https://*.supabase.co wss: ws:",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "1.0.0"),
    // Removed redundant process/global polyfills that conflict with vite-plugin-node-polyfills
  },
});
