import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router';
import { AppShell } from '@/presentation/components/layout/AppShell';
import { useKeyboardShortcuts } from '@/presentation/hooks/useKeyboardShortcuts';
import { useClapDetector } from '@/presentation/hooks/useClapDetector';
import { ErrorBoundary } from '@/presentation/components/shared/ErrorBoundary';
import LoginPage from '@/presentation/pages/LoginPage';
import { useAuth } from '@/presentation/contexts/AuthContext';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { loadSetting } from '@/infrastructure/persistence/userSettingsService';
import { NotificationProvider } from '@/presentation/contexts/NotificationContext';
import Home from '@/presentation/pages/Home';
import AICore from '@/presentation/pages/AICore';
import Agents from '@/presentation/pages/Agents';
import Tasks from '@/presentation/pages/Tasks';
import CalendarPage from '@/presentation/pages/CalendarPage';
import Memory from '@/presentation/pages/Memory';
import KnowledgeBase from '@/presentation/pages/KnowledgeBase';
import Trading from '@/presentation/pages/Trading';
import Finance from '@/presentation/pages/Finance';
import MCPCenter from '@/presentation/pages/MCPCenter';
import Infrastructure from '@/presentation/pages/Infrastructure';
import CommandCenter from '@/presentation/pages/CommandCenter';
import TerminalPage from '@/presentation/pages/TerminalPage';
import SettingsPage from '@/presentation/pages/SettingsPage';
import TableEditor from '@/presentation/pages/TableEditor';
import CronManager from '@/presentation/pages/CronManager';
import ControlPlane from '@/presentation/pages/ControlPlane';
import Maps3D from '@/presentation/pages/Maps3D';
import CrewAI from '@/presentation/pages/CrewAI';
import CodeEditorPage from '@/presentation/pages/CodeEditorPage';
import EveFramework from '@/presentation/pages/EveFramework';
import BrowserPage from '@/presentation/pages/BrowserPage';
import AppsPage from '@/presentation/pages/AppsPage';
import Organization from '@/presentation/pages/Organization';

// AXE CORE is admin-only — only these emails can access the app
const ADMIN_EMAILS = ['lukadezeeuw1994@hotmail.com'];

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!ADMIN_EMAILS.includes(user.email ?? '')) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0A0A10', color: '#EF4444', fontFamily: 'JetBrains Mono, monospace', gap: 12 }}>
        <span style={{ fontSize: 48 }}>⛔</span>
        <span style={{ fontSize: 14 }}>ACCESS DENIED</span>
        <span style={{ fontSize: 11, color: '#6B7280' }}>AXE CORE is a private admin system.</span>
        <button onClick={() => { const sb = (window as never as { supabase?: { auth: { signOut: () => void } } }).supabase; sb?.auth.signOut(); window.location.href = '/login'; }} style={{ marginTop: 8, fontSize: 11, color: '#6B7280', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>Sign out</button>
      </div>
    );
  }
  return <>{children}</>;
}

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
            <Route index element={<Home />} />
            <Route path="ai-core" element={<AICore />} />
            <Route path="apps" element={<AppsPage />} />
            <Route path="agents" element={<Agents />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="memory" element={<Memory />} />
            <Route path="knowledge" element={<KnowledgeBase />} />
            <Route path="trading" element={<Trading />} />
            <Route path="finance" element={<Finance />} />
            <Route path="mcp" element={<MCPCenter />} />
            <Route path="infrastructure" element={<Infrastructure />} />
            <Route path="command" element={<TerminalPage />} />
            <Route path="terminal" element={<TerminalPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="table-editor" element={<TableEditor />} />
            <Route path="cron-manager" element={<CronManager />} />
            <Route path="control-plane" element={<ControlPlane />} />
            <Route path="maps-3d" element={<Maps3D />} />
            <Route path="crewai" element={<CrewAI />} />
            <Route path="developer" element={<CommandCenter />} />
            <Route path="code-editor" element={<CodeEditorPage />} />
            <Route path="eve" element={<EveFramework />} />
            <Route path="browser" element={<BrowserPage />} />
            <Route path="organization" element={<Organization />} />
          </Route>
        </Routes>
      </NotificationProvider>
    </ErrorBoundary>
  );
}
