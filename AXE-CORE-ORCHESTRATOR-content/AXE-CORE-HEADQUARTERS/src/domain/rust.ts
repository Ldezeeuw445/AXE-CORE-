/**
 * Life OS-hoek (BOUWLIJST, Spazio, 26 nov): focusmodus en rustig geluid, in
 * gewone taal in de chat. Geld achter een PIN zit op de Finance-tab zelf
 * (domain/geldPin.ts) -- een PIN typ je nooit in de chat, die blijft staan.
 *
 *   "focus" / "focus 50 min" / "focusmodus aan"  -> focus (standaard 25 min)
 *   "focus uit" / "stop focus"                    -> klaar
 *   "hoe lang nog focus"                          -> resterende tijd
 *   "rustige muziek" / "muziek uit"               -> zacht geluid aan/uit
 *   "zet geld achter een pin"                     -> uitleg waar dat kan
 *
 * In focus houdt AXE meldingen en job-berichten vast en zegt aan het eind
 * wat er binnenkwam. Geen I/O hier.
 */

export const STANDAARD_MINUTEN = 25;
const MAX_MINUTEN = 240;

export type RustOpdracht =
  | { soort: 'focus-aan'; minuten: number }
  | { soort: 'focus-uit' }
  | { soort: 'focus-stand' }
  | { soort: 'muziek-aan' }
  | { soort: 'muziek-uit' }
  | { soort: 'pin-uitleg' };

const AX = '^(?:axe[,\\s]+)?';
const EIND = '\\s*[.!?]*$';
const FOCUS_AAN = new RegExp(`${AX}(?:(?:zet\\s+)?focus(?:modus|mode)?(?:\\s+aan|\\s+on)?|start\\s+(?:een\\s+)?focus(?:sessie|modus)?|ik\\s+ga\\s+(?:me\\s+)?focussen|niet\\s+storen|do\\s+not\\s+disturb)(?:\\s+(?:voor\\s+|for\\s+)?(\\d{1,3})\\s*(?:min(?:uten|utes|uut)?|m|u(?:ur)?|h(?:ours?)?)?)?${EIND}`, 'i');
const FOCUS_UIT = new RegExp(`${AX}(?:(?:zet\\s+)?focus(?:modus|mode)?\\s+(?:uit|off)|stop\\s+(?:de\\s+|met\\s+)?focus(?:sessie|modus)?|klaar\\s+met\\s+focus|end\\s+focus)${EIND}`, 'i');
const FOCUS_STAND = new RegExp(`${AX}(?:hoe\\s+lang\\s+nog(?:\\s+focus)?|hoeveel\\s+tijd\\s+nog|focus\\s+(?:stand|status)|how\\s+long\\s+left)${EIND}`, 'i');
const MUZIEK_AAN = new RegExp(`${AX}(?:(?:speel|zet|start|doe)\\s+(?:wat\\s+|een\\s+beetje\\s+)?)?(?:rustige|zachte|kalme|ontspannende|calm|soft|relaxing)\\s+(?:muziek|geluid(?:en)?|achtergrond(?:geluid)?|music|sounds?)(?:\\s+(?:aan|op|on|graag|please))?${EIND}`, 'i');
const MUZIEK_UIT = new RegExp(`${AX}(?:(?:zet\\s+)?(?:de\\s+)?(?:muziek|geluid|music)\\s+(?:uit|off)|stop\\s+(?:de\\s+)?(?:muziek|geluid|music))${EIND}`, 'i');
const PIN = new RegExp(`${AX}(?:zet\\s+)?(?:(?:mijn\\s+)?geld|finance|financi[eë]n)\\s+(?:achter|op)\\s+(?:een\\s+)?pin(?:code)?${EIND}|${AX}(?:pin\\s+op\\s+(?:finance|geld))${EIND}`, 'i');

export function rustOpdracht(tekst: string): RustOpdracht | null {
  const t = (tekst ?? '').trim().replace(/\s+/g, ' ');
  if (!t || t.length > 60) return null;
  if (FOCUS_UIT.test(t)) return { soort: 'focus-uit' };
  if (FOCUS_STAND.test(t)) return { soort: 'focus-stand' };
  if (MUZIEK_UIT.test(t)) return { soort: 'muziek-uit' };
  if (MUZIEK_AAN.test(t)) return { soort: 'muziek-aan' };
  if (PIN.test(t)) return { soort: 'pin-uitleg' };
  const f = FOCUS_AAN.exec(t);
  if (f) {
    let min = f[1] ? Number(f[1]) : STANDAARD_MINUTEN;
    if (f[1] && /\d\s*(?:u|h)/i.test(t)) min *= 60;
    return { soort: 'focus-aan', minuten: Math.max(1, Math.min(MAX_MINUTEN, min)) };
  }
  return null;
}

/** "18 min" / "1 u 05 min" / "minder dan een minuut". */
export function restTekst(tot: number, nu: number): string {
  const min = Math.ceil((tot - nu) / 60_000);
  if (min <= 1) return 'minder dan een minuut';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} u ${String(min % 60).padStart(2, '0')} min`;
}

/** Wat AXE zegt aan het eind van de focus, met wat er binnenkwam. */
export function focusKlaarTekst(minuten: number, meldingen: number, berichten: number): string {
  const delen: string[] = [];
  if (meldingen) delen.push(`${meldingen} ${meldingen === 1 ? 'melding' : 'meldingen'}`);
  if (berichten) delen.push(`${berichten} ${berichten === 1 ? 'bericht van een taak' : 'berichten van taken'}`);
  const binnen = delen.length ? `In die tijd kwam binnen: ${delen.join(' en ')}. Ze staan nu in de bel en het gesprek.` : 'Er kwam niets binnen.';
  return `Focus klaar (${minuten} min). ${binnen}`;
}

export const PIN_UITLEG = 'Dat doe je op de Finance-tab: tik op "Lock with PIN" bovenaan en kies 4 tot 8 cijfers. Typ je PIN nooit hier in de chat; die blijft in het gesprek staan.';
