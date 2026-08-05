import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Vite only exposes VITE_-prefixed vars to client code, and it never puts the
// plain ones into `process.env` for the config file itself. Everything here
// that reads `process.env` is server-side config — proxy bearer tokens, ports,
// upstream targets — so without this they were only ever set when someone
// happened to export them in the shell. That is why the /proxy/axecore dev
// proxy forwarded requests with no Authorization header and every memory write
// came back 401.
//
// The empty prefix loads every var, not just VITE_ ones. Real shell variables
// win over .env so CI and one-off overrides keep working.
const envMode =
  process.env.NODE_ENV || (process.argv.includes('build') ? 'production' : 'development');
for (const [k, v] of Object.entries(loadEnv(envMode, process.cwd(), ''))) {
  if (process.env[k] === undefined) process.env[k] = v;
}

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

const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const basePath = isGitHubPages ? '/AXE-CORE-/' : (process.env.BASE_PATH ?? '/');
const isReplit = process.env.REPL_ID !== undefined;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      manifest: false, // We use our own public/manifest.json
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB — bundle is 3.7 MB
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,ttf}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/a\.basemaps\.cartocdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'carto-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/(api|proxy)\./i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
    ...(isReplit
      ? [
          await import('@replit/vite-plugin-runtime-error-modal').then((m) =>
            m.default(),
          ),
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
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
      '/proxy/xai': {
        target: 'https://api.x.ai',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/xai/, ''),
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
      '/proxy/ollama': {
        target: process.env.OLLAMA_PROXY_TARGET || 'https://ollama.axecompanion.com',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/ollama/, ''),
      },
      '/proxy/n8n': {
        target: process.env.N8N_PROXY_TARGET || 'http://212.227.91.79:5678',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/n8n/, ''),
      },
      '/proxy/openhands': {
        target: process.env.OPENHANDS_PROXY_TARGET || 'http://212.227.91.79:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/openhands/, ''),
      },
      '/proxy/openjarvis': {
        target: process.env.OPENJARVIS_PROXY_TARGET || 'http://212.227.91.79:2025',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/openjarvis/, ''),
      },
      '/proxy/openclaw': {
        target: process.env.OPENCLAW_PROXY_TARGET || 'http://212.227.91.79:5001',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/openclaw/, ''),
      },
      '/proxy/kilocode': {
        target: process.env.KILOCODE_PROXY_TARGET || 'http://212.227.91.79:5002',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/kilocode/, ''),
      },
      '/proxy/crewai': {
        target: process.env.CREWAI_PROXY_TARGET || 'http://212.227.91.79:5003',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/crewai/, ''),
      },
      '/proxy/hermes': {
        target: process.env.HERMES_PROXY_TARGET || 'http://212.227.91.79:3010',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/proxy\/hermes/, ''),
      },
      // LOCAL = VERCEL PARITY: every `/api/*` serverless function (proxy/axecore,
      // ai, tts, exa, browse) is proxied to the deployed Vercel host, so running
      // locally (npm run dev / Tauri) behaves EXACTLY like production and uses
      // the same server-side keys already configured on Vercel — no local
      // secrets, and it only INVOKES the functions, so you're not redeploying
      // (no build minutes) while you finish everything on localhost. Override
      // the target with LOCAL_API_TARGET if your prod domain differs.
      '/api': {
        target: process.env.LOCAL_API_TARGET || 'https://www.axeheadquarters.com',
        changeOrigin: true,
        secure: true,
      },
      '/proxy/axecore': {
        target: process.env.AXE_CORE_API_PROXY_TARGET || process.env.AXE_CORE_API_URL || 'https://api.axecompanion.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/axecore/, ''),
        // Attach the bearer key server-side (from a plain, non-VITE_ .env var)
        // so the browser never needs it — matches the prod Vercel proxy at
        // api/proxy/axecore.ts (via a vercel.json rewrite), which does the same thing.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const key = process.env.AXE_CORE_API_KEY;
            if (key) proxyReq.setHeader('Authorization', `Bearer ${key}`);
          });
        },
      },
      '/api/browse': {
        target: 'http://localhost:8080',
        changeOrigin: false,
      },
      '/api/files': {
        target: 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
