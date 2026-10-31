/** Always-on floating AXE notch — Mochi-style, flush top of main display. */
import { useEffect } from 'react';
import { AxeOverlayNotch } from '@/presentation/components/overlay/AxeOverlayNotch';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

/** Default notch width — wider than the old 440 pill; expands drops down from y=0. */
const NOTCH_W = 560;
const COLLAPSED_H = 54;
const EXPANDED_H = 560;

/** Dock window flush to the top edge of the primary display, horizontally centered. */
async function dockTop(open: boolean) {
  if (!isTauriRuntime()) return;
  try {
    const { getCurrentWindow, primaryMonitor, currentMonitor } = await import('@tauri-apps/api/window');
    const { LogicalSize, LogicalPosition } = await import('@tauri-apps/api/dpi');
    const w = getCurrentWindow();
    const height = open ? EXPANDED_H : COLLAPSED_H;
    const width = NOTCH_W;
    await w.setSize(new LogicalSize(width, height));
    try {
      const mon = (await primaryMonitor()) || (await currentMonitor());
      if (!mon) return;
      const scale = mon.scaleFactor || 1;
      const screenW = mon.size.width / scale;
      const screenX = mon.position.x / scale;
      const screenY = mon.position.y / scale;
      // Flush top (y=0 of monitor) — expanded grows downward; never park at y=72.
      const nx = screenX + (screenW - width) / 2;
      const ny = screenY;
      await w.setPosition(new LogicalPosition(nx, ny));
      await w.setAlwaysOnTop(true);
    } catch { /* position best-effort */ }
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
    // Always re-dock at top (ignore stale localStorage frames that parked at y=72).
    void dockTop(window.innerHeight > 120);
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
