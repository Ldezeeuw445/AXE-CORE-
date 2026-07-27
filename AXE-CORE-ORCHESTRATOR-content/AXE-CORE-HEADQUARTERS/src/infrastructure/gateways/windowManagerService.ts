/**
 * Multi-monitor window management — Tauri only. Lets AXE (or the user) open
 * any app route in its own OS window, positioned on a specific connected
 * display. A plain web page can never enumerate monitors or place a window
 * on one (browser sandboxing); Tauri's window/monitor API can, so this
 * module only does anything inside a packaged/dev Tauri shell.
 *
 * See NEXT_LEVEL_PLAN.md section 7 for the design this implements.
 */
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

export interface MonitorInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

const LAYOUT_KEY = 'axe_window_layout_v1';

interface SavedLayoutEntry { page: string; monitorIndex: number }

function loadLayout(): SavedLayoutEntry[] {
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '[]'); } catch { return []; }
}

function saveLayoutEntry(page: string, monitorIndex: number): void {
  const layout = loadLayout().filter(e => e.page !== page);
  layout.push({ page, monitorIndex });
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

export function multiMonitorAvailable(): boolean {
  return isTauriRuntime();
}

/** Lists every connected display, in a stable left-to-right order (by x
 *  position) so "second screen" means the same thing call to call. */
export async function listMonitors(): Promise<MonitorInfo[]> {
  if (!isTauriRuntime()) return [];
  const { availableMonitors, primaryMonitor } = await import('@tauri-apps/api/window');
  const [monitors, primary] = await Promise.all([availableMonitors(), primaryMonitor()]);
  return monitors
    .map(m => ({ m, x: m.position.x }))
    .sort((a, b) => a.x - b.x)
    .map(({ m }, i) => ({
      index: i,
      name: m.name ?? `Display ${i + 1}`,
      width: m.size.width,
      height: m.size.height,
      isPrimary: primary != null && m.position.x === primary.position.x && m.position.y === primary.position.y,
    }));
}

/** Known app routes AXE is allowed to open in a new window — mirrors the
 *  <Route path="..."> list in src/app/App.tsx. Keeping an explicit allowlist
 *  (rather than accepting any string) means a malformed/hallucinated page
 *  name fails loudly instead of opening a blank or wrong window. */
export const OPENABLE_PAGES = [
  'home', 'ai-core', 'apps', 'agents', 'tasks', 'calendar', 'memory', 'obsidian', 'knowledge',
  'trading', 'finance', 'mcp', 'infrastructure', 'command', 'terminal', 'settings',
  'table-editor', 'cron-manager', 'control-plane', 'maps-3d', 'crewai', 'developer',
  'code-editor', 'eve', 'browser', 'organization',
] as const;
export type OpenablePage = typeof OPENABLE_PAGES[number];

/** Opens (or refocuses, if already open) `page` in its own OS window on the
 *  given monitor index (from listMonitors()). Remembers the choice so the
 *  next app launch can restore it (see restoreWindowLayout()). */
export async function openPageOnMonitor(page: string, monitorIndex: number): Promise<{ monitor: MonitorInfo }> {
  if (!isTauriRuntime()) throw new Error('Multi-window is only available in the AXE CORE desktop app, not the web version.');
  if (!(OPENABLE_PAGES as readonly string[]).includes(page)) {
    throw new Error(`Unknown page "${page}". Valid pages: ${OPENABLE_PAGES.join(', ')}`);
  }
  const monitors = await listMonitors();
  const monitor = monitors[monitorIndex];
  if (!monitor) throw new Error(`No monitor at index ${monitorIndex}. ${monitors.length} connected (0-${monitors.length - 1}).`);

  const { availableMonitors } = await import('@tauri-apps/api/window');
  const rawMonitors = await availableMonitors();
  const rawSorted = rawMonitors.map(m => m).sort((a, b) => a.position.x - b.position.x);
  const raw = rawSorted[monitorIndex];
  const scale = raw.scaleFactor;

  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const label = `axe-${page}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus();
    saveLayoutEntry(page, monitorIndex);
    return { monitor };
  }

  // HashRouter (see src/app/main.tsx) — routes live at #/page, not /page.
  const win = new WebviewWindow(label, {
    url: `index.html#/${page === 'home' ? '' : page}`,
    title: `AXE CORE — ${page}`,
    x: raw.position.x / scale,
    y: raw.position.y / scale,
    width: Math.min(1440, raw.size.width / scale),
    height: Math.min(900, raw.size.height / scale),
    theme: 'dark',
  });
  await new Promise<void>((resolve, reject) => {
    win.once('tauri://created', () => resolve());
    win.once('tauri://error', (e) => reject(new Error(String(e.payload))));
  });
  saveLayoutEntry(page, monitorIndex);
  return { monitor };
}

/** Reopens every window from the last saved layout — call once on app
 *  startup (main window only, guarded by isTauriRuntime internally). */
export async function restoreWindowLayout(): Promise<void> {
  if (!isTauriRuntime()) return;
  const layout = loadLayout();
  for (const entry of layout) {
    try { await openPageOnMonitor(entry.page, entry.monitorIndex); } catch { /* stale monitor index — skip */ }
  }
}
