import type { ReactElement } from 'react';
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
import BrowserPage from '@/pages/BrowserPage';
import AppsPage from '@/pages/AppsPage';
import Organization from '@/pages/Organization';

export interface AppRoute {
  /** Route path relative to the authenticated shell; undefined = index route. */
  path?: string;
  element: ReactElement;
}

/**
 * Single registry of all authenticated routes. Adding a screen means adding
 * one entry here — App.tsx and the shell never need to change.
 */
export const shellRoutes: AppRoute[] = [
  { element: <Home /> },
  { path: 'ai-core', element: <AICore /> },
  { path: 'apps', element: <AppsPage /> },
  { path: 'agents', element: <Agents /> },
  { path: 'tasks', element: <Tasks /> },
  { path: 'calendar', element: <CalendarPage /> },
  { path: 'memory', element: <Memory /> },
  { path: 'knowledge', element: <KnowledgeBase /> },
  { path: 'trading', element: <Trading /> },
  { path: 'finance', element: <Finance /> },
  { path: 'mcp', element: <MCPCenter /> },
  { path: 'infrastructure', element: <Infrastructure /> },
  { path: 'command', element: <TerminalPage /> },
  { path: 'terminal', element: <TerminalPage /> },
  { path: 'settings', element: <SettingsPage /> },
  { path: 'table-editor', element: <TableEditor /> },
  { path: 'cron-manager', element: <CronManager /> },
  { path: 'control-plane', element: <ControlPlane /> },
  { path: 'maps-3d', element: <Maps3D /> },
  { path: 'crewai', element: <CrewAI /> },
  { path: 'developer', element: <CommandCenter /> },
  { path: 'code-editor', element: <CodeEditorPage /> },
  { path: 'eve', element: <EveFramework /> },
  { path: 'browser', element: <BrowserPage /> },
  { path: 'organization', element: <Organization /> },
];
