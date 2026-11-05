/** Always-on floating AXE notch — Mochi-style, flush top of main display. */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { AxeOverlayNotch } from '@/presentation/components/overlay/AxeOverlayNotch';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import { notchMaten, type NotchMaten } from '@/domain/overlay/notchMaten';

/**
 * De maten komen uit `domain/overlay/notchMaten`, niet uit dit bestand.
 *
 * Hier stond `COLLAPSED_H = 44` met een eigen breedte-formule, en deze pagina
 * is de laatste die aan het woord is: hij overschrijft bij elke start de
 * CSS-variabele én de vensterhoogte. Het venster en de CSS stonden al op 80,
 * maar dit zette hem terug naar 44 — dus de notch bleef te laag en niemand
 * kon zien waarom.
 *
 * `uiScale` is om dezelfde reden weg. Die rekende `44 / 54 = 0,81` en kromp
 * daarmee alles tot onder zijn eigen ontwerp. De CSS is getekend op
 * NOTCH_HOOGTE bij schaal 1, en die 1 is de standaard in de CSS zelf.
 */
function metricsForScreen(screenW: number, screenH: number): NotchMaten {
  return notchMaten(screenW, screenH);
}

const FALLBACK: NotchMaten = metricsForScreen(1920, 1080);

let cached: NotchMaten = FALLBACK;

function applyCssVars(m: NotchMaten) {
  // Alleen de hoogte. `--axe-notch-w` werd hier gezet en door geen enkele
  // regel CSS gelezen, en radius/scale zijn gelijk aan hun eigen standaard.
  document.documentElement.style.setProperty('--axe-notch-h', `${m.inklapH}px`);
}

/**
 * Het scherm waar je zit, niet het scherm dat toevallig "primair" heet.
 *
 * Andersom stond de notch op de ene monitor terwijl Luka op de andere werkte,
 * en dan is een altijd-aanwezige balk juist altijd afwezig.
 */
async function huidigeMonitor() {
  const { primaryMonitor, currentMonitor } = await import('@tauri-apps/api/window');
  return (await currentMonitor()) || (await primaryMonitor());
}

async function readMetrics(): Promise<NotchMaten> {
  if (!isTauriRuntime()) {
    const w = typeof window !== 'undefined' ? window.screen.width : 1920;
    const h = typeof window !== 'undefined' ? window.screen.height : 1080;
    cached = metricsForScreen(w, h);
    applyCssVars(cached);
    return cached;
  }
  try {
    const mon = await huidigeMonitor();
    if (!mon) return cached;
    const scale = mon.scaleFactor || 1;
    cached = metricsForScreen(mon.size.width / scale, mon.size.height / scale);
    applyCssVars(cached);
    return cached;
  } catch {
    return cached;
  }
}

/**
 * Zet het venster bovenaan het scherm waar je zit, horizontaal gecentreerd.
 *
 * LET OP — half af, en dat is geen slordigheid maar een grens: de native kant
 * (`dock_notch_frame` in src-tauri/src/lib.rs) kiest zélf het scherm met de
 * oorsprong dichtst bij (0,0), dus het primaire, en klemt de x die hier
 * berekend wordt dáárin vast. Werk je op je tweede scherm, dan landt de notch
 * nog steeds op je eerste. Deze kant is nu goed; die Rust-regel moet mee, en
 * gaat in een eigen commit omdat een Tauri-build hier niet te verifiëren is.
 */
async function dockTop(open: boolean) {
  if (!isTauriRuntime()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const { LogicalSize } = await import('@tauri-apps/api/dpi');
    const { invoke } = await import('@tauri-apps/api/core');
    const m = await readMetrics();
    const w = getCurrentWindow();
    const height = open ? m.uitklapH : m.inklapH;
    const width = m.b;
    const mon = await huidigeMonitor();
    if (!mon) {
      await w.setSize(new LogicalSize(width, height));
      return;
    }
    const scale = mon.scaleFactor || 1;
    const screenW = mon.size.width / scale;
    const screenX = mon.position.x / scale;
    const screenY = mon.position.y / scale;
    const nx = screenX + (screenW - width) / 2;
    /* Vlak tegen de bovenrand, dus óver de menubalk heen.
       Hier stond `screenY + 30`: ruimte vrijlaten voor de menubalk, waardoor
       de notch eronder hing en als een los paneel aanvoelde. Luka op 5 nov:
       hij heeft aan de bovenkant de vorm van iets dat tegen de rand aan zit,
       dus dáár hoort hij ook. Het venster staat al op NSStatusWindowLevel
       (25), het enige niveau waarop dat mag; de native kant moet dan wel de
       hele `frame` nemen in plaats van de `visibleFrame` die onder de
       menubalk begint — zie dock_notch_frame in src-tauri/src/lib.rs. */
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
  // De open-stand leeft in AxeOverlayNotch; hier is alleen nodig wat het
  // venster moet worden als hij opnieuw aandokt.
  const openRef = useRef(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.axeNotch = '1';
    return () => { delete root.dataset.axeNotch; };
  }, []);

  useEffect(() => {
    const prev = [document.documentElement.style.background, document.body.style.background];
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    document.body.style.margin = '0';
    void (async () => {
      await readMetrics();
      // Always start collapsed. Inferring from innerHeight re-opens a stale
      // expanded frame (870×720) and leaves the notch "big in the screen".
      void dockTop(false);
    })();
    return () => {
      document.documentElement.style.background = prev[0];
      document.body.style.background = prev[1];
    };
  }, []);

  /**
   * Terug naar het midden zodra hij weer tevoorschijn komt.
   *
   * Eén keer aandokken bij het laden is niet genoeg: het venster blijft
   * bestaan terwijl je het verbergt en weer opent, en een scherm erbij of
   * eraf verandert waar "midden boven" is zonder dat deze pagina herlaadt.
   * Dit zet hem bij elke keer dat hij zichtbaar of actief wordt terug —
   * en dus ook op het scherm waar je dan zit.
   */
  useEffect(() => {
    const opnieuw = () => {
      // Mét de stand van nu: `dockTop(false)` zou een open paneel dichtklappen
      // zodra je het aanklikt, en dan lijkt de notch zichzelf te sluiten.
      if (document.visibilityState === 'hidden') return;
      void dockTop(openRef.current);
    };
    window.addEventListener('focus', opnieuw);
    document.addEventListener('visibilitychange', opnieuw);
    return () => {
      window.removeEventListener('focus', opnieuw);
      document.removeEventListener('visibilitychange', opnieuw);
    };
  }, []);

  return (
    <div style={{ padding: 0, background: 'transparent', height: '100vh', boxSizing: 'border-box' }}>
      <AxeOverlayNotch
        onHome={() => { openRef.current = false; void dockTop(false); }}
        onOpenChange={(open) => { openRef.current = open; void dockTop(open); }}
      />
    </div>
  );
}
