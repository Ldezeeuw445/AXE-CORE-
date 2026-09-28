/**
 * De snelacties onder de composer op de Code Editor: wat je NU aan het doen bent.
 *
 * Op Home zijn het vier algemene duwtjes ("Verhelder de vraag"). Op de code-tab
 * gaat de composer naar de code-agent, dus hier horen het opdrachten die over
 * het open bestand, de open patch of de gekozen repo gaan. Dezelfde vier
 * accenten en iconen als op Home, zodat het dezelfde rij blijft.
 */
import { SNELACTIES, type Snelactie } from './snelacties';

export interface CodeContext {
  /** De gekozen repo (naam uit AGENT_REPOS). */
  repo: string;
  /** Pad van het actieve bestand, of null. */
  bestand: string | null;
  /** Staat er een voorstel van de agent open op dit bestand? */
  patchOpen: boolean;
}

const accent = (i: number) => SNELACTIES[i];

function actie(i: number, id: string, label: string, prompt: string): Snelactie {
  return { id, label, prompt, icoon: accent(i).icoon, accent: accent(i).accent };
}

export function codeSnelacties(ctx: CodeContext): Snelactie[] {
  const repo = ctx.repo || 'deze repo';
  if (ctx.bestand && ctx.patchOpen) {
    const naam = ctx.bestand.split('/').pop() ?? ctx.bestand;
    return [
      actie(0, 'patch-uitleg', 'Leg deze wijziging uit', `Leg de openstaande wijziging in ${ctx.bestand} uit: wat verandert er en waarom? `),
      actie(1, 'patch-risico', 'Wat kan er stuk?', `Wat kan er stukgaan door de wijziging in ${ctx.bestand}? Noem de randgevallen. `),
      actie(2, 'patch-tests', `Tests voor ${naam}`, `Schrijf tests die de wijziging in ${ctx.bestand} vastleggen. `),
      actie(3, 'patch-kleiner', 'Maak hem kleiner', `Maak de wijziging in ${ctx.bestand} zo klein mogelijk zonder het gedrag te veranderen. `),
    ];
  }
  if (ctx.bestand) {
    const naam = ctx.bestand.split('/').pop() ?? ctx.bestand;
    return [
      actie(0, 'uitleg', `Leg ${naam} uit`, `Leg uit wat ${ctx.bestand} doet en hoe het in ${repo} past. `),
      actie(1, 'bugs', 'Zoek bugs', `Zoek bugs en stille fouten in ${ctx.bestand}. Noem regel en reden. `),
      actie(2, 'tests', 'Schrijf tests', `Schrijf tests voor ${ctx.bestand} in de teststijl van ${repo}. `),
      actie(3, 'opschonen', 'Maak het leesbaarder', `Maak ${ctx.bestand} leesbaarder zonder het gedrag te veranderen. `),
    ];
  }
  return [
    actie(0, 'verken', `Verken ${repo}`, `Geef me een kaart van ${repo}: de mappen, waar de ingang zit en welke bestanden ertoe doen. `),
    actie(1, 'wijzigingen', 'Wat is er veranderd?', `Vat de openstaande git-wijzigingen in ${repo} samen. `),
    actie(2, 'feature', 'Plan een feature', `Maak een plan voor deze feature in ${repo}, met de bestanden die je aanraakt: `),
    actie(3, 'fout', 'Los een fout op', `Zoek en los deze fout op in ${repo}: `),
  ];
}
