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
import { runAxeBootstrap } from '@/application/system/axeBootstrap';
import { showMainWindow } from '@/infrastructure/gateways/tauriShell';
import { stopTTS } from '@/infrastructure/gateways/elevenLabsService';
import '@/domain/tools/registerSmartThingsCatalog';
import Home from '@/presentation/pages/Home';
import AICore from '@/presentation/pages/AICore';
import Agents from '@/presentation/pages/Agents';
import Tasks from '@/presentation/pages/Tasks';
import CalendarPage from '@/presentation/pages/CalendarPage';
import Memory from '@/presentation/pages/Memory';
import MemoryHub from '@/presentation/pages/MemoryHub';
import ObsidianMemory from '@/presentation/pages/ObsidianMemory';
import TradingMemory from '@/presentation/pages/TradingMemory';
import StatusPage from '@/presentation/pages/StatusPage';
import KnowledgeBase from '@/presentation/pages/KnowledgeBase';
import Trading from '@/presentation/pages/Trading';
import TradingIntel from '@/presentation/pages/TradingIntel';
import Finance from '@/presentation/pages/Finance';
import MCPCenter from '@/presentation/pages/MCPCenter';
import Infrastructure from '@/presentation/pages/Infrastructure';
import CommandCenter from '@/presentation/pages/CommandCenter';
import TerminalPage from '@/presentation/pages/TerminalPage';
import SettingsPageWithAxeQuotes from '@/presentation/pages/SettingsPageWithAxeQuotes';
import TableEditor from '@/presentation/pages/TableEditor';
import CronManager from '@/presentation/pages/CronManager';
import ControlPlane from '@/presentation/pages/ControlPlane';
import Maps3D from '@/presentation/pages/Maps3D';
import CrewAI from '@/presentation/pages/CrewAI';
import CodeEditorPage from '@/presentation/pages/CodeEditorPage';
import EveFramework from '@/presentation/pages/EveFramework';
import BrowserPage from '@/presentation/pages/BrowserPage';
import StandaloneBrowserPage from '@/presentation/pages/StandaloneBrowserPage';
import AppsPage from '@/presentation/pages/AppsPage';
import Organization from '@/presentation/pages/Organization';
import ThinkThanksPage from '@/presentation/pages/ThinkThanksPage';
import MobileSystem from '@/presentation/pages/MobileSystem';

const ADMIN_EMAILS = ['lukadezeeuw1994@hotmail.com'];

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, degraded } = useAuth();
  // Rendering null here is what turned an unreachable backend into a black
  // screen with nothing to go on. AuthContext now always resolves `loading`,
  // but this stays visible regardless: a boot state should look like one.
  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000000', color: '#6B7280', fontFamily: 'JetBrains Mono, monospace', gap: 14 }}>
        <div style={{ width: 26, height: 26, border: '2px solid rgba(107,114,128,0.25)', borderTopColor: '#22D3EE', borderRadius: '50%', animation: 'axe-auth-spin 0.9s linear infinite' }} />
        <span style={{ fontSize: 11, letterSpacing: '0.08em' }}>AXE CORE — verbinden…</span>
        <style>{'@keyframes axe-auth-spin{to{transform:rotate(360deg)}}'}</style>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!ADMIN_EMAILS.includes(user.email ?? '')) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000000', color: '#EF4444', fontFamily: 'JetBrains Mono, monospace', gap: 12 }}>
        <span style={{ fontSize: 48 }}>⛔</span>
        <span style={{ fontSize: 14 }}>ACCESS DENIED</span>
        <button onClick={() => { window.location.href = '/login'; }} style={{ marginTop: 8, fontSize: 11, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}>Sign out</button>
      </div>
    );
  }
  return (
    <>
      {/* Say it out loud.
        *
        * Running on a stored session is the right call when the auth server is
        * unreachable, but doing it silently would mean Luka cannot tell why a
        * save failed. The rule in this app is that a degraded state announces
        * itself. */}
      {degraded && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
            background: 'rgba(245,158,11,0.12)',
            borderBottom: '1px solid rgba(245,158,11,0.35)',
            color: '#F59E0B', fontSize: 11, padding: '6px 12px', textAlign: 'center',
          }}
        >
          Supabase is niet bereikbaar — je werkt op je laatste sessie. Opslaan en
          synchroniseren werkt nu niet; alles op de VPS en het lokale model wel.
        </div>
      )}
      {children}
    </>
  );
}

export default function App() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clapEnabled, setClapEnabled] = useState(false);

  useEffect(() => {
    useVoiceStore.getState().loadConversation().catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    runAxeBootstrap();
  }, [user]);

  useKeyboardShortcuts({});

  useEffect(() => {
    if (!user) { setClapEnabled(false); return; }
    loadSetting('axe_clap_activate_enabled', false).then(setClapEnabled);
  }, [user]);

  // 3 claps: stop speaking, show window (if hidden), start listening
  useClapDetector(clapEnabled, () => {
    const voice = useVoiceStore.getState();
    stopTTS();
    void showMainWindow();
    if (voice.voiceStatus === 'listening' || voice.voiceStatus === 'processing') return;
    navigate('/');
    voice.startListening().catch(() => {});
  });

  return (
    <ErrorBoundary>
      <NotificationProvider>
        <Routes>
          {/* Once there is a session — live or restored — the login form is the one
              page that must not stay on screen. Without this, anything that had
              already redirected here stayed here. */}
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
          <Route path="/dev-map-preview" element={<Maps3D />} />
          {/* Standalone desktop browser — no AppShell chrome */}
          <Route path="/browser-desktop" element={<RequireAuth><StandaloneBrowserPage /></RequireAuth>} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route index element={<Home />} />
            {/* The page that answers "what actually works". */}
            <Route path="status" element={<StatusPage />} />
            <Route path="ai-core" element={<AICore />} />
            <Route path="apps" element={<AppsPage />} />
            <Route path="agents" element={<Agents />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="memory" element={<MemoryHub />} />
            <Route path="memory/explore" element={<Memory />} />
            <Route path="memory/trading" element={<TradingMemory />} />
            <Route path="obsidian" element={<ObsidianMemory />} />
            <Route path="knowledge" element={<KnowledgeBase />} />
            <Route path="trading" element={<Trading />} />
            <Route path="trading-intel" element={<TradingIntel />} />
            <Route path="finance" element={<Finance />} />
            <Route path="mcp" element={<MCPCenter />} />
            <Route path="infrastructure" element={<Infrastructure />} />
            {/* /command was a second route onto the same TerminalPage, with no
                entry in navRegistry — reachable only by typing the URL, and
                indistinguishable from /terminal once there. Removed 31-08-2026. */}
            <Route path="terminal" element={<TerminalPage />} />
            <Route path="settings" element={<SettingsPageWithAxeQuotes />} />
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
            <Route path="thinkthanks" element={<ThinkThanksPage />} />
            <Route path="mobile" element={<MobileSystem />} />
          </Route>
        </Routes>
      </NotificationProvider>
    </ErrorBoundary>
  );
}
