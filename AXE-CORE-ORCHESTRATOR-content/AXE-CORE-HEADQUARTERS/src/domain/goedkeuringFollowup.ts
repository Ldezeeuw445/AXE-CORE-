/**
 * Follow-up in een managerhoek mag een pending OK afhandelen, niet een LLM-run starten.
 *
 * Luka typte "you can give it my OK" in de NorthSea-popover; dat ging de
 * gewone follow-up-route in (nieuwe tier-3 job) en strandde op providers.
 * Korte ja/nee blijft voor de hoofdcomposer; hier herkennen we ook een zin
 * die de OK expliciet geeft of weigert.
 */

const AKKOORD = /\b(give (it|this|him|her|them)?\s*(my |the )?(ok|okay|oke|akkoord)|mijn ok|mag (het|dat) van mij|(you can|go ahead and) (give|approve)|approved? (it|this|that)?|akkoord|goedkeuren|doe (het |dat )?maar|ga door|go ahead)\b/i;

const AFWIJZEN = /\b(reject( it| this| that)?|weiger(en)?|afwijzen|niet doen|don'?t (do|approve)|do not approve|laat maar|liever niet)\b/i;

function normaal(tekst: string): string {
  return (tekst || '').replace(/\s+/g, ' ').trim();
}

/** True als deze follow-up de pending goedkeuring van díe manager is. */
export function followupIsAkkoord(tekst: string): boolean {
  const t = normaal(tekst);
  if (!t) return false;
  if (followupIsAfwijzing(t)) return false;
  if (AKKOORD.test(t)) return true;
  if (/^(ja|yes|yep|yeah|ok|okay|oke|oké|prima|akkoord|approve)\b[.!?]*$/i.test(t)) return true;
  return false;
}

export function followupIsAfwijzing(tekst: string): boolean {
  const t = normaal(tekst);
  if (!t) return false;
  if (/^(nee|no|nope|reject|afwijzen)\b[.!?]*$/i.test(t)) return true;
  return AFWIJZEN.test(t) && !AKKOORD.test(t);
}
