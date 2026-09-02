import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Lightweight Vite config for the browser UI demo only (no PWA, no full app). */
const port = Number(process.env.PORT ?? 5000);

export default defineConfig({
  define: {
    'import.meta.env.VITE_BROWSER_DEMO': JSON.stringify('true'),
  },
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
    open: '/browser-demo.html',
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/browser-demo'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'browser-demo.html'),
    },
  },
});
