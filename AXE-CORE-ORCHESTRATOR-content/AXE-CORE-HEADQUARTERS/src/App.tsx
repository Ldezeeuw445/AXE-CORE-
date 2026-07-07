import { Routes, Route } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
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

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
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
          <Route path="developer" element={<CommandCenter />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
