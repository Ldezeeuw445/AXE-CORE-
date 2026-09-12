/**
 * Alle desktop-tabs, in dezelfde volgorde als de onderbalk, zodat de
 * device manager niets mist dat op de Mac bestaat. Een tab toevoegen aan
 * BottomNav zonder hem hier te zetten laat de test falen.
 */
export type TabGroep = 'work' | 'memory' | 'wire' | 'run' | 'trade' | 'build';

export interface DeviceTab {
  path: string;
  label: string;
  groep: TabGroep;
}

export const TAB_GROEPEN: readonly { id: TabGroep; label: string }[] = [
  { id: 'work', label: 'Work' },
  { id: 'memory', label: 'Memory' },
  { id: 'wire', label: 'Wire' },
  { id: 'run', label: 'Run' },
  { id: 'trade', label: 'Trade' },
  { id: 'build', label: 'Build' },
];

export const DEVICE_TABS: readonly DeviceTab[] = [
  { path: '/', label: 'Home', groep: 'work' },
  { path: '/thinkthanks', label: 'Think', groep: 'work' },
  { path: '/apps', label: 'Apps', groep: 'work' },
  { path: '/ai-core', label: 'AI Core', groep: 'work' },
  { path: '/memory', label: 'Memory', groep: 'memory' },
  { path: '/obsidian', label: 'Obsidian', groep: 'memory' },
  { path: '/knowledge', label: 'Knowledge', groep: 'memory' },
  { path: '/mcp', label: 'MCP', groep: 'wire' },
  { path: '/infrastructure', label: 'Infra', groep: 'wire' },
  { path: '/control-plane', label: 'Control', groep: 'wire' },
  { path: '/table-editor', label: 'Tables', groep: 'wire' },
  { path: '/cron-manager', label: 'Cron', groep: 'wire' },
  { path: '/browser', label: 'Browser', groep: 'run' },
  { path: '/agents', label: 'Agents', groep: 'run' },
  { path: '/crewai', label: 'Crew', groep: 'run' },
  { path: '/calendar', label: 'Calendar', groep: 'run' },
  { path: '/tasks', label: 'Tasks', groep: 'run' },
  { path: '/finance', label: 'Finance', groep: 'trade' },
  { path: '/trading-intel', label: 'Trading', groep: 'trade' },
  { path: '/maps-3d', label: 'Maps', groep: 'build' },
  { path: '/code-editor', label: 'Code', groep: 'build' },
  { path: '/terminals', label: 'Terminals', groep: 'build' },
  { path: '/eve', label: 'Eve', groep: 'build' },
  { path: '/settings', label: 'Settings', groep: 'build' },
];

export const DEVICE_TAB_PADEN: readonly string[] = DEVICE_TABS.map((t) => t.path);

/** Tabs per groep, lege groepen eruit. Los van React zodat de test hem kent. */
export function groepeerTabs(tabs: readonly DeviceTab[] = DEVICE_TABS) {
  return TAB_GROEPEN
    .map((g) => ({ ...g, tabs: tabs.filter((t) => t.groep === g.id) }))
    .filter((g) => g.tabs.length > 0);
}

/** Filter op label of pad. Leeg zoeken is alles. */
export function zoekTabs(q: string, tabs: readonly DeviceTab[] = DEVICE_TABS): DeviceTab[] {
  const n = q.trim().toLowerCase();
  if (!n) return [...tabs];
  return tabs.filter((t) => t.label.toLowerCase().includes(n) || t.path.toLowerCase().includes(n));
}
