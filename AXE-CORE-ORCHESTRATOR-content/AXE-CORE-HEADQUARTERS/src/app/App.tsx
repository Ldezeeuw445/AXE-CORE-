import { lazy, useEffect, useState } from 'react';
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
import { showMainWindow } from '@/infrastructure/gateways/tauriShell';
import { isIngebed } from '@/presentation/components/layout/zweef/ingebed';
import { stopTTS } from '@/infrastructure/gateways/elevenLabsService';
import '@/domain/tools/registerSmartThingsCatalog';
import Home from '@/presentation/pages/Home';
const AICore = lazy(() => import('@/presentation/pages/AICore'));
const Agents = lazy(() => import('@/presentation/pages/Agents'));
const Tasks = lazy(() => import('@/presentation/pages/Tasks'));
const CalendarPage = lazy(() => import('@/presentation/pages/CalendarPage'));
const Memory = lazy(() => import('@/presentation/pages/Memory'));
const MemoryHub = lazy(() => import('@/presentation/pages/MemoryHub'));
const ObsidianMemory = lazy(() => import('@/presentation/pages/ObsidianMemory'));
const TradingMemory = lazy(() => import('@/presentation/pages/TradingMemory'));
const StatusPage = lazy(() => import('@/presentation/pages/StatusPage'));
const KnowledgeBase = lazy(() => import('@/presentation/pages/KnowledgeBase'));
const Trading = lazy(() => import('@/presentation/pages/Trading'));
const TradingIntel = lazy(() => import('@/presentation/pages/TradingIntel'));
const Finance = lazy(() => import('@/presentation/pages/Finance'));
const MCPCenter = lazy(() => import('@/presentation/pages/MCPCenter'));
const Infrastructure = lazy(() => import('@/presentation/pages/Infrastructure'));
const CommandCenter = lazy(() => import('@/presentation/pages/CommandCenter'));
const TerminalPage = lazy(() => import('@/presentation/pages/TerminalPage'));
const TerminalsPage = lazy(() => import('@/presentation/pages/TerminalsPage'));
const SettingsPageWithAxeQuotes = lazy(() => import('@/presentation/pages/SettingsPageWithAxeQuotes'));
const TableEditor = lazy(() => import('@/presentation/pages/TableEditor'));
const CronManager = lazy(() => import('@/presentation/pages/CronManager'));
const ControlPlane = lazy(() => import('@/presentation/pages/ControlPlane'));
const Maps3D = lazy(() => import('@/presentation/pages/Maps3D'));
const CrewAI = lazy(() => import('@/presentation/pages/CrewAI'));
const CodeEditorPage = lazy(() => import('@/presentation/pages/CodeEditorPage'));
const EveFramework = lazy(() => import('@/presentation/pages/EveFramework'));
const BrowserPage = lazy(() => import('@/presentation/pages/BrowserPage'));
import StandaloneBrowserPage from '@/presentation/pages/StandaloneBrowserPage';
import { ontwerpModus, zaaiOntwerpOpslag } from '@/infrastructure/supabase/ontwerpModus';
const AppsPage = lazy(() => import('@/presentation/pages/AppsPage'));
const Organization = lazy(() => import('@/presentation/pages/Organization'));
const ThinkThanksPage = lazy(() => import('@/presentation/pages/ThinkThanksPage'));
const MobileSystem = lazy(() => import('@/presentation/pages/MobileSystem'));

const ADMIN_EMAILS = ['lukadezeeuw1994@hotmail.com'];

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, degraded } = useAuth();
  if (ontwerpModus()) {
    // Ook de opslag vullen, niet alleen de database: EVE en de modelkiezer
    // lezen hun providers uit localStorage en zouden anders leeg blijven --
    // leegte die alleen hier bestaat en niet in de echte app.
    zaaiOntwerpOpslag();
    return <>{children}</>;
  }
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
          Supabase is unreachable — you are working from your last session. Saving and
          syncing are off right now; everything on the VPS and the local model still works.
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

  /**
   * De opstartroutine wordt PAS ingeladen als er iemand is ingelogd.
   *
   * Hij werd hier al na de login aangeroepen, maar stond boven statisch
   * geïmporteerd -- en dan zit hij gewoon in de eerste brok. Achter die ene
   * import hangt de halve applicatielaag: obsidian-sync, de trading-autopilot,
   * de geheugenbeheerder, elke gateway daaronder. Dat werd allemaal gelezen en
   * uitgevoerd vóór de eerste pixel, terwijl het pas seconden later nodig is.
   *
   * Gemeten voor deze wijziging: index-*.js was 2.267 kB (719 kB gzip).
   *
   * Bewust geen `void` op de import zonder vangnet: mislukt hij, dan hoort dat
   * in de console te staan en niet als stille niet-gestarte achtergrondlus te
   * eindigen waarbij je je een week afvraagt waarom je geheugen niet bijwerkt.
   *
   * Niet in een iframe. De telefoon op Home laadt deze app op #/mobile; die
   * kopie hoort te tonen, niet te werken: de trading-autopilot, de
   * geheugenbeheerder en de vault-sync bewaken zichzelf per venster, dus twee
   * vensters is twee keer draaien. Eén opstartroutine, in het bovenste venster.
   */
  useEffect(() => {
    if (!user || isIngebed()) return;
    import('@/application/system/axeBootstrap')
      .then(({ runAxeBootstrap }) => runAxeBootstrap())
      .catch((e) => console.error('[AXE] opstartroutine niet geladen', e));
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
          <Route path="/dev-browser-preview" element={<div className="h-[100dvh] w-full overflow-hidden"><BrowserPage /></div>} />
          {/* Standalone desktop browser — no AppShell chrome */}
          <Route path="/dev-browser-standalone" element={<StandaloneBrowserPage />} />
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
            <Route path="terminals" element={<TerminalsPage />} />
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
