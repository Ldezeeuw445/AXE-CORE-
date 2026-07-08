import { Routes, Route, Navigate } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import LoginPage from '@/pages/LoginPage';
import { useAuth } from '@/contexts/AuthContext';
import Home from '@/pages/Home';
import Organization from '@/pages/Organization';
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
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<Home />} />
          <Route path="organization" element={<Organization />} />
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
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
