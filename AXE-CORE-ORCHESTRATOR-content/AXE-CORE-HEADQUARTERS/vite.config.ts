import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// PORT/BASE_PATH are provided by the Replit workflow for dev/preview. They are
// irrelevant to `vite build` (no server is started), so fall back to sane
// defaults instead of throwing — this keeps standalone builds (e.g. Vercel)
// working without Replit-specific env vars.
const isBuildCommand = process.argv.includes('build');
const rawPort = process.env.PORT;

if (!rawPort && !isBuildCommand) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort ?? 5000);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/';

// Replit plugins are only available inside Replit; wrap in try/catch so
// standalone/Vercel builds don't crash when the package is missing.
async function getReplitPlugins() {
  const plugins: any[] = [];
  
  try {
    const replitOverlay = await import('@replit/vite-plugin-runtime-error-modal');
    const overlayFn = replitOverlay.default ?? replitOverlay.runtimeErrorOverlay;
    if (overlayFn) plugins.push(overlayFn());
  } catch { /* not in Replit */ }
  
  if (process.env.NODE_ENV !== 'production' && process.env.REPL_ID !== undefined) {
    try {
      const cartographer = await import('@replit/vite-plugin-cartographer');
      plugins.push(cartographer.cartographer({
        root: path.resolve(import.meta.dirname, '..'),
      }));
    } catch { /* not in Replit */ }
    
    try {
      const devBanner = await import('@replit/vite-plugin-dev-banner');
      plugins.push(devBanner.devBanner());
    } catch { /* not in Replit */ }
  }
  
  return plugins;
}

export default defineConfig(async () => ({
  base: basePath,
  plugins: [
    react(),
    ...(await getReplitPlugins()),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      '/proxy/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/anthropic/, ''),
      },
      '/proxy/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/openai/, ''),
      },
      '/proxy/google': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/google/, ''),
      },
      '/proxy/groq': {
        target: 'https://api.groq.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/groq/, ''),
      },
      '/proxy/openrouter': {
        target: 'https://openrouter.ai',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/openrouter/, ''),
      },
      '/proxy/krater': {
        target: 'https://api.krater.ai',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/krater/, ''),
      },
      '/proxy/exa': {
        target: 'https://api.exa.ai',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/exa/, ''),
      },
      '/proxy/ollama': {
        target: process.env.OLLAMA_PROXY_TARGET || 'https://ollama.axecompanion.com',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/ollama/, ''),
      },
      '/proxy/n8n': {
        target: process.env.N8N_PROXY_TARGET || 'http://89.167.78.6:5678',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/n8n/, ''),
      },
      '/proxy/openhands': {
        target: process.env.OPENHANDS_PROXY_TARGET || 'http://89.167.78.6:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/openhands/, ''),
      },
      '/proxy/openjarvis': {
        target: process.env.OPENJARVIS_PROXY_TARGET || 'http://89.167.78.6:2025',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/openjarvis/, ''),
      },
      '/proxy/openclaw': {
        target: process.env.OPENCLAW_PROXY_TARGET || 'http://89.167.78.6:5001',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/openclaw/, ''),
      },
      '/proxy/kilocode': {
        target: process.env.KILOCODE_PROXY_TARGET || 'http://89.167.78.6:5002',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/kilocode/, ''),
      },
      '/proxy/crewai': {
        target: process.env.CREWAI_PROXY_TARGET || 'http://89.167.78.6:5003',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/crewai/, ''),
      },
      '/proxy/hermes': {
        target: process.env.HERMES_PROXY_TARGET || 'http://89.167.78.6:3010',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/hermes/, ''),
      },
      '/proxy/krater': {
        target: 'https://api.krater.ai',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/krater/, ''),
      },
      '/proxy/axecore': {
        target: process.env.AXE_CORE_API_PROXY_TARGET || 'https://api.axecompanion.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/axecore/, ''),
      },
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
}));
