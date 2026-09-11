import { createRoot } from 'react-dom/client';
import '@/app/index.css';
import { ErrorBoundary } from '@/presentation/components/shared/ErrorBoundary';
import IPhoneDemoPage from '@/presentation/pages/IPhoneDemoPage';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <IPhoneDemoPage />
  </ErrorBoundary>,
);
