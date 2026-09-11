import { lazy } from 'react';
import { createRoot } from 'react-dom/client';
// HashRouter en niet MemoryRouter: met een adresbalk kan elke route
// afzonderlijk geopend worden, en dat is precies wat een rondgang langs
// alle tabs nodig heeft. Dit bestand zit in geen enkele productiebuild.
import { HashRouter, Routes, Route } from 'react-router';
import '@/app/index.css';
import { applyStoredLookEarly } from '@/presentation/hooks/useLook';
import { ErrorBoundary } from '@/presentation/components/shared/ErrorBoundary';
import { NotificationProvider } from '@/presentation/contexts/NotificationContext';
import { AppShell } from '@/presentation/components/layout/AppShell';
const AICore = lazy(() => import('@/presentation/pages/AICore'));
const Agents = lazy(() => import('@/presentation/pages/Agents'));
const AppsPage = lazy(() => import('@/presentation/pages/AppsPage'));
const BrowserPage = lazy(() => import('@/presentation/pages/BrowserPage'));
const CalendarPage = lazy(() => import('@/presentation/pages/CalendarPage'));
const CodeEditorPage = lazy(() => import('@/presentation/pages/CodeEditorPage'));
const CommandCenter = lazy(() => import('@/presentation/pages/CommandCenter'));
const ControlPlane = lazy(() => import('@/presentation/pages/ControlPlane'));
const CrewAI = lazy(() => import('@/presentation/pages/CrewAI'));
const CronManager = lazy(() => import('@/presentation/pages/CronManager'));
const EveFramework = lazy(() => import('@/presentation/pages/EveFramework'));
const Finance = lazy(() => import('@/presentation/pages/Finance'));
const Home = lazy(() => import('@/presentation/pages/Home'));
const Infrastructure = lazy(() => import('@/presentation/pages/Infrastructure'));
const KnowledgeBase = lazy(() => import('@/presentation/pages/KnowledgeBase'));
const MCPCenter = lazy(() => import('@/presentation/pages/MCPCenter'));
const Memory = lazy(() => import('@/presentation/pages/Memory'));
const MemoryHub = lazy(() => import('@/presentation/pages/MemoryHub'));
const MobileSystem = lazy(() => import('@/presentation/pages/MobileSystem'));
const ObsidianMemory = lazy(() => import('@/presentation/pages/ObsidianMemory'));
const Organization = lazy(() => import('@/presentation/pages/Organization'));
const SettingsPageWithAxeQuotes = lazy(() => import('@/presentation/pages/SettingsPageWithAxeQuotes'));
const StatusPage = lazy(() => import('@/presentation/pages/StatusPage'));
const TableEditor = lazy(() => import('@/presentation/pages/TableEditor'));
const Tasks = lazy(() => import('@/presentation/pages/Tasks'));
const TerminalPage = lazy(() => import('@/presentation/pages/TerminalPage'));
const TerminalsPage = lazy(() => import('@/presentation/pages/TerminalsPage'));
const ThinkThanksPage = lazy(() => import('@/presentation/pages/ThinkThanksPage'));
const Trading = lazy(() => import('@/presentation/pages/Trading'));
const TradingIntel = lazy(() => import('@/presentation/pages/TradingIntel'));
const TradingMemory = lazy(() => import('@/presentation/pages/TradingMemory'));

applyStoredLookEarly();

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <NotificationProvider>
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Home />} />
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
              <Route path="terminal" element={<TerminalPage />} />
            <Route path="terminals" element={<TerminalsPage />} />
              <Route path="settings" element={<SettingsPageWithAxeQuotes />} />
              <Route path="table-editor" element={<TableEditor />} />
              <Route path="cron-manager" element={<CronManager />} />
              <Route path="control-plane" element={<ControlPlane />} />
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
        </HashRouter>
    </NotificationProvider>
  </ErrorBoundary>,
);
