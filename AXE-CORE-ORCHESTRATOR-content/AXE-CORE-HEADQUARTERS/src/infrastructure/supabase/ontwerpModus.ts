/**
 * Ontwerpmodus: de app tonen zonder in te loggen, alleen tijdens ontwikkelen.
 *
 * Waarom dit bestaat: elke tab zit achter een login. Wie de UI bouwt kan zijn
 * eigen werk dus niet zien, verandert iets op de tast, en meldt het als klaar.
 * Zo blijft dezelfde layoutfout vier keer staan voordat iemand hem vindt. Dat
 * is hier letterlijk gebeurd.
 *
 * Twee sloten, en ze zijn allebei nodig:
 *
 *   1. `import.meta.env.DEV` is in ELKE gebouwde app hard `false`. Vite vervangt
 *      het letterlijk door false en snoeit de tak weg -- de code haalt de bundel
 *      niet eens. Er is dus geen vlag die per ongeluk aan kan staan.
 *   2. `?ontwerp=1` moet expliciet in de URL. Een gewone `npm run dev` logt
 *      gewoon in zoals altijd.
 *
 * Te controleren met een meting in plaats van een belofte:
 *
 *     npm run build && grep -rc "ONTWERP_MARKERING" dist/public/
 *
 * Nul treffers betekent dat niets hiervan in de app zit die jij gebruikt.
 */

/** Komt letterlijk in de dev-bundel en mag NOOIT in een productiebundel staan.
 *  Dit is de string waar de controle hierboven op zoekt. */
export const ONTWERP_MARKERING = 'ONTWERP_MARKERING_nooit_in_productie';

export function ontwerpModus(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('ontwerp') === '1';
  } catch {
    return false;
  }
}

/**
 * Vult localStorage met wat de app daar verwacht.
 *
 * Niet elke pagina leest uit Supabase. EVE, de modelkiezer en de
 * instellingen lezen hun providers uit `axe_llm_connections` in
 * localStorage. In een verse browser staat daar niets, dus tonen die
 * pagina's een lege lijst -- terwijl ze in Luka's app vol staan. Zonder dit
 * zou ik het verkeerde beoordelen: leegte die alleen hier bestaat.
 *
 * Schrijft nooit over wat er al staat: draai je dit per ongeluk in een
 * browser waar je echt werkt, dan blijft dat werk intact.
 */
export function zaaiOntwerpOpslag(): void {
  if (!ontwerpModus()) return;
  const zet = (sleutel: string, waarde: unknown) => {
    try {
      if (localStorage.getItem(sleutel) !== null) return;
      localStorage.setItem(sleutel, JSON.stringify(waarde));
    } catch { /* een browser die opslag weigert hoeft niets te doen */ }
  };

  zet('axe_llm_connections', {
    openai:     { key: ONTWERP_MARKERING, model: 'gpt-4o-mini', lastTest: 'ok' },
    anthropic:  { key: ONTWERP_MARKERING, model: 'claude-sonnet-5', lastTest: 'ok' },
    openrouter: { key: ONTWERP_MARKERING, model: 'llama-3.1-8b-instruct', lastTest: 'ok' },
    ollama:     { key: '', baseUrl: 'https://ollama.axecompanion.com', lastTest: 'ok' },
    google:     { key: ONTWERP_MARKERING, model: 'gemini-2.0-flash', lastTest: 'fail' },
  });
  zet('axe_slot_primary',   { provider: 'openai', key: ONTWERP_MARKERING, model: 'gpt-4o-mini' });
  zet('axe_slot_fallback1', { provider: 'ollama', key: '', model: 'qwen2.5-coder:7b' });
  zet('axe_github_repos', [
    { owner: 'Ldezeeuw445', name: 'AXE-CORE-', branch: 'orchestrator' },
  ]);
}

/*
 * Twee valkuilen bij het beoordelen van deze app in een testbrowser, allebei
 * op 8 september ingelopen:
 *
 * 1. Een VERBORGEN browserpaneel krijgt geen animatieframes. Elke pagina die
 *    met framer-motion binnenkomt (`initial={{opacity:0}}`) blijft dan op nul
 *    staan. Dat leest als "de pagina is onzichtbaar", en dat is het niet --
 *    het venster is het. Controleer `document.visibilityState` voor je een
 *    onzichtbare pagina een bug noemt.
 *
 * 2. Een paneel met hoogte 0 laat `100dvh` naar nul rekenen. Dan is elke
 *    "hoeveel procent van de pagina wordt gebruikt"-meting onzin, want de
 *    noemer is nul. Meet `innerHeight` voor je iets over indeling concludeert.
 */
