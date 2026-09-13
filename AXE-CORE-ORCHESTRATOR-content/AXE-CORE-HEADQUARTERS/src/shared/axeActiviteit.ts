/**
 * Wat AXE op dit moment doet, als gebeurtenis voor de zwevende bol.
 *
 * Elke laag mag melden (daarom in shared/): het geheugen als er iets onthouden
 * wordt, de autopilot bij een beslissing, de Code Editor als een agent werkt.
 * De bol luistert en laat zijn deeltjes naar dat deel van het scherm vliegen.
 *
 * `doelen` is een voorkeurslijst: eerst een element op de pagina
 * ([data-axe-doel="editor"]), en anders het nav-icoon van de tab waar het
 * gebeurt ("/memory"). Is geen van beide zichtbaar, dan pulseert de bol alleen.
 *
 * Nooit een bevel aan de gebruiker, nooit iets dat wacht: fire-and-forget. Een
 * melding die niemand hoort (bol uit, geen venster) kost niets.
 */
export interface AxeActiviteit {
  doelen: string[];
  /** Eén korte regel: wat AXE doet. */
  label: string;
  /** Kleur van de vlucht, als css-kleur. Standaard het cyaan van AXE. */
  kleur?: string;
}

export const ACTIVITEIT_GEBEURTENIS = 'axe:activiteit';

/** Zelfde doel en label binnen deze tijd: één vlucht, niet tien. */
const STIL_MS = 4000;
let laatste = { sleutel: '', op: 0 };

export function meldActiviteit(a: AxeActiviteit): void {
  if (typeof window === 'undefined' || !a.doelen.length || !a.label.trim()) return;
  const sleutel = `${a.doelen[0]}|${a.label}`;
  const nu = Date.now();
  if (sleutel === laatste.sleutel && nu - laatste.op < STIL_MS) return;
  laatste = { sleutel, op: nu };
  try {
    window.dispatchEvent(new CustomEvent<AxeActiviteit>(ACTIVITEIT_GEBEURTENIS, { detail: a }));
  } catch { /* geen DOM: niets te tonen */ }
}
