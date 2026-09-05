import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { devProxy } from './vite.proxy';

/** Twee ontwerp-ingangen: stage.html (Home's toneel) en shell.html (de hele schil).
 *  Geen PWA, geen auth, geen productiebuild. */
const port = Number(process.env.PORT ?? 5010);
const entry = process.env.STAGE_ENTRY ?? 'stage';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  server: {
    port,
    strictPort: false,
    host: '0.0.0.0',
    open: `/${entry}.html`,
    // Dezelfde proxy als de hoofdapp. Zonder dit gaven de geheugen- en
    // hub-endpoints 404 en bleef Neural leeg: de scenes zijn er wel, maar
    // er kwam niets binnen om te tekenen.
    proxy: devProxy(),
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/stage'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, `${entry}.html`),
    },
  },
});
