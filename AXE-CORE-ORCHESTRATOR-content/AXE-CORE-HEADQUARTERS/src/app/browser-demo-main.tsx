/**
 * Lightweight browser demo entry — no Auth, voice, memory, or full App shell.
 * Run: npm run dev:browser-demo  →  http://127.0.0.1:5000/browser-demo.html
 */
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router';
import '@/app/index.css';
import { ErrorBoundary } from '@/presentation/components/shared/ErrorBoundary';
import BrowserApp from '@/presentation/components/browser/BrowserApp';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <HashRouter>
      <Routes>
        <Route path="*" element={<BrowserApp standalone demo />} />
      </Routes>
    </HashRouter>
  </ErrorBoundary>,
);
