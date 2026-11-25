/**
 * De snelactie-pillen onder de composer: wat erop staat en welke kleur.
 *
 * ## Waarom dit hier staat en niet in de component
 *
 * De vier accentkleuren zijn letterlijk overgenomen uit het voorbeeld dat Luka
 * stuurde, en dat is het soort waarde dat je op vier plekken overtypt en dat
 * dan uit elkaar loopt. Eén lijst, en de component leest hem.
 *
 * ## De regel die hier wél te testen is
 *
 * Wet 10 van de designpack: kleur zit in de letters, nooit in een vlak. Bij
 * deze pillen betekent dat: het ICOON krijgt de accentkleur, het label blijft
 * grijs, en de pil zelf heeft geen gevulde achtergrond. Dat is niet in een
 * unittest te zien -- dat zit in de css -- maar wat wél te testen is: de
 * kleuren moeten van elkaar te onderscheiden zijn. Twee pillen met bijna
 * dezelfde tint zeggen "deze twee horen bij elkaar" zonder dat dat waar is.
 */

export type SnelactieIcoon = 'brein' | 'context' | 'levering' | 'scherpen';

export interface Snelactie {
  id: string;
  /** Wat er op de pil staat. */
  label: string;
  icoon: SnelactieIcoon;
  /** De accentkleur van het ICOON. Niet van de pil. */
  accent: string;
  /** Wat er in de composer komt te staan als je hem aanklikt. */
  prompt: string;
}

/**
 * De vier uit het voorbeeld, met de kleuren eruit.
 *
 * De woorden zijn van AXE en niet van het voorbeeld: daar staat een
 * UX-onderzoeker-flow ("Clarify user problem"), en dat betekent hier niets.
 * De vorm, de maten en de kleuren zijn wel exact die van het voorbeeld.
 */
export const SNELACTIES: readonly Snelactie[] = [
  {
    id: 'verhelder',
    label: 'Clarify the ask',
    icoon: 'brein',
    accent: '#8B7CF6',
    prompt: 'First ask me the questions you need before you start on this: ',
  },
  {
    id: 'context',
    label: 'Give context',
    icoon: 'context',
    accent: '#F5A524',
    prompt: 'Here is the context you need to know: ',
  },
  {
    id: 'levering',
    label: 'Pick the deliverable',
    icoon: 'levering',
    accent: '#EF4444',
    prompt: 'What exactly will you deliver, and in what form? ',
  },
  {
    id: 'scherpen',
    label: 'Sharpen it',
    icoon: 'scherpen',
    accent: '#2DD4BF',
    prompt: 'Make this task sharper and name what is still missing: ',
  },
] as const;

/** Hoe ver twee kleuren uit elkaar moeten liggen om als verschillend te lezen. */
export const ACCENT_AFSTAND = 60;

/** Afstand tussen twee hexkleuren, plat in rgb. Genoeg om buren te betrappen. */
export function accentAfstand(a: string, b: string): number {
  const rgb = (h: string) => {
    const n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.round(Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2));
}
