/**
 * Tests get their own config on purpose.
 *
 * vite.config.ts is the dev-server config: it demands a PORT, wires proxies to
 * the VPS and registers the PWA plugin. Vitest picks it up by default, which
 * made `npm test` fail before a single test ran — and would have meant unit
 * tests could not run without the whole serving environment present.
 *
 * This file carries only what a test needs: the `@` alias, so imports match
 * the app's, and node as the environment. Add jsdom here if components ever
 * need rendering; nothing does yet, and an unused browser shim only slows the
 * suite down.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
