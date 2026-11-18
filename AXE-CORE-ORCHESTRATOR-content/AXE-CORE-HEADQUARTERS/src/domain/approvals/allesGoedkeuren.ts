/**
 * "Keur alles goed" in het gesprek, zoals bij Grok Bot (Luka, 18 nov 2026):
 * "ik moet het in me gesprek met een manager kunnen doen of ik moet tegen axe
 * kunnen zeggen dat hij ze allemaal mag approven en dat moet hij dan ook
 * gewoon kunnen ... als ik zeg dat het mag dan mag het".
 *
 * Herkent die zin. Bewust ruim op "alles" en smal op twijfel: een vraag ("mag
 * ik alles goedkeuren?") of een ontkenning ("niet alles") is geen opdracht.
 */
const JA = /\b(ok[eé]?|oke|okay|ja|yes|akkoord|prima|doe maar|go|mag)\b/i;
const ALLES = /\b(alles|allemaal|alle|all|everything)\b/i;
const DOE = /\b(goedkeur\w*|keur\w*|approv\w*|verstuur\w*|versturen|stuur\w*|accepteer\w*)\b/i;
const NIET = /\b(niet|nee|no|geen|wacht|stop)\b/i;

export function isAllesGoedkeuren(tekst: string): boolean {
  const t = (tekst || '').trim();
  if (!t || t.length > 200 || t.endsWith('?') || NIET.test(t)) return false;
  if (!ALLES.test(t)) return false;
  return JA.test(t) || DOE.test(t);
}

export interface AllesUitkomst {
  verstuurd: number;
  axeGoedgekeurd: number;
  mislukt: string[];
  overgeslagen: number;
}

/** Wat AXE terugzegt, in gewone taal. */
export function allesZin(u: AllesUitkomst): string {
  const delen: string[] = [];
  if (u.verstuurd) delen.push(`${u.verstuurd} ${u.verstuurd === 1 ? 'mail' : 'mails'} van NorthSea verstuurd`);
  if (u.axeGoedgekeurd) delen.push(`${u.axeGoedgekeurd} ${u.axeGoedgekeurd === 1 ? 'vraag' : 'vragen'} in AXE goedgekeurd`);
  let zin = delen.length ? `Gedaan: ${delen.join(' en ')}.` : 'Er stond niets dat ik met één ja kon afhandelen.';
  if (u.overgeslagen) {
    zin += ` ${u.overgeslagen} ${u.overgeslagen === 1 ? 'ding blijft' : 'dingen blijven'} staan: deal-besluiten en binnengekomen mails zijn keuzes, geen ja/nee; die staan in Wacht op jou.`;
  }
  if (u.mislukt.length) zin += ` Niet gelukt (${u.mislukt.length}): ${u.mislukt.slice(0, 3).join('; ')}.`;
  return zin;
}
