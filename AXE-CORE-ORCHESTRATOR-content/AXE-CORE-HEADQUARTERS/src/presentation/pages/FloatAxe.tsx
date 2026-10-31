/** Always-on floating AXE notch (louis_rlee) — eigen Tauri-venster via zwevendeVensters type `axe`. */
import { useEffect } from 'react';
import { AxeOverlayNotch } from '@/presentation/components/overlay/AxeOverlayNotch';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

async function resizeFor(open: boolean) {
  if (!isTauriRuntime()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const { LogicalSize } = await import('@tauri-apps/api/dpi');
    const w = getCurrentWindow();
    await w.setSize(new LogicalSize(440, open ? 560 : 54));
  } catch { /* preview browser */ }
}

export default function FloatAxe() {
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
