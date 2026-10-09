/**
 * Notities en telefoon als eigen vensters boven het hele bureaublad (Tauri).
 *
 * Een ding in de DOM van het hoofdvenster blijft in dat venster: je kunt het niet buiten de app slepen
 * en het ligt in de weg zodra je iets anders doet. Een eigen, randloos venster dat altijd bovenaan blijft
 * en op elke Space en elk scherm zichtbaar is, kan dat wel -- hetzelfde als het Computer Use-venster
 * (windowManagerService.openPersonalComputerUse). Slepen en vergroten doet de OS-vensterbeheerder
 * (startDragging / startResizeDragging), dus het gedraagt zich als elk ander venster op de Mac.
 *
 * Plek en maat worden onthouden (localStorage is gedeeld tussen de vensters van dezelfde app) en bij het
 * volgende openen teruggezet -- ook op het tweede scherm.
 */
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

export type ZwevendType = 'notes' | 'phone';

interface Ontwerp { label: string; route: string; titel: string; b: number; h: number; minB: number; minH: number }

export const ZWEVENDE_VENSTERS: Record<ZwevendType, Ontwerp> = {
  notes: { label: 'axe-float-notes', route: '/float/notes', titel: 'AXE Notes', b: 780, h: 540, minB: 360, minH: 300 },
  phone: { label: 'axe-float-phone', route: '/float/phone', titel: 'AXE Phone', b: 420, h: 860, minB: 300, minH: 560 },
};

export interface Frame { x: number; y: number; b: number; h: number }
const sleutel = (t: ZwevendType) => `axe_float_frame_${t}`;

function leesFrame(t: ZwevendType): Frame | null {
  try {
    const f = JSON.parse(localStorage.getItem(sleutel(t)) ?? 'null') as Frame | null;
    return f && [f.x, f.y, f.b, f.h].every(Number.isFinite) && f.b > 100 && f.h > 100 ? f : null;
  } catch { return null; }
}
export function bewaarFrame(t: ZwevendType, f: Frame): void {
  try { localStorage.setItem(sleutel(t), JSON.stringify(f)); } catch { /* alleen niet onthouden */ }
}

/** Past een bewaarde plek nog op een aangesloten scherm? Anders begint hij in het midden (scherm weg of kleiner). */
export function frameOpSchermen(f: Frame, schermen: ReadonlyArray<{ x: number; y: number; b: number; h: number }>): boolean {
  return schermen.some(s => f.x + 60 < s.x + s.b && f.x + f.b - 60 > s.x && f.y + 20 < s.y + s.h && f.y + 40 > s.y);
}

/** Open het venster, of haal het naar voren als het er al is. */
export async function openZwevend(type: ZwevendType): Promise<void> {
  const o = ZWEVENDE_VENSTERS[type];
  if (!isTauriRuntime()) {
    window.open(`${window.location.origin}${window.location.pathname}#${o.route}`, '_blank', `width=${o.b},height=${o.h}`);
    return;
  }
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const bestaand = await WebviewWindow.getByLabel(o.label);
  if (bestaand) {
    await bestaand.show();
    await bestaand.setFocus();
    return;
  }
  const opgeslagen = leesFrame(type);
  let plek: { x?: number; y?: number; center?: boolean } = { center: true };
  if (opgeslagen) {
    try {
      const { availableMonitors } = await import('@tauri-apps/api/window');
      const monitors = await availableMonitors();
      const schermen = monitors.map(m => ({ x: m.position.x / m.scaleFactor, y: m.position.y / m.scaleFactor, b: m.size.width / m.scaleFactor, h: m.size.height / m.scaleFactor }));
      if (schermen.length === 0 || frameOpSchermen(opgeslagen, schermen)) plek = { x: opgeslagen.x, y: opgeslagen.y };
    } catch { plek = { x: opgeslagen.x, y: opgeslagen.y }; }
  }
  const win = new WebviewWindow(o.label, {
    url: `index.html#${o.route}`,
    title: o.titel,
    width: opgeslagen?.b ?? o.b,
    height: opgeslagen?.h ?? o.h,
    minWidth: o.minB,
    minHeight: o.minH,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
    resizable: true,
    shadow: true,
    theme: 'dark',
    ...plek,
  });
  await new Promise<void>((resolve, reject) => {
    win.once('tauri://created', () => resolve());
    win.once('tauri://error', e => reject(new Error(String(e.payload))));
  });
}

async function zwevendOpen(type: ZwevendType): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  return (await WebviewWindow.getByLabel(ZWEVENDE_VENSTERS[type].label)) !== null;
}

/** Open als hij dicht is, sluit als hij open is (voor de knop in het radiaal dok). */
export async function wisselZwevend(type: ZwevendType): Promise<void> {
  if (await zwevendOpen(type)) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    await (await WebviewWindow.getByLabel(ZWEVENDE_VENSTERS[type].label))?.close();
  } else {
    await openZwevend(type);
  }
}
