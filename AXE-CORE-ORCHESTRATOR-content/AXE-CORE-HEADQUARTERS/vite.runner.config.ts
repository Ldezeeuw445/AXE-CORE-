/**
 * Bouwt de headless VPS-runner (src/app/deskRunner.ts) als één ESM-bestand
 * voor Node: `npm run build:runner` → dist-runner/deskRunner.mjs.
 * Alles gebundeld, zodat er op de VPS geen node_modules nodig is.
 */
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  publicDir: false,
  build: {
    ssr: 'src/app/deskRunner.ts',
    outDir: 'dist-runner',
    emptyOutDir: true,
    target: 'node20',
    sourcemap: false,
    rollupOptions: { output: { format: 'esm', entryFileNames: 'deskRunner.mjs', inlineDynamicImports: true } },
  },
  ssr: { noExternal: true, target: 'node' },
  logLevel: 'warn',
});
