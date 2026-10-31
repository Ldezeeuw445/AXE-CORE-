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
        const mon = await currentMonitor();
        const scale = mon?.scaleFactor || 1;
        const screenH = (mon?.size.height || 900) / scale;
        const screenW = (mon?.size.width || 1440) / scale;
        const screenX = (mon?.position.x || 0) / scale;
        const screenY = (mon?.position.y || 0) / scale;
        const pos = await w.outerPosition();
        const lx = pos.x / scale;
        const ly = pos.y / scale;
        let nx = lx;
        let ny = ly;
        // If expanding would clip below the screen, pin near the top
        if (ly + height > screenY + screenH - 24) {
          ny = screenY + 72;
        }
        if (lx + width > screenX + screenW - 12) {
          nx = screenX + screenW - width - 24;
        }
        if (lx < screenX + 8) nx = screenX + 24;
        if (nx !== lx || ny !== ly) {
          await w.setPosition(new LogicalPosition(nx, ny));
        }
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
