import { ErrorBoundary } from '@/presentation/components/shared/ErrorBoundary';
import BrowserApp from '@/presentation/components/browser/BrowserApp';

/** Standalone desktop browser — opens outside AppShell in its own Tauri window. */
export default function StandaloneBrowserPage() {
  return (
    <ErrorBoundary>
      <BrowserApp standalone />
    </ErrorBoundary>
  );
}
