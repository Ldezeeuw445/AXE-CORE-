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
        target: process.env.OLLAMA_PROXY_TARGET || 'http://89.167.78.6:11435',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy\/ollama/, ''),
      },
      '/proxy/n8n': {
        target: process.env.N8N_PROXY_TARGET || 'http://89.167.78.6:5678',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy\/n8n/, ''),
      },
      '/proxy/openhands': {
        target: process.env.OPENHANDS_PROXY_TARGET || 'http://89.167.78.6:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy\/openhands/, ''),
      },
      '/proxy/openjarvis': {
        target: process.env.OPENJARVIS_PROXY_TARGET || 'http://89.167.78.6:2025',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy\/openjarvis/, ''),
      },
      '/proxy/openclaw': {
        target: process.env.OPENCLAW_PROXY_TARGET || 'http://89.167.78.6:5001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy\/openclaw/, ''),
      },
      '/proxy/kilocode': {
        target: process.env.KILOCODE_PROXY_TARGET || 'http://89.167.78.6:5002',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy\/kilocode/, ''),
      },
      '/proxy/crewai': {
        target: process.env.CREWAI_PROXY_TARGET || 'http://89.167.78.6:5003',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy\/crewai/, ''),
      },
      '/proxy/hermes': {
        target: process.env.HERMES_PROXY_TARGET || 'http://89.167.78.6:3010',
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
