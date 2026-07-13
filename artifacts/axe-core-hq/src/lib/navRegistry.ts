/* ══════════════════════════════════════════════════════════════════════════
   NAV REGISTRY — single source of truth for tab/app names & routes.
   Used by BottomNav (rendering) and chatActionService (chat-driven navigation)
   so both always agree on what a tab is called and where it lives. Any
   future Runtime workspace visualization should reuse this list too, rather
   than inventing a second naming scheme.
   ══════════════════════════════════════════════════════════════════════════ */

export interface NavItem {
  path: string;
  label: string;
  /** Extra words/phrases (lowercase) that identify this tab in natural language. */
  keywords: string[];
  /**
   * When set, this tab hosts individual records that chat can deep-link
   * into (e.g. "open task X") instead of just opening the tab. See
   * `resolveRecordDeepLink` in chatActionService.ts for the lookup logic
   * per record type.
   */
  recordType?: 'task' | 'agent' | 'memory';
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Home', keywords: ['home', 'dashboard', 'main screen', 'main view'] },
  { path: '/ai-core', label: 'AI Core', keywords: ['ai core', 'core'] },
  { path: '/memory', label: 'Memory', keywords: ['memory', 'memories'], recordType: 'memory' },
  { path: '/knowledge', label: 'Knowledge Base', keywords: ['knowledge base', 'knowledge', 'kb', 'docs'] },
  { path: '/mcp', label: 'MCP', keywords: ['mcp', 'mcp center'] },
  { path: '/infrastructure', label: 'Infrastructure', keywords: ['infrastructure', 'infra', 'servers'] },
  { path: '/control-plane', label: 'Control Plane', keywords: ['control plane'] },
  { path: '/table-editor', label: 'Table Editor', keywords: ['table editor', 'tables', 'database editor'] },
  { path: '/cron-manager', label: 'Cron Manager', keywords: ['cron manager', 'cron', 'scheduler', 'cron jobs'] },
  { path: '/agents', label: 'Agents', keywords: ['agents', 'agent'], recordType: 'agent' },
  { path: '/crewai', label: 'CrewAI', keywords: ['crewai', 'crew ai', 'crew'] },
  { path: '/calendar', label: 'Calendar', keywords: ['calendar', 'agenda'] },
  { path: '/tasks', label: 'Tasks', keywords: ['tasks', 'todo', 'to-do', 'task'], recordType: 'task' },
  { path: '/finance', label: 'Finance', keywords: ['finance', 'financien', 'budget', 'money'] },
  { path: '/trading', label: 'Trading', keywords: ['trading', 'trade', 'trades', 'markets'] },
  { path: '/maps-3d', label: '3D Maps', keywords: ['3d maps', 'maps', 'map'] },
  { path: '/code-editor', label: 'Code Editor', keywords: ['code editor', 'code', 'editor'] },
  { path: '/eve', label: 'EVE', keywords: ['eve'] },
  { path: '/terminal', label: 'Terminal', keywords: ['terminal', 'console', 'shell', 'command line'] },
  { path: '/developer', label: 'Command Center', keywords: ['command center', 'developer', 'dev tools', 'developer tools'] },
  { path: '/settings', label: 'Settings', keywords: ['settings', 'preferences', 'configuration'] },
];

export function findNavItemByPath(path: string): NavItem | undefined {
  return NAV_ITEMS.find(i => i.path === path);
}
