import path from 'path';
import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { devProxy } from './vite.proxy';
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
// Het laden van .env en de proxy-tabel staan nu in vite.proxy.ts, zodat de
// stage-entry dezelfde tabel gebruikt in plaats van een kopie. De import doet
// het env-werk: ES-imports draaien vóór deze module-body, dus alles hieronder
// ziet dezelfde process.env als voorheen.

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

/**
 * ANDROID_SHELL=1 builds the copy that ships inside the AXE Core Android APK.
 *
 * The service worker is switched off for that build on purpose. It cannot
 * register on the WebView's appassets origin — the app catches the rejection
 * and shows it as a red error banner — and even if it could, a worker
 * precaching ~10 MB would keep serving the old files after the in-app bundle
 * updater installed a new build, which is the exact problem the updater exists
 * to solve. Web and Tauri builds are untouched.
 */
const isAndroidShell = process.env.ANDROID_SHELL === '1';

/**
 * Which build is this, stamped in at build time.
 *
 * From the Mac Mini's branch, and it answers a question that has cost real
 * time: an APK or a bundle that looks current but is not. src/domain/buildStamp
 * reads __BUILD_STAMP__ and was already carried over -- it just had nothing to
 * read, because this config never defined it.
 */
const BUILD_STAMP = {
  at: new Date().toISOString(),
  commit: (() => {
    try {
      return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      // A build from a tarball or a detached copy has no git. An unknown
      // commit is honest; a fabricated one is worse than none.
      return 'unknown';
    }
  })(),
};

export default defineConfig({
  base: basePath,
  define: { __BUILD_STAMP__: JSON.stringify(BUILD_STAMP) },
  plugins: [
    react(),
    VitePWA({
      disable: isAndroidShell,
      registerType: 'autoUpdate',
      injectRegister: isAndroidShell ? false : 'script',
      manifest: false, // We use our own public/manifest.json
      workbox: {
        // 8 MB. The main chunk was 3.7 MB when this was set to 5, and is 5.24 MB
        // now — a limit written against a measurement ages badly, and when it
        // is crossed the build FAILS rather than warning, so the next person
        // meets it as a broken build with no obvious link to bundle growth.
        //
        // Worth its own look, separately: 5.24 MB in ONE chunk is a lot to hand
        // a phone on a cold load, and the build already suggests
        // build.rollupOptions.output.manualChunks for exactly this.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
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
    proxy: devProxy(),
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
