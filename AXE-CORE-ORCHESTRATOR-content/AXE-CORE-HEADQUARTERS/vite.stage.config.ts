import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { devProxy } from './vite.proxy';

/** Alleen Home's stage: geen PWA, geen auth, geen shell. */
const port = Number(process.env.PORT ?? 5010);

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
    open: '/stage.html',
    // Dezelfde proxy als de hoofdapp. Zonder dit gaven de geheugen- en
    // hub-endpoints 404 en bleef Neural leeg: de scenes zijn er wel, maar
    // er kwam niets binnen om te tekenen.
    proxy: devProxy(),
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/stage'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'stage.html'),
    },
  },
});
