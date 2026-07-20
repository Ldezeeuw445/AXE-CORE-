import { useEffect, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useClapDetector } from '@/hooks/useClapDetector';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import LoginPage from '@/pages/LoginPage';
import { useAuth } from '@/app/providers/AuthContext';
import { useVoiceStore } from '@/store/voiceStore';
import { loadSetting } from '@/infrastructure/persistence/userSettingsService';
import { NotificationProvider } from '@/app/providers/NotificationContext';
import { RequireAuth } from '@/app/guards/RequireAuth';
import { APP_ROUTES } from '@/app/routes';

export default function App() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clapEnabled, setClapEnabled] = useState(false);

  // Reload persisted chat history from Supabase on first mount (survives refresh).
  useEffect(() => {
    useVoiceStore.getState().loadConversation().catch(() => {});
  }, []);

  // Global keyboard shortcuts (CMD/Ctrl + letter = tab navigation)
  useKeyboardShortcuts({});

  // "Clap to activate" — opt-in setting, only armed once logged in.
  useEffect(() => {
    if (!user) { setClapEnabled(false); return; }
    loadSetting('axe_clap_activate_enabled', false).then(setClapEnabled);
  }, [user]);

  useClapDetector(clapEnabled, () => {
    const voice = useVoiceStore.getState();
    if (voice.voiceStatus === 'listening' || voice.voiceStatus === 'processing') return;
    navigate('/');
    voice.startListening().catch(() => {});
  });

  return (
    <ErrorBoundary>
      <NotificationProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            {APP_ROUTES.map((r) =>
              r.path === 'index'
                ? <Route key="index" index element={r.element} />
                : <Route key={r.path} path={r.path} element={r.element} />,
            )}
          </Route>
        </Routes>
      </NotificationProvider>
    </ErrorBoundary>
  );
}
