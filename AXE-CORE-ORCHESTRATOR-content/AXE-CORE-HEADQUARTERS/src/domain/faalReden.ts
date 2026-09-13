/**
 * De reden dat een provider faalde, kort genoeg voor een logregel.
 *
 * ## Waarom dit bestaat
 *
 * De routeringslog kapte elke fout af op de eerste 24 tekens. Voor een HTTP-
 * fout gaat dat goed: die zegt zijn status vooraan. Voor een CLI gaat het
 * altijd mis, want een CLI-fout is opgebouwd als
 *
 *     Codex eindigde met 1. stderr: Not inside a trusted directory and ...
 *
 * en de eerste 24 tekens daarvan zijn "Codex eindigde met 1. st". Dat is de
 * mededeling dát het misging, precies zonder het enige stuk dat zegt waarom.
 * Gemeten 13 september 2026: de chat viel stilletjes door naar Claude en de
 * log zei "fail abonnement/codex — Codex eindigde", terwijl codex zelf al die
 * tijd een bruikbare zin schreef.
 *
 * Vandaar deze regel: staat er `stderr:` in, dan is DAT het stuk dat iets
 * zegt, en de aanloop ervoor niet.
 *
 * ## Waarom het hier staat en niet in de store
 *
 * Het was een functie van vijf regels binnen voiceStore, en daardoor zonder
 * test -- dus niemand merkte dat hij precies de verkeerde helft bewaarde.
 * Hier is het een regel met een naam en een test eromheen, net als
 * proxyErrorMessage, dat uit exact hetzelfde soort fout ontstond.
 */

/** Hoeveel tekens een reden mag innemen in een logregel. */
const MAX = 60;

function knip(tekst: string, max = MAX): string {
  const schoon = tekst.replace(/\s+/g, ' ').trim();
  return schoon.length > max ? `${schoon.slice(0, max - 1)}…` : schoon;
}

export function korteFaalReden(bericht: string): string {
  if (/timeout|timed out|abort/i.test(bericht)) return 'timeout';
  if (/network|failed to fetch|cors|load failed/i.test(bericht)) return 'network';

  // Een CLI draagt zijn reden achteraan. Vóór de HTTP-status, want een
  // CLI-regel kan toevallig een getal van drie cijfers bevatten en dan zou
  // "504" als status gelezen worden terwijl het een padnaam was.
  const stderr = bericht.match(/stderr:\s*(\S[\s\S]*)/i);
  if (stderr) return knip(stderr[1]);

  const status = bericht.match(/\b(4\d{2}|5\d{2})\b/);
  if (status) return status[1];

  return knip(bericht, 24);
}
