/**
 * sneltoets.ts — de pure beslissingen achter de globale mic-sneltoets.
 *
 * De sneltoets zelf wordt in Rust geregistreerd (src-tauri/src/lib.rs), want
 * alleen het besturingssysteem kan een toets afvangen terwijl een ANDERE app
 * voorop staat. Wat hier staat is het stuk dat geen venster, geen Tauri en
 * geen browser nodig heeft, en dus getest kan worden:
 *
 *   - `ontleedSneltoets`  leest een accelerator-tekst ("Alt+Space") en zegt of
 *                         hij bruikbaar is, en hoe hij er genormaliseerd uitziet.
 *   - `sneltoetsActie`    zegt wat de sneltoets moet DOEN, gegeven of er al een
 *                         gesprek loopt. Dat is een schakelaar: loopt er iets,
 *                         dan stopt de sneltoets het; loopt er niets, dan start hij.
 *
 * Esc blijft los daarvan bestaan en blijft altijd stoppen — die zit in de
 * vensterlaag (useKeyboardShortcuts) en wordt hier niet aangeraakt.
 */

/** De vier modifiers die een globale sneltoets mag dragen. */
export type SneltoetsModifier = 'control' | 'alt' | 'shift' | 'super';

export interface Sneltoets {
  /** Altijd in vaste volgorde: control, alt, shift, super. */
  modifiers: SneltoetsModifier[];
  /** De toets in Tauri's `Code`-schrijfwijze, bv. 'Space', 'KeyM', 'F5'. */
  code: string;
  /** Genormaliseerde tekst, bv. 'Alt+Space'. Dit is wat Rust registreert. */
  accelerator: string;
}

/**
 * Option+Space op de Mac. Tauri (en Windows/Linux) noemen die modifier 'Alt';
 * `ontleedSneltoets` accepteert allebei de namen.
 */
export const STANDAARD_SNELTOETS = 'Alt+Space';

/**
 * De naam van het Tauri-event dat Rust stuurt zodra de sneltoets ingedrukt is.
 * De frontend luistert hierop en roept dan start/stop aan; zie `sneltoetsActie`.
 */
export const SNELTOETS_EVENT = 'axe://sneltoets-mic';

/** Schrijfwijzen die allemaal op dezelfde modifier uitkomen. */
const MODIFIER_ALIASSEN: Record<string, SneltoetsModifier> = {
  control: 'control',
  ctrl: 'control',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  shift: 'shift',
  super: 'super',
  cmd: 'super',
  command: 'super',
  meta: 'super',
  win: 'super',
};

/** Vaste volgorde, zodat 'Shift+Alt+M' en 'Alt+Shift+M' dezelfde tekst geven. */
const MODIFIER_VOLGORDE: SneltoetsModifier[] = ['control', 'alt', 'shift', 'super'];

const MODIFIER_LABEL: Record<SneltoetsModifier, string> = {
  control: 'Control',
  alt: 'Alt',
  shift: 'Shift',
  super: 'Super',
};

/** Niet-letterlijke toetsen die een eigen `Code`-naam hebben. */
const TOETS_ALIASSEN: Record<string, string> = {
  space: 'Space',
  spacebar: 'Space',
  enter: 'Enter',
  return: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
};

/** Zet één segment om naar een `Code`-naam, of null als het geen toets is. */
function naarCode(segment: string): string | null {
  const klein = segment.toLowerCase();

  const alias = TOETS_ALIASSEN[klein];
  if (alias) return alias;

  // Eén letter → KeyA .. KeyZ
  if (/^[a-z]$/.test(klein)) return `Key${klein.toUpperCase()}`;

  // Eén cijfer → Digit0 .. Digit9
  if (/^[0-9]$/.test(klein)) return `Digit${klein}`;

  // Functietoetsen F1 .. F24. Bewust begrensd: 'F0' en 'F99' bestaan niet.
  const fn = /^f([1-9]|1[0-9]|2[0-4])$/.exec(klein);
  if (fn) return `F${fn[1]}`;

  return null;
}

/**
 * Leest een accelerator-tekst en geeft de genormaliseerde sneltoets terug,
 * of null als hij niet bruikbaar is.
 *
 * Waarom minstens één modifier verplicht is: dit is een GLOBALE sneltoets.
 * Een kale 'Space' zou de spatiebalk afpakken van elke app op de machine —
 * je kunt dan nergens meer een spatie typen. Dat is geen sneltoets maar een
 * kapotte computer, dus die vorm wijzen we af in plaats van hem te registreren.
 *
 * Verder afgewezen: lege tekst, alleen modifiers, een dubbele modifier, twee
 * gewone toetsen ('Alt+A+B'), een lege tussenruimte ('Alt++Space') en elke
 * toets die we niet naar een `Code` kunnen vertalen.
 */
export function ontleedSneltoets(s: string): Sneltoets | null {
  if (typeof s !== 'string') return null;

  const segmenten = s.split('+').map((deel) => deel.trim());
  if (segmenten.length < 2) return null; // kale toets of lege tekst
  if (segmenten.some((deel) => deel === '')) return null; // 'Alt++Space', 'Alt+'

  const modifierDelen = segmenten.slice(0, -1);
  const toetsDeel = segmenten[segmenten.length - 1];

  const gezien = new Set<SneltoetsModifier>();
  for (const deel of modifierDelen) {
    const modifier = MODIFIER_ALIASSEN[deel.toLowerCase()];
    if (!modifier) return null; // onbekende modifier, of een tweede echte toets
    if (gezien.has(modifier)) return null; // 'Alt+Option+Space' is dezelfde toets twee keer
    gezien.add(modifier);
  }

  // Een modifier op de laatste plek ('Control+Alt') is geen toets en valt hier
  // vanzelf af: geen enkele modifiernaam vertaalt naar een `Code`.
  const code = naarCode(toetsDeel);
  if (!code) return null;

  const modifiers = MODIFIER_VOLGORDE.filter((m) => gezien.has(m));
  const accelerator = [...modifiers.map((m) => MODIFIER_LABEL[m]), code].join('+');

  return { modifiers, code, accelerator };
}

/**
 * Wat de sneltoets moet doen. Eén toets, twee betekenissen: hij is een
 * schakelaar. Loopt er een gesprek, dan is de tweede druk 'stop'.
 */
export function sneltoetsActie(gesprekActief: boolean): 'start' | 'stop' {
  return gesprekActief ? 'stop' : 'start';
}
