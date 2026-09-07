import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * De leerlus was volledig gebouwd, getest en gedocumenteerd -- en hij liep
 * niet. Niet door een bug, maar doordat niemand de ingang aanriep:
 * `buildTradingAgentContextWithEpisode` had nul aanroepers, dus
 * agent_learning_episodes stond op nul rijen, dus er viel niets te sluiten en
 * niets te versterken. `applyAgentReinforcement` had eveneens nul aanroepers.
 *
 * Groene tests bewijzen dat een functie werkt. Ze bewijzen niet dat iemand
 * hem gebruikt. Dat gat is hier twee keer ingelopen, dus staat er nu een
 * wachter: elke ingang van de lus moet minstens één aanroeper hebben buiten
 * de module die hem definieert.
 */

const SRC = new URL('../../', import.meta.url).pathname;

function alleBronbestanden(dir: string, uit: string[] = []): string[] {
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) alleBronbestanden(pad, uit);
    else if (/\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam)) uit.push(pad);
  }
  return uit;
}

const BESTANDEN = alleBronbestanden(SRC).map((pad) => ({ pad, tekst: readFileSync(pad, 'utf8') }));

/** Aanroepers, met de definiërende module er bewust uit: die roept zichzelf
 *  aan of exporteert alleen, en dat telt niet als "in gebruik". */
function aanroepersVan(functie: string, definieertIn: string): string[] {
  const roep = new RegExp(`\\b${functie}\\s*\\(`);
  return BESTANDEN
    .filter(({ pad, tekst }) => !pad.includes(definieertIn) && roep.test(tekst))
    .map(({ pad }) => pad.slice(SRC.length));
}

describe('de leerlus is aangesloten, niet alleen gebouwd', () => {
  it('iets opent episodes voor de handelsagent', () => {
    const roepers = aanroepersVan('buildTradingAgentContextWithEpisode', 'tradingAgentMemoryService');
    expect(roepers, 'niemand opent een episode -- agent_learning_episodes blijft leeg').not.toHaveLength(0);
  });

  it('iets sluit episodes af', () => {
    const roepers = [
      ...aanroepersVan('closeEpisode', 'agentFeedbackService'),
      ...aanroepersVan('closeTradingEpisodeForTrade', 'agentFeedbackService'),
    ];
    expect(roepers, 'episodes worden geopend maar nooit gesloten').not.toHaveLength(0);
  });

  it('iets voert de versterking daadwerkelijk uit', () => {
    const roepers = aanroepersVan('applyAgentReinforcement', 'agentFeedbackService');
    expect(roepers, 'importance in rag_memories beweegt nooit -- het geheugen groeit maar leert niet').not.toHaveLength(0);
  });

  it('de versterking draait herhaald, niet één keer per opstart', () => {
    const boot = BESTANDEN.find(({ pad }) => pad.endsWith('axeBootstrap.ts'));
    expect(boot, 'axeBootstrap.ts niet gevonden').toBeDefined();
    // Een lus die alleen bij het opstarten draait, staat stil zodra je de app
    // een dag open laat -- precies wanneer hij het meeste te doen heeft.
    expect(boot!.tekst).toMatch(/setInterval\(.{0,80}applyAgentReinforcement/s);
  });
});

/**
 * Per agent: haalt hij geheugen op mét zijn eigen naam erop, en velt hij
 * daarna een oordeel over díé beurt?
 *
 * De naam is het punt. Zonder eigen naam pakt een agent "de laatste
 * openstaande beurt" -- en dat kan er een van een ander zijn, want ophalen is
 * asynchroon. Dan wordt het verkeerde versterkt, zelden en dus onopgemerkt.
 */
describe('elke agent tekent zijn eigen beurt', () => {
  const AGENTS: Array<{ bestand: string; naam: string }> = [
    { bestand: 'agents/browserAgentLoop.ts', naam: 'browser' },
    { bestand: 'agents/codeEditorAgent.ts', naam: 'code-editor' },
    { bestand: 'agents/localCodeAgent.ts', naam: 'local-code' },
    { bestand: 'agents/agenticEngine.ts', naam: 'agentic' },
  ];

  it.each(AGENTS)('$bestand haalt op als $naam en beoordeelt zijn eigen beurt', ({ bestand, naam }) => {
    const bron = BESTANDEN.find(({ pad }) => pad.endsWith(bestand));
    expect(bron, `${bestand} niet gevonden`).toBeDefined();
    const tekst = bron!.tekst;

    expect(tekst, `${bestand} haalt geen geheugen op`).toMatch(/buildGlobalMemoryContext\(/);
    expect(tekst, `${bestand} tekent zijn ophaalronde niet met '${naam}'`).toContain(`'${naam}'`);
    expect(tekst, `${bestand} vraagt niet om zijn eigen beurt`).toContain(`latestOpenTurnId('${naam}')`);
    expect(tekst, `${bestand} velt geen oordeel`).toMatch(/noteTurnOutcome\(/);
  });
});

/**
 * aiAgent.sendToAI staat bewust niet in de lijst hierboven.
 *
 * Die functie wordt alleen aangeroepen door AISidebar.tsx, en dat bestand
 * heeft nul importeurs -- het wordt bij het bouwen weggesnoeid en zit niet in
 * de bundel. Ik had er een leerlus in gezet en mijn eigen wachter kleurde
 * groen voor een agent die nergens draait. Dat is precies de valse zekerheid
 * die deze test moet voorkomen, dus staat hier vast wat de situatie is.
 *
 * De browser praat in werkelijkheid via browserAIService -> de VPS, en daar
 * wordt de prompt serverkant samengesteld. Die een leerlus geven is
 * serverwerk, geen clientwerk.
 *
 * Wordt AISidebar ooit weer aangesloten, dan faalt deze test en hoort
 * aiAgent alsnog in de lijst hierboven.
 */
describe('dode paden krijgen geen leerlus', () => {
  it('AISidebar heeft nog steeds geen importeurs', () => {
    const importeurs = BESTANDEN.filter(({ pad, tekst }) =>
      !pad.endsWith('components/ai/AISidebar.tsx') && /from '[^']*AISidebar'/.test(tekst),
    );
    expect(
      importeurs.map(({ pad }) => pad),
      'AISidebar wordt weer gebruikt -- zet aiAgent dan alsnog in de leerlus',
    ).toHaveLength(0);
  });
});
