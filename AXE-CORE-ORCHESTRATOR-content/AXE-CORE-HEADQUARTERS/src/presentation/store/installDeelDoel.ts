/**
 * installDeelDoel — delen vanuit élke app komt binnen in AXE.
 *
 * ## Hoe een deling hier aankomt
 *
 * `public/manifest.json` meldt AXE CORE aan als share target. Android opent de
 * PWA dan op `/` met de gedeelde velden in de zoekreeks (`?title=..&text=..`).
 * Geen aparte route: `/` bestaat gegarandeerd, een verzonnen pad als `/deel`
 * hangt ervan af of de hosting onbekende paden naar index.html stuurt -- en dat
 * is precies het soort aanname dat hier een keer stilletjes misging.
 *
 * ## Waarom de tekst geparkeerd wordt en niet meteen verstuurd
 *
 * Twee redenen. Een deling is een halve gedachte: je wilt er nog iets bij typen.
 * En de composer bestaat op dit moment nog niet -- React heeft nog niets
 * gerenderd. Dus zetten we hem apart, en haalt de composer hem op zodra hij er
 * is (`neemDeelTekst`). Een gebeurtenis erbij voor het geval er later nog een
 * deling binnenkomt terwijl de app al open staat.
 *
 * De zoekreeks wordt daarna uit de adresbalk gehaald: anders levert één keer
 * verversen dezelfde deling nog een keer op.
 */
import { deelBerichtUitZoek } from '@/domain/deelBericht';

export const DEEL_GEBEURTENIS = 'axe-deel-tekst';

let geparkeerd: string | null = null;

/** De gedeelde tekst, één keer. Daarna is hij weg. */
export function neemDeelTekst(): string | null {
  const t = geparkeerd;
  geparkeerd = null;
  return t;
}

export function installDeelDoel(): void {
  if (typeof window === 'undefined') return;
  const tekst = deelBerichtUitZoek(window.location.search);
  if (!tekst) return;

  geparkeerd = tekst;

  try {
    // Een deling hoort op de telefoon-Home te landen, waar de composer staat.
    // De PWA start daar normaal ook (`start_url` in het manifest), maar een
    // share-opening komt binnen zonder hash.
    if (!window.location.hash) window.location.hash = '#/mobile';
    // Alleen de deel-velden eruit, niet de hele zoekreeks: daar kunnen andere
    // dingen in staan (`?ontwerp=1` slaat in dev het inloggen over), en die
    // allemaal weggooien is een nevenschade die je pas merkt als iets anders
    // stilletjes stopt met werken.
    const over = new URLSearchParams(window.location.search);
    for (const veld of ['title', 'text', 'url']) over.delete(veld);
    const rest = over.toString();
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash,
    );
  } catch {
    // Kan de adresbalk niet opgeschoond worden, dan is de deling nog steeds
    // binnen -- hooguit komt hij bij verversen opnieuw.
  }

  window.dispatchEvent(new CustomEvent(DEEL_GEBEURTENIS, { detail: tekst }));
}
