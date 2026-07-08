import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/proxy/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/anthropic/, ''),
      },
      '/proxy/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/openai/, ''),
      },
      '/proxy/google': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/google/, ''),
      },
      '/proxy/xai': {
        target: 'https://api.x.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/xai/, ''),
      },
      '/proxy/groq': {
        target: 'https://api.groq.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/groq/, ''),
      },
      '/proxy/openrouter': {
        target: 'https://openrouter.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/openrouter/, ''),
      },
      '/proxy/ollama': {
        // Direct VPS IP bypasses Cloudflare Access (which returns 403)
        // nginx on port 80 proxies to Ollama:11434 with CORS headers
        target: process.env.OLLAMA_PROXY_TARGET || 'http://89.167.78.6',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy\/ollama/, ''),
      },
      '/proxy/openhands': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy\/openhands/, ''),
      },
      '/proxy/openjarvis': {
        target: 'http://localhost:2025',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy\/openjarvis/, ''),
      },
      '/proxy/openclaw': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy\/openclaw/, ''),
      },
      '/proxy/kilocode': {
        target: 'http://localhost:5002',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy\/kilocode/, ''),
      },
      '/proxy/crewai': {
        target: 'http://localhost:5003',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy\/crewai/, ''),
      },
      '/proxy/hermes': {
        target: 'http://localhost:3010',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy\/hermes/, ''),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
