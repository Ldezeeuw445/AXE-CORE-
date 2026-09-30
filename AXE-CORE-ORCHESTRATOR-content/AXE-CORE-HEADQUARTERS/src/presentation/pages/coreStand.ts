/**
 * Welke stand de Core toont.
 *
 * Dit stond als een ladder van vraagtekens in `Home.tsx` en las alleen
 * `voiceStatus` en `pendingExec`. Draaide er een agent op de achtergrond, dan
 * stond er `idle` — terwijl `brain/product.md` als lat heeft: in één oogopslag
 * zie je of iets werkt. Hier als functie, zodat de volgorde een test heeft in
 * plaats van een geneste ternary van vijf diep.
 *
 * Volgorde is de bedoeling:
 * 1. Er wacht iets op jou. Dat is het enige waar jíj iets moet doen.
 * 2. Je praat tegen hem. Wat jij zegt gaat voor wat hij doet.
 * 3. Hij praat of denkt.
 * 4. Er loopt werk op de achtergrond terwijl het verder stil is.
 */
export type CoreStand =
  | 'awaiting-approval'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'idle';

export function coreStandVan(
  voiceStatus: string,
  pendingExec: boolean,
  werk: { lopend: number; wacht: number },
): CoreStand {
  if (pendingExec || werk.wacht > 0) return 'awaiting-approval';
  if (voiceStatus === 'listening') return 'listening';
  if (voiceStatus === 'processing') return 'thinking';
  if (voiceStatus === 'speaking') return 'speaking';
  // Stil aan deze kant, maar er wordt wel gewerkt. Dat is niet 'idle'.
  if (werk.lopend > 0) return 'thinking';
  return 'idle';
}
