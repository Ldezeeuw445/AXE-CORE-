import { Routes, Route } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import LoginPage from '@/pages/LoginPage';
import { RequireAuth } from '@/app/guards/RequireAuth';
import { useGlobalVoiceActivation } from '@/app/hooks/useGlobalVoiceActivation';
import { shellRoutes } from '@/app/routes';

/**
 * Composition root. Wires global providers, guards, and the route registry —
 * screen-level concerns live in src/pages, cross-cutting logic in src/app.
 */
export default function App() {
  // Global keyboard shortcuts (CMD/Ctrl + letter = tab navigation)
  useKeyboardShortcuts({});
  useGlobalVoiceActivation();

  return (
    <ErrorBoundary>
      <NotificationProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            {shellRoutes.map((r) =>
              r.path === undefined
                ? <Route key="index" index element={r.element} />
                : <Route key={r.path} path={r.path} element={r.element} />,
            )}
          </Route>
        </Routes>
      </NotificationProvider>
    </ErrorBoundary>
  );
}
