import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig, type ProxyOptions } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { SERVICE_ENDPOINTS } from './src/infrastructure/config/serviceEndpoints';

// Dev-server proxy table, generated from the shared endpoint registry so the
// browser-side URL resolution (apiConfig.ts) and this proxy can never drift.
const serviceProxies: Record<string, ProxyOptions> = Object.fromEntries(
  Object.entries(SERVICE_ENDPOINTS).map(([name, endpoint]) => [
    `/proxy/${name}`,
    {
      target:
        (endpoint.targetEnvVar && process.env[endpoint.targetEnvVar]) ||
        endpoint.target,
      changeOrigin: true,
      ...(endpoint.secure === false ? { secure: false } : {}),
      rewrite: (p: string) => p.replace(new RegExp(`^/proxy/${name}`), ''),
    },
  ]),
);

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
      ...serviceProxies,
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
