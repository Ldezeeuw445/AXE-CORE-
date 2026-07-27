/**
 * windowManagerService — multi-monitor window control for the Tauri desktop app.
 * OPEN_WINDOW tool uses this; web builds report unavailable.
 */

export const OPENABLE_PAGES = [
  'home', 'ai-core', 'apps', 'agents', 'tasks', 'calendar', 'memory', 'obsidian', 'knowledge',
  'trading', 'finance', 'mcp', 'infrastructure', 'command', 'terminal', 'settings',
  'table-editor', 'cron-manager', 'control-plane', 'maps-3d', 'crewai', 'developer',
  'code-editor', 'eve', 'browser', 'organization',
] as const;

export type OpenablePage = typeof OPENABLE_PAGES[number];

export function multiMonitorAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && !!(window as unknown as { __TAURI__?: unknown }).__TAURI__;
  } catch {
    return false;
  }
}

export async function openPageOnMonitor(page: string, monitorIndex: number): Promise<{ monitor: { name: string; width: number; height: number; isPrimary: boolean } }> {
  if (!OPENABLE_PAGES.includes(page as OpenablePage)) {
    throw new Error(`Unknown page "${page}". Valid: ${OPENABLE_PAGES.join(', ')}`);
  }
  // Tauri bridge — real implementation lives in the desktop shell; here we
  // surface a clear error if the invoke isn't present so AXE never fakes success.
  const w = window as unknown as {
    __TAURI__?: { core?: { invoke?: (cmd: string, args: Record<string, unknown>) => Promise<unknown> } };
  };
  const invoke = w.__TAURI__?.core?.invoke;
  if (!invoke) {
    throw new Error('OPEN_WINDOW only works in the Tauri desktop app.');
  }
  const result = await invoke('open_page_on_monitor', { page, monitor: monitorIndex }) as {
    name?: string; width?: number; height?: number; is_primary?: boolean;
  };
  return {
    monitor: {
      name: result?.name ?? `Monitor ${monitorIndex}`,
      width: result?.width ?? 0,
      height: result?.height ?? 0,
      isPrimary: Boolean(result?.is_primary),
    },
  };
}
