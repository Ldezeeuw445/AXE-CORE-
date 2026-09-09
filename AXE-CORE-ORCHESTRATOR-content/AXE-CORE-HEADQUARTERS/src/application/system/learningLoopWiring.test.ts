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
    // agenticEngine staat hier NIET meer bij: 863 regels zonder één importeur.
    // Ik had er een leerlus in gezet en deze test kleurde groen -- omdat hij
    // alleen keek of het BESTAND de juiste aanroepen bevat, niet of iemand dat
    // bestand gebruikt. Precies het gat dat deze test moest dichten, en de
    // tweede keer op één dag (zie aiAgent hieronder). Vandaar de test
    // 'is bereikbaar' hieronder.
  ];

  it.each(AGENTS)('$bestand wordt door iets aangeroepen', ({ bestand }) => {
    /* Een agent die niemand importeert draait niet, hoe goed hij ook bedraad
       is. Zonder deze controle meldt de test hierboven "aangesloten" voor code
       die bij het bouwen wordt weggesnoeid -- dat is erger dan geen test.
       Dynamische imports tellen mee: de pagina's worden lui geladen. */
    const naamZonderPad = bestand.split('/').pop()!.replace(/\.tsx?$/, '');
    const roepers = BESTANDEN.filter(({ pad, tekst }) =>
      !pad.endsWith(bestand) &&
      !pad.endsWith('.test.ts') &&
      new RegExp(`from ['"][^'"]*/${naamZonderPad}['"]|import\\(\\s*['"][^'"]*/${naamZonderPad}['"]`).test(tekst),
    );
    expect(roepers.map(({ pad }) => pad), `${bestand} heeft geen enkele importeur`).not.toHaveLength(0);
  });

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

  /**
   * agenticEngine.ts is volledig bedraad -- hij haalt op als 'agentic', vraagt
   * om latestOpenTurnId('agentic') en velt zijn oordeel in recordAgentRun. En
   * het maakt niets uit, want 863 regels lang importeert niemand hem en hij
   * staat niet in dist/.
   *
   * Dat is geen reden om de bedrading weg te halen -- hij klopt, en de dag dat
   * iemand hem aansluit leert hij meteen mee. Het is wel een reden om vast te
   * leggen dat hij nu niet draait, want anders telt hij bij de volgende
   * inventarisatie mee als "in de lus" terwijl er nooit een beurt langskomt.
   */
  it('agenticEngine heeft nog steeds geen importeurs', () => {
    const importeurs = BESTANDEN.filter(({ pad, tekst }) =>
      !pad.endsWith('agents/agenticEngine.ts') &&
      /from ['"][^'"]*\/agenticEngine['"]|import\(\s*['"][^'"]*\/agenticEngine['"]/.test(tekst),
    );
    expect(
      importeurs.map(({ pad }) => pad),
      'agenticEngine draait weer -- zet hem dan alsnog in de AGENTS-lijst hierboven',
    ).toHaveLength(0);
  });
});

/**
 * De tellers zeggen DAT de lus draait. Het dossier zegt WAT erin ging.
 *
 * Zonder afnemer is dat opnieuw code die bestaat, getest is en door niemand
 * gebruikt wordt -- de zesde keer in deze codebase. Vandaar dezelfde wachter
 * als voor de rest van de lus.
 */
describe('het dossier is te zien, niet alleen te bouwen', () => {
  it('iets vraagt de dossiers op', () => {
    const roepers = aanroepersVan('turnDossiers', 'memoryFeedbackService');
    expect(
      roepers,
      'turnDossiers heeft geen afnemer -- niemand kan zien welke herinneringen een beslissing in gingen',
    ).not.toHaveLength(0);
  });
});
