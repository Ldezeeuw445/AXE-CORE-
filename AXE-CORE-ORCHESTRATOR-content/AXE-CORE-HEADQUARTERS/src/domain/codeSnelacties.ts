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
  const repo = ctx.repo || 'this repo';
  if (ctx.bestand && ctx.patchOpen) {
    const naam = ctx.bestand.split('/').pop() ?? ctx.bestand;
    return [
      actie(0, 'patch-uitleg', 'Explain this change', `Explain the open change in ${ctx.bestand}: what changes and why? `),
      actie(1, 'patch-risico', 'What could break?', `What could break because of the change in ${ctx.bestand}? Name the edge cases. `),
      actie(2, 'patch-tests', `Tests for ${naam}`, `Write tests that pin down the change in ${ctx.bestand}. `),
      actie(3, 'patch-kleiner', 'Make it smaller', `Make the change in ${ctx.bestand} as small as possible without changing behaviour. `),
    ];
  }
  if (ctx.bestand) {
    const naam = ctx.bestand.split('/').pop() ?? ctx.bestand;
    return [
      actie(0, 'uitleg', `Explain ${naam}`, `Explain what ${ctx.bestand} does and how it fits into ${repo}. `),
      actie(1, 'bugs', 'Find bugs', `Find bugs and silent errors in ${ctx.bestand}. Name the line and the reason. `),
      actie(2, 'tests', 'Write tests', `Write tests for ${ctx.bestand} in the test style of ${repo}. `),
      actie(3, 'opschonen', 'Make it more readable', `Make ${ctx.bestand} more readable without changing behaviour. `),
    ];
  }
  return [
    actie(0, 'verken', `Explore ${repo}`, `Give me a map of ${repo}: the folders, where the entry point is and which files matter. `),
    actie(1, 'wijzigingen', 'What changed?', `Summarise the open git changes in ${repo}. `),
    actie(2, 'feature', 'Plan a feature', `Make a plan for this feature in ${repo}, with the files you will touch: `),
    actie(3, 'fout', 'Fix an error', `Find and fix this error in ${repo}: `),
  ];
}
