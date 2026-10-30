/**
 * Balk-entry — de AXE-balk, een eigen Tauri-venster (`axe-balk`).
 * Geen router en geen auth: één klein scherm. Zie src/domain/balk/balk.ts.
 */
import { createRoot } from 'react-dom/client';
import '@/app/index.css';
import { ErrorBoundary } from '@/presentation/components/shared/ErrorBoundary';
import AxeBalk from '@/presentation/pages/AxeBalk';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AxeBalk />
  </ErrorBoundary>,
);
