/** Always-on floating AXE notch — Mochi-style, flush top of main display. */
import { useEffect } from 'react';
import { AxeOverlayNotch } from '@/presentation/components/overlay/AxeOverlayNotch';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

/** Collapsed: ~34% of primary width (min 720), ~80px tall. Expanded: same width, taller panel. */
const WIDTH_FRAC = 0.34;
const MIN_W = 720;
const COLLAPSED_H = 80;
const BASE_W = 560;
const BASE_H = 54;

export type NotchMetrics = { w: number; collapsedH: number; expandedH: number; uiScale: number };

function metricsForScreen(screenW: number, screenH: number): NotchMetrics {
  const w = Math.max(MIN_W, Math.round(screenW * WIDTH_FRAC));
  const collapsedH = COLLAPSED_H;
  // Expanded drops down — ~42% of screen height, at least as tall as width*0.7
  const expandedH = Math.max(Math.round(w * 0.7), Math.round(screenH * 0.42), 720);
  const uiScale = collapsedH / BASE_H;
  return { w, collapsedH, expandedH, uiScale };
}

const FALLBACK: NotchMetrics = metricsForScreen(1920, 1080);

let cached: NotchMetrics = FALLBACK;

function applyCssVars(m: NotchMetrics) {
  const root = document.documentElement;
  root.style.setProperty('--axe-notch-w', `${m.w}px`);
  root.style.setProperty('--axe-notch-h', `${m.collapsedH}px`);
  root.style.setProperty('--axe-notch-scale', String(m.uiScale));
}

async function readMetrics(): Promise<NotchMetrics> {
  if (!isTauriRuntime()) {
    const w = typeof window !== 'undefined' ? window.screen.width : 1920;
    const h = typeof window !== 'undefined' ? window.screen.height : 1080;
    cached = metricsForScreen(w, h);
    applyCssVars(cached);
    return cached;
  }
  try {
    const { primaryMonitor, currentMonitor } = await import('@tauri-apps/api/window');
    const mon = (await primaryMonitor()) || (await currentMonitor());
    if (!mon) return cached;
    const scale = mon.scaleFactor || 1;
    const screenW = mon.size.width / scale;
    const screenH = mon.size.height / scale;
    cached = metricsForScreen(screenW, screenH);
    applyCssVars(cached);
    return cached;
  } catch {
    return cached;
  }
}

/** Dock window flush to the top edge of the primary display, horizontally centered. */
async function dockTop(open: boolean) {
  if (!isTauriRuntime()) return;
  try {
    const { getCurrentWindow, primaryMonitor, currentMonitor } = await import('@tauri-apps/api/window');
    const { LogicalSize } = await import('@tauri-apps/api/dpi');
    const { invoke } = await import('@tauri-apps/api/core');
    const m = await readMetrics();
    const w = getCurrentWindow();
    const height = open ? m.expandedH : m.collapsedH;
    const width = m.w;
    const mon = (await primaryMonitor()) || (await currentMonitor());
    if (!mon) {
      await w.setSize(new LogicalSize(width, height));
      return;
    }
    const scale = mon.scaleFactor || 1;
    const screenW = mon.size.width / scale;
    const screenX = mon.position.x / scale;
    const screenY = mon.position.y / scale;
    const nx = screenX + (screenW - width) / 2;
    const ny = screenY;
    try {
      await invoke('dock_notch_frame', { x: nx, y: ny, w: width, h: height });
    } catch {
      await w.setSize(new LogicalSize(width, height));
      const { PhysicalPosition } = await import('@tauri-apps/api/dpi');
      const physW = width * scale;
      await w.setPosition(new PhysicalPosition(
        mon.position.x + (mon.size.width - physW) / 2,
        mon.position.y,
      ));
    }
    await w.setAlwaysOnTop(true);
  } catch { /* preview browser */ }
}

/** Poll Hammerspoon IPC (~/.axe/overlay.cmd) → CustomEvent for AxeOverlayNotch. */
function useOverlayCmdBridge() {
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let stopped = false;
    const vaultRoot = '/Users/luka/.axe';
    const tick = async () => {
      if (stopped) return;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const raw = await invoke<string>('read_vault_file', {
          vaultRoot,
          relativePath: 'overlay.cmd',
        }).catch(() => '');
        if (!raw || !raw.trim()) return;
        await invoke('write_vault_file', {
          vaultRoot,
          relativePath: 'overlay.cmd',
          content: '',
        }).catch(() => undefined);
        for (const line of raw.split('\n')) {
          const cmd = line.trim();
          if (!cmd) continue;
          if (cmd === 'collapse') void dockTop(false);
          else if (cmd === 'expand' || cmd === 'chat' || cmd === 'approvals') void dockTop(true);
          window.dispatchEvent(new CustomEvent('axe-overlay-cmd', { detail: cmd }));
        }
      } catch { /* ignore */ }
    };
    const id = window.setInterval(() => { void tick(); }, 300);
    void tick();
    return () => { stopped = true; window.clearInterval(id); };
  }, []);
}

export default function FloatAxe() {
  useOverlayCmdBridge();

  useEffect(() => {
    const prev = [document.documentElement.style.background, document.body.style.background];
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    document.body.style.margin = '0';
    void (async () => {
      await readMetrics();
      void dockTop(window.innerHeight > 120);
    })();
    return () => {
      document.documentElement.style.background = prev[0];
      document.body.style.background = prev[1];
    };
  }, []);

  return (
    <div style={{ padding: 0, background: 'transparent', height: '100vh', boxSizing: 'border-box' }}>
      <AxeOverlayNotch
        onHome={() => { void dockTop(false); }}
        onOpenChange={(open) => { void dockTop(open); }}
      />
    </div>
  );
}
