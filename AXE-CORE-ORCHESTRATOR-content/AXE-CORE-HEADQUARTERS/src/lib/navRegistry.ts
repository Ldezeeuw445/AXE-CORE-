/* ══════════════════════════════════════════════════════════════════════════
   NAV REGISTRY — single source of truth for tab/app names & routes.
   Used by BottomNav (rendering) and chatActionService (chat-driven navigation)
   so both always agree on what a tab is called and where it lives.

   Scope note: the Runtime workspace (RuntimeCanvas.tsx, fed by
   systemRegistryService.loadAxeOrganization) renders a different concept —
   the AXE ecosystem's org tree, including sibling *products* like
   "AXE Companion" and "AXE Intel" that are separate apps/repos, not tabs
   inside this HQ app. Those nodes intentionally have no entry here. Where a
   Runtime node *does* correspond to an in-app tab (e.g. "Trading OS" ->
   /trading), its Runtime label is listed as a keyword alias below so chat
   still resolves it. Don't merge the two registries — they answer different
   questions ("what tab is this" vs "what does the AXE org look like") and
   collapsing them would force product-identity nodes to fake a route, or
   in-app-only tabs (Terminal, Cron Manager, etc.) to fake an org node.
   ══════════════════════════════════════════════════════════════════════════ */

export interface NavItem {
  path: string;
  label: string;
  /** Extra words/phrases (lowercase) that identify this tab in natural language. */
  keywords: string[];
  /**
   * When set, this tab hosts individual records that chat can deep-link
   * into (e.g. "open task X", "open document Y", "open cron job Z")
   * instead of just opening the tab. See `resolveRecordDeepLink` in
   * chatActionService.ts for the lookup logic per record type.
   */
  recordType?: 'task' | 'agent' | 'memory' | 'document' | 'cron';
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Home', keywords: ['home', 'dashboard', 'main screen', 'main view'] },
  { path: '/ai-core', label: 'AI Core', keywords: ['ai core', 'core'] },
  { path: '/memory', label: 'Memory', keywords: ['memory', 'memories'], recordType: 'memory' },
  { path: '/knowledge', label: 'Knowledge Base', keywords: ['knowledge base', 'knowledge', 'kb', 'docs', 'document', 'documents'], recordType: 'document' },
  { path: '/mcp', label: 'MCP', keywords: ['mcp', 'mcp center'] },
  { path: '/infrastructure', label: 'Infrastructure', keywords: ['infrastructure', 'infra', 'servers'] },
  { path: '/control-plane', label: 'Control Plane', keywords: ['control plane'] },
  { path: '/table-editor', label: 'Table Editor', keywords: ['table editor', 'tables', 'database editor'] },
  { path: '/cron-manager', label: 'Cron Manager', keywords: ['cron manager', 'cron', 'scheduler', 'cron jobs', 'workflow', 'workflows'], recordType: 'cron' },
  { path: '/agents', label: 'Agents', keywords: ['agents', 'agent'], recordType: 'agent' },
  { path: '/crewai', label: 'CrewAI', keywords: ['crewai', 'crew ai', 'crew'] },
  { path: '/calendar', label: 'Calendar', keywords: ['calendar', 'agenda'] },
  { path: '/tasks', label: 'Tasks', keywords: ['tasks', 'todo', 'to-do', 'task'], recordType: 'task' },
  { path: '/finance', label: 'Finance', keywords: ['finance', 'financien', 'budget', 'money'] },
  { path: '/trading', label: 'Trading', keywords: ['trading', 'trade', 'trades', 'markets', 'trading os'] },
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

/* ── Runtime org-tree node -> in-app tab route ──────────────────────────────
   A small, explicit lookup for the handful of Runtime workspace nodes
   (systemRegistryService.OrganizationNode.id) that correspond to a real tab
   in this app. Most Runtime nodes (providers, models, tools, MCP servers,
   AXE Companion, AXE Intel, ...) have no in-app route and intentionally have
   no entry here — the Runtime inspector only shows "Open tab" when a match
   exists. Keep this separate from NAV_ITEMS: it maps org-tree ids, not nav
   labels/keywords, and only needs entries where the mapping is real. */
const RUNTIME_NODE_ROUTES: Record<string, string> = {
  'applications:trading-os': '/trading',
};

export function findRouteForRuntimeNodeId(nodeId: string): string | undefined {
  return RUNTIME_NODE_ROUTES[nodeId];
}
