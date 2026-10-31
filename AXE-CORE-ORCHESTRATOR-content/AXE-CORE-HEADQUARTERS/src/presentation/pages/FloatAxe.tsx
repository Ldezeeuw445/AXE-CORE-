/** Always-on floating AXE notch (louis_rlee) — eigen Tauri-venster via zwevendeVensters type `axe`. */
import { useEffect } from 'react';
import { AxeOverlayNotch } from '@/presentation/components/overlay/AxeOverlayNotch';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

async function resizeFor(open: boolean) {
  if (!isTauriRuntime()) return;
  try {
    const { getCurrentWindow, currentMonitor } = await import('@tauri-apps/api/window');
    const { LogicalSize, LogicalPosition } = await import('@tauri-apps/api/dpi');
    const w = getCurrentWindow();
    const height = open ? 560 : 54;
    const width = 440;
    await w.setSize(new LogicalSize(width, height));
    if (open) {
      try {
        const { availableMonitors } = await import('@tauri-apps/api/window');
        const pos = await w.outerPosition();
        const mons = await availableMonitors();
        // Pick the monitor that contains the window center (fallback: first)
        const cx = pos.x + 20;
        const cy = pos.y + 10;
        let mon = mons.find((m) => {
          const x = m.position.x, y = m.position.y, w = m.size.width, h = m.size.height;
          return cx >= x && cx < x + w && cy >= y && cy < y + h;
        }) || mons[0] || await currentMonitor();
        if (!mon) return;
        const scale = mon.scaleFactor || 1;
        const screenW = mon.size.width / scale;
        const screenX = mon.position.x / scale;
        const screenY = mon.position.y / scale;
        // Always park expanded notch near the top so the body is visible
        const nx = Math.min(Math.max(pos.x / scale, screenX + 24), screenX + screenW - width - 24);
        const ny = screenY + 72;
        await w.setPosition(new LogicalPosition(nx, ny));
      } catch { /* position best-effort */ }
    }
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
    void resizeFor(window.innerHeight > 120);
    return () => {
      document.documentElement.style.background = prev[0];
      document.body.style.background = prev[1];
    };
  }, []);

  return (
    <div style={{ padding: 8, background: 'transparent', height: '100vh', boxSizing: 'border-box' }}>
      <AxeOverlayNotch
        onHome={() => { void resizeFor(false); }}
        onOpenChange={(open) => { void resizeFor(open); }}
      />
    </div>
  );
}
