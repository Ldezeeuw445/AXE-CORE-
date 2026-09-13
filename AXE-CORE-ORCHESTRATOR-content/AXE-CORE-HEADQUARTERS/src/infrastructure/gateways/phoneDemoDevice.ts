/**
 * phoneDemoDevice — een Samsung A17 die er niet is.
 *
 * De device manager was tot nu toe alleen te bouwen met de echte telefoon aan
 * de kabel: geen toestel, geen scherm, niets om tegenaan te klikken. Dit is
 * dat toestel, nagemaakt — genoeg om de manager helemaal te maken, te testen
 * en te proberen zonder dat er iets in de Mac hangt.
 *
 * ## Waarom schermen uit elementen, geen plaatjes
 *
 * Een echte `screenshot` is een PNG; die namaken zou tekenwerk per scherm zijn
 * dat niets bewijst. In plaats daarvan is elk scherm een lijst elementen met
 * hun vak en label — precies wat `ui_dump` op het echte toestel teruggeeft. De
 * device manager tekent daar zijn draadscherm van, dus wat je in demo ziet is
 * exact de vorm die de manager van een écht toestel zou krijgen. Eén weg, geen
 * tweede werkelijkheid die alleen in demo klopt.
 *
 * ## De toestand leeft hier, niet in de UI
 *
 * `tap`, `key` en `launch` verspringen het scherm. Die overgang hoort bij het
 * toestel, niet bij het paneel — anders zou de chat-tool ([PHONE_DO:]) een
 * ander toestel besturen dan het paneel. Eén `screen` op moduleniveau, en
 * iedereen die kijkt ziet hetzelfde.
 */
import type { PhoneDevice, PhoneElement, PhoneResult } from './phoneBridgeService';
import { A17_DEMO_MODEL, A17_SCREEN } from '@/domain/phone/a17';

const DEVICE_SERIAL = 'demo-a17';

export const DEMO_DEVICE: PhoneDevice = {
  serial: DEVICE_SERIAL,
  state: 'device',
  model: A17_DEMO_MODEL,
};

type ScreenId = 'home' | 'apps' | 'chrome' | 'settings' | 'axecore';

/** Eén ding op het scherm: een vak met een label, en waar een tap heen leidt. */
interface DemoEl {
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tap?: boolean;
  editable?: boolean;
  /** Tap hierop springt naar dit scherm. */
  to?: ScreenId;
}

const { width: W } = A17_SCREEN;

/** Een app-tegel op het beginscherm: vierkant, met label eronder. */
function tile(label: string, col: number, row: number, to?: ScreenId): DemoEl {
  const cell = W / 4;
  const size = 168;
  const cx = col * cell + cell / 2;
  const cy = 360 + row * 300 + size / 2;
  return { label, x1: cx - size / 2, y1: cy - size / 2, x2: cx + size / 2, y2: cy + size / 2, tap: true, to };
}

/** Een rij in een lijst (Instellingen): volle breedte, tikbaar. */
function row(label: string, index: number, to?: ScreenId): DemoEl {
  const y = 220 + index * 150;
  return { label, x1: 48, y1: y, x2: W - 48, y2: y + 120, tap: true, to };
}

const STATUS: DemoEl = { label: '09:41   ·   demo   ·   100%', x1: 0, y1: 0, x2: W, y2: 72 };

const SCREENS: Record<ScreenId, DemoEl[]> = {
  home: [
    STATUS,
    tile('Chrome', 0, 0, 'chrome'),
    tile('AXE CORE', 1, 0, 'axecore'),
    tile('Axon Memory', 2, 0),
    tile('Settings', 3, 0, 'settings'),
    tile('Messages', 0, 1),
    tile('Camera', 1, 1),
    tile('Phone', 2, 1),
    tile('Play Store', 3, 1),
    // Dock
    { label: 'Apps', x1: W / 2 - 84, y1: 2040, x2: W / 2 + 84, y2: 2208, tap: true, to: 'apps' },
  ],
  apps: [
    STATUS,
    { label: 'All apps', x1: 48, y1: 120, x2: 520, y2: 220 },
    tile('Chrome', 0, 0, 'chrome'),
    tile('AXE CORE', 1, 0, 'axecore'),
    tile('Axon Memory', 2, 0),
    tile('Settings', 3, 0, 'settings'),
    tile('Calculator', 0, 1),
    tile('Clock', 1, 1),
    tile('Gallery', 2, 1),
    tile('Contacts', 3, 1),
    { label: 'Home', x1: W / 2 - 84, y1: 2040, x2: W / 2 + 84, y2: 2208, tap: true, to: 'home' },
  ],
  chrome: [
    STATUS,
    { label: 'Search or type URL', x1: 96, y1: 132, x2: W - 96, y2: 252, editable: true },
    { label: 'AXE Companion', x1: 96, y1: 340, x2: W - 96, y2: 460, tap: true },
    { label: 'Trading Intel', x1: 96, y1: 500, x2: W - 96, y2: 620, tap: true },
    { label: 'nos.nl', x1: 96, y1: 660, x2: W - 96, y2: 780, tap: true },
    { label: 'Back', x1: 48, y1: 2040, x2: 300, y2: 2208, tap: true, to: 'home' },
  ],
  settings: [
    STATUS,
    { label: 'Settings', x1: 48, y1: 120, x2: 520, y2: 220 },
    row('Wi-Fi', 0),
    row('Bluetooth', 1),
    row('Display', 2),
    row('Battery', 3),
    row('About phone — Model SM-A175F', 4),
    { label: 'Home', x1: W / 2 - 84, y1: 2040, x2: W / 2 + 84, y2: 2208, tap: true, to: 'home' },
  ],
  axecore: [
    STATUS,
    { label: 'AXE CORE', x1: 48, y1: 132, x2: 520, y2: 236 },
    { label: 'Home', x1: 96, y1: 300, x2: W - 96, y2: 420, tap: true },
    { label: 'Trading', x1: 96, y1: 460, x2: W - 96, y2: 580, tap: true },
    { label: 'Memory', x1: 96, y1: 620, x2: W - 96, y2: 740, tap: true },
    { label: 'Apps', x1: 96, y1: 780, x2: W - 96, y2: 900, tap: true },
    { label: 'Back', x1: 48, y1: 2040, x2: 300, y2: 2208, tap: true, to: 'home' },
  ],
};

/** Het huidige scherm. Modulebreed, zodat chat-tool en paneel hetzelfde zien. */
let screen: ScreenId = 'home';
/** Wat er in het adresveld staat, zodat getypte tekst zichtbaar terugkomt. */
let typed = '';

/** Waar het toestel nu staat — het paneel leest dit om het juiste scherm te tekenen. */
export function demoScreenId(): ScreenId {
  return screen;
}

/** Terug naar af. Handig in tests en bij het openen van het paneel. */
export function resetDemoDevice(): void {
  screen = 'home';
  typed = '';
}

/** Projecteer een demo-scherm op de vorm die `ui_dump` teruggeeft. */
function elementsFor(id: ScreenId): PhoneElement[] {
  return SCREENS[id].map((e) => {
    const label = e.editable && typed ? typed : e.label;
    return {
      label,
      x: Math.round((e.x1 + e.x2) / 2),
      y: Math.round((e.y1 + e.y2) / 2),
      w: Math.round(e.x2 - e.x1),
      h: Math.round(e.y2 - e.y1),
      ...(e.tap ? { tap: true } : {}),
      ...(e.editable ? { editable: true } : {}),
    };
  });
}

/** De tikbare elementen van het scherm dat nu aanstaat. */
export function demoElements(): PhoneElement[] {
  return elementsFor(screen);
}

/** Het toestel dat adb zou "zien". Altijd de A17, altijd bruikbaar. */
export function demoDevices(): { adb: string; devices: PhoneDevice[] } {
  return { adb: 'demo', devices: [DEMO_DEVICE] };
}

/** Vind het demo-element onder een punt, of dat een label draagt. */
function hit(action: string, p: Record<string, unknown>): DemoEl | null {
  const list = SCREENS[screen];
  if (typeof p.label === 'string') {
    const want = p.label.trim().toLowerCase();
    const byLabel = list.find((e) => e.label.toLowerCase() === want)
      ?? list.find((e) => e.label.toLowerCase().includes(want));
    if (byLabel) return byLabel;
  }
  const x = Number(p.x);
  const y = Number(p.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return list.find((e) => x >= e.x1 && x <= e.x2 && y >= e.y1 && y <= e.y2) ?? null;
  }
  return null;
}

const PACKAGE_SCREEN: Record<string, ScreenId> = {
  'com.android.chrome': 'chrome',
  'com.axecore.core': 'axecore',
  'com.android.settings': 'settings',
};

/** Look zonder gevolg — leest het scherm, verandert niets. */
export function demoLook(action: string): PhoneResult {
  const base = { ok: true, action, device: DEVICE_SERIAL } as const;
  switch (action) {
    case 'ui_dump': {
      const elements = demoElements();
      return { ...base, elements, count: elements.length };
    }
    case 'current_app':
      return { ...base, stdout: `mCurrentFocus=Window{demo ${screen}} (${DEMO_DEVICE.model})` };
    case 'screen_size':
      return { ...base, stdout: `Physical size: ${A17_SCREEN.width}x${A17_SCREEN.height}` };
    case 'screenshot':
      // Het paneel tekent in demo zijn draadscherm uit ui_dump; een PNG hoeft
      // hier niet. Een lege PNG houdt de aanroepende code (die `png` verwacht)
      // heel zonder dat er canvas aan te pas komt — belangrijk voor de tests,
      // die in Node zonder DOM draaien.
      return { ...base, png: TRANSPARENT_PNG };
    default:
      return { ...base, stdout: '' };
  }
}

/** Do met gevolg — verspringt het scherm, net als een echte tik. */
export function demoDo(action: string, params: Record<string, unknown> = {}): PhoneResult {
  const base = { ok: true, action, device: DEVICE_SERIAL } as const;
  switch (action) {
    case 'tap': {
      const el = hit(action, params);
      if (el?.to) screen = el.to;
      return { ...base, stdout: el ? `tapped ${el.label}` : 'tapped empty space' };
    }
    case 'key': {
      const key = String(params.key ?? '').toUpperCase();
      if (key === 'HOME') screen = 'home';
      if ((key === 'BACK' || key === 'APP_SWITCH') && screen !== 'home') screen = 'home';
      return { ...base, stdout: `pressed ${key}` };
    }
    case 'launch': {
      const pkg = String(params.package ?? '');
      if (PACKAGE_SCREEN[pkg]) screen = PACKAGE_SCREEN[pkg];
      return { ...base, stdout: `launched ${pkg}` };
    }
    case 'open_url':
      screen = 'chrome';
      typed = String(params.url ?? '');
      return { ...base, stdout: `opened ${typed}` };
    case 'text':
      typed = String(params.text ?? '');
      return { ...base, stdout: `typed ${typed}` };
    case 'swipe': {
      const up = Number(params.y1) > Number(params.y2);
      if (up && screen === 'home') screen = 'apps';
      if (!up && screen === 'apps') screen = 'home';
      return { ...base, stdout: `swiped ${up ? 'up' : 'down'}` };
    }
    default:
      return { ...base, stdout: '' };
  }
}

/** 1×1 transparante PNG. Geen canvas nodig, werkt in Node én browser. */
const TRANSPARENT_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
