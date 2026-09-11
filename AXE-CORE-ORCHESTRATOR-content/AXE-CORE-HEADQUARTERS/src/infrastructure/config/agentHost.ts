/**
 * Waar de codeeragent draait: op deze Mac, of op de VPS.
 *
 * ## Waarom dit een keuze per functie is en niet per app
 *
 * `VITE_VPS_API_ORIGIN` omzetten stuurt *alles* naar één host — ook je
 * LSE-proxy, je marktdata en je geheugenschrijvingen. Dan heb je twee volledige
 * omgevingen nodig met dezelfde sleutels, en kies je tussen "alles lokaal" en
 * "alles op de VPS". Dat is niet de keuze die je wilt maken.
 *
 * De codeeragent is namelijk het enige stuk waar de host écht uitmaakt: hij
 * bewerkt bestanden op de machine waar hij draait. Op de VPS bewerkt hij
 * `/opt/axe-core-api` — een deploy-kopie waar je zelf nooit in werkt. Je echte
 * worktree staat hier. Alles ánders (marktdata, geheugen, proxies) maakt het
 * niet uit waar het vandaan komt, en dat hoort dus op de VPS te blijven waar de
 * sleutels al staan.
 *
 * Vandaar: alleen `/claude/*` wordt omgeleid.
 *
 * ## Drie standen, en waarom 'auto' niet stil is
 *
 * - `lokaal` — altijd deze machine. Draait `run-local.sh` niet, dan faalt de
 *   aanroep zichtbaar. Dat is de bedoeling: je hebt expliciet gekozen.
 * - `vps` — altijd de VPS, zoals het gisteren werkte.
 * - `auto` — lokaal als die antwoordt, anders de VPS.
 *
 * Bij `auto` wordt onthouden wélke host het werd, en dat hoort het scherm te
 * tonen. Een stille terugval is precies de fout die deze codebase al drie keer
 * heeft moeten repareren: het werkt, en je weet niet waar. Dan bewerk je de
 * deploy-kopie terwijl je denkt dat je in je eigen repo zit.
 */

export type AgentHostVoorkeur = 'auto' | 'lokaal' | 'vps';

const SLEUTEL = 'axe_agent_host';

/** Dezelfde poort die run-local.sh gebruikt, en die nginx op de VPS proxyt. */
export const LOKALE_AGENT_ORIGIN =
  (import.meta.env.VITE_LOKALE_AGENT_ORIGIN as string | undefined) ?? 'http://127.0.0.1:8001';

/** Lang genoeg om niet elke aanroep te bevragen, kort genoeg om te merken dat
 *  je run-local.sh net gestart of gestopt hebt. */
const PROBE_TTL_MS = 60_000;

let probeOp = 0;
let probeUitslag: boolean | null = null;
let laatsteHost: 'lokaal' | 'vps' | null = null;

export function agentHostVoorkeur(): AgentHostVoorkeur {
  try {
    const v = localStorage.getItem(SLEUTEL);
    return v === 'lokaal' || v === 'vps' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function zetAgentHostVoorkeur(v: AgentHostVoorkeur): void {
  try {
    localStorage.setItem(SLEUTEL, v);
  } catch { /* privémodus: de keuze geldt dan voor deze sessie */ }
  probeUitslag = null;
  probeOp = 0;
  laatsteHost = null;
}

/** Welke host de vorige aanroep werkelijk gebruikte, voor op het scherm. */
export function agentHostStand(): 'lokaal' | 'vps' | null {
  return laatsteHost;
}

export function __resetAgentHost(): void {
  probeUitslag = null; probeOp = 0; laatsteHost = null;
}

/**
 * Antwoordt de lokale axe_api?
 *
 * `/health` en niet `/claude/repos`: die tweede vraagt een sleutel, en dan zou
 * een ontbrekende sleutel hier lezen als "lokaal draait niet" terwijl hij
 * gewoon draait. Twee verschillende problemen horen niet op hetzelfde antwoord
 * uit te komen.
 */
async function lokaalAntwoordt(): Promise<boolean> {
  if (probeUitslag !== null && Date.now() - probeOp < PROBE_TTL_MS) return probeUitslag;
  try {
    const res = await fetch(`${LOKALE_AGENT_ORIGIN}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    probeUitslag = res.ok;
  } catch {
    probeUitslag = false;
  }
  probeOp = Date.now();
  return probeUitslag;
}

/**
 * De basis-URL voor codeeragent-aanroepen.
 *
 * @param vpsBasis waar de rest van de app naartoe praat.
 */
export async function agentBasis(vpsBasis: string): Promise<string> {
  const voorkeur = agentHostVoorkeur();

  if (voorkeur === 'vps') { laatsteHost = 'vps'; return vpsBasis; }
  if (voorkeur === 'lokaal') { laatsteHost = 'lokaal'; return LOKALE_AGENT_ORIGIN; }

  if (await lokaalAntwoordt()) { laatsteHost = 'lokaal'; return LOKALE_AGENT_ORIGIN; }
  laatsteHost = 'vps';
  return vpsBasis;
}
