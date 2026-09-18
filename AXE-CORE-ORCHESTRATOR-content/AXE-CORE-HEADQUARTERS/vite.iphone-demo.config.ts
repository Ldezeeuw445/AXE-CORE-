import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const port = Number(process.env.PORT ?? 5002);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  server: {
    port,
    strictPort: false,
    host: '0.0.0.0',
    open: '/iphone-demo.html',
  },
});
