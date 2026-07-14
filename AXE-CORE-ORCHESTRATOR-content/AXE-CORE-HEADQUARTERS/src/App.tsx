import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useClapDetector, type ClapCallbacks } from '@/hooks/useClapDetector';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import LoginPage from '@/pages/LoginPage';
import { useAuth } from '@/contexts/AuthContext';
import { useVoiceStore } from '@/store/voiceStore';
import { loadSetting } from '@/services/userSettingsService';
import { NotificationProvider } from '@/contexts/NotificationContext';
import Home from '@/pages/Home';
import AICore from '@/pages/AICore';
import Agents from '@/pages/Agents';
import Tasks from '@/pages/Tasks';
import CalendarPage from '@/pages/CalendarPage';
import Memory from '@/pages/Memory';
import KnowledgeBase from '@/pages/KnowledgeBase';
import Trading from '@/pages/Trading';
import Finance from '@/pages/Finance';
import MCPCenter from '@/pages/MCPCenter';
import Infrastructure from '@/pages/Infrastructure';
import CommandCenter from '@/pages/CommandCenter';
import TerminalPage from '@/pages/TerminalPage';
import SettingsPage from '@/pages/SettingsPage';
import TableEditor from '@/pages/TableEditor';
import CronManager from '@/pages/CronManager';
import ControlPlane from '@/pages/ControlPlane';
import Maps3D from '@/pages/Maps3D';
import CrewAI from '@/pages/CrewAI';
import CodeEditorPage from '@/pages/CodeEditorPage';
import EveFramework from '@/pages/EveFramework';

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
  const [clapCount, setClapCount] = useState(0);
  const [showClapIndicator, setShowClapIndicator] = useState(false);

  // Reload persisted chat history from Supabase (or localStorage fallback) on first mount (survives refresh).
  useEffect(() => {
    if (!user) return;
    useVoiceStore.getState().loadConversation().catch(() => {});
  }, [user]);

  // Global keyboard shortcuts (CMD/Ctrl + letter = tab navigation)
  useKeyboardShortcuts({});

  // "Clap to activate" — opt-in setting, only armed once logged in.
  useEffect(() => {
    if (!user) { setClapEnabled(false); return; }
    loadSetting('axe_clap_activate_enabled', false).then(setClapEnabled);
  }, [user]);

  // Clap visual indicator timeout
  useEffect(() => {
    if (clapCount <= 0) return undefined;
    setShowClapIndicator(true);
    const timer = setTimeout(() => { setShowClapIndicator(false); setClapCount(0); }, 1200);
    return () => clearTimeout(timer);
  }, [clapCount]);

  const clapCallbacks: ClapCallbacks = {
    onClapCount: (count: number) => setClapCount(count),
    onClapTrigger: () => {
      setClapCount(0);
      setShowClapIndicator(false);
      const voice = useVoiceStore.getState();
      if (voice.voiceStatus === 'listening' || voice.voiceStatus === 'processing') return;
      navigate('/');
      voice.startListening().catch(() => {});
    },
  };

  useClapDetector(clapEnabled, clapCallbacks);

  return (
    <>
      {/* ── Clap Visual Indicator ── */}
      {showClapIndicator && clapCount > 0 && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 9999,
          background: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            animation: 'fadeIn 0.15s ease',
          }}>
            {/* Pulse rings */}
            <div style={{ position: 'relative', width: 120, height: 120 }}>
              {[...Array(clapCount)].map((_, i) => (
                <div key={i} style={{
                  position: 'absolute', top: '50%', left: '50%',
                  width: 60 + i * 30, height: 60 + i * 30,
                  marginLeft: -(30 + i * 15), marginTop: -(30 + i * 15),
                  borderRadius: '50%',
                  border: '2px solid var(--accent-cyan)',
                  animation: `pulseRing 0.6s ease ${i * 0.1}s`,
                  opacity: 0.8 - i * 0.2,
                }} />
              ))}
              {/* Center icon */}
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 56, height: 56, borderRadius: '50%',
                background: 'var(--accent-cyan)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 30px rgba(34,211,238,0.5)',
              }}>
                <span style={{ fontSize: 28 }}>👏</span>
              </div>
            </div>
            {/* Count text */}
            <div style={{
              fontSize: 18, fontWeight: 600, color: 'var(--text-primary)',
              textShadow: '0 2px 10px rgba(0,0,0,0.5)',
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              {clapCount === 1 ? '1 clap...' : `${clapCount} claps!`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {clapCount >= 2 ? 'AXE is waking up!' : 'Keep clapping...'}
            </div>
          </div>
        </div>
      )}

      <ErrorBoundary>
      <NotificationProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route index element={<Home />} />
            <Route path="ai-core" element={<AICore />} />
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
          </Route>
        </Routes>
      </NotificationProvider>
    </ErrorBoundary>
  </>);
}
