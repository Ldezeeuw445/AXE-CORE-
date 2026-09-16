/**
 * Welke hoofdmotor elke hoofdagent heeft.
 *
 * ## Waarom dit bestaat
 *
 * Luka heeft drie abonnementen -- Claude, ChatGPT (Codex) en Cursor -- en drie
 * agents die ertoe doen: AXE Core (de chat), de Code Agent en AXE Algo
 * (trading). Zonder verdeling pakken ze allemaal wat er in de cascade staat, en
 * dan vechten ze om hetzelfde abonnement. Gemeten 13 september: de trading-desk
 * startte zes `codex exec`-sessies tegelijk en binnen een uur was Codex op, ook
 * voor de chat en de editor.
 *
 * ## De twee regels
 *
 * 1. **Een abonnement hoort bij hooguit één agent.** Niet in de UI alleen, maar
 *    hier: `normaliseer()` haalt een dubbele toewijzing weg, dus een oude
 *    opgeslagen waarde of een tweede venster kan het niet omzeilen.
 * 2. **Subtaken draaien nooit op een abonnement.** De elf desk-rollen,
 *    embeddings, samenvattingen: die gaan over je API-sleutels. Een abonnement
 *    is voor de hoofdbeurt -- het chatantwoord, de code-run, de eindbeslissing
 *    van AXE Algo. Zie zonderAbonnement() in abonnementChat.ts.
 *
 * ## Cursor mag overal
 *
 * Tot 14 september alleen bij de Code Agent, omdat de chat en AXE Algo in
 * `plan` draaien en Cursor geen alleen-lezen stand had. Die heeft hij nu
 * (`--mode ask`, zie abonnementChat.ts). Elke agent kan dus elk abonnement.
 *
 * ## De Northsea Desk
 *
 * De vierde agent. Northsea Commodity Partners is geen eigen app: de hele desk
 * wordt een dashboard op de 3D Maps-tab van AXE CORE, en deze agent plant en
 * bouwt daaraan (planner.py, taken in de kolom Northsea). Zijn standaard is
 * API-sleutels, zodat hij niemand zijn abonnement afpakt.
 */
import { ALLE_MOTOREN, ABONNEMENT_PROVIDER, zonderAbonnement, type AgentEngine } from '@/domain/abonnementChat';

export type HoofdAgent = 'axe-core' | 'code-agent' | 'axe-algo' | 'maps-agent';

/** Een abonnement, of: je API-sleutels (de gewone cascade). */
export type HoofdMotor = AgentEngine | 'sleutels';

export type MotorToewijzing = Record<HoofdAgent, HoofdMotor>;

export const HOOFD_AGENTS: readonly HoofdAgent[] = ['axe-core', 'code-agent', 'axe-algo', 'maps-agent'] as const;

export const AGENT_LABEL: Record<HoofdAgent, string> = {
  'axe-core': 'AXE Core (chat)',
  'code-agent': 'Code Agent',
  'axe-algo': 'AXE Algo (eindbeslissing)',
  'maps-agent': 'Northsea Desk (3D Maps)',
};

export const MOTOR_LABEL: Record<HoofdMotor, string> = {
  claude: 'Claude-abonnement',
  claude2: 'Claude-abonnement 2',
  claude3: 'Claude-abonnement 3',
  claude4: 'Claude-abonnement 4',
  codex: 'ChatGPT-abonnement (Codex)',
  cursor: 'Cursor-abonnement',
  sleutels: 'API-sleutels',
};

/** Wat elke agent überhaupt mag: sinds Cursor alleen-lezen kan, alles. */
export const TOEGESTAAN: Record<HoofdAgent, readonly HoofdMotor[]> = {
  'axe-core': [...ALLE_MOTOREN, 'sleutels'],
  'code-agent': [...ALLE_MOTOREN, 'sleutels'],
  'axe-algo': [...ALLE_MOTOREN, 'sleutels'],
  'maps-agent': [...ALLE_MOTOREN, 'sleutels'],
};

/** Elk abonnement bij de agent die er het best bij past, geen enkele dubbel. */
export const STANDAARD_TOEWIJZING: MotorToewijzing = {
  'axe-core': 'claude',
  'code-agent': 'cursor',
  'axe-algo': 'codex',
  'maps-agent': 'sleutels',
};

export const MOTOREN_SLEUTEL = 'axe_agent_motoren';

/**
 * Een toewijzing die de regels haalt.
 *
 * Onbekend of niet toegestaan valt terug op de standaard voor die agent, tenzij
 * die standaard al bezet is; dan API-sleutels. Een abonnement dat twee keer
 * voorkomt blijft bij de eerste agent in HOOFD_AGENTS-volgorde. Nooit een
 * uitzondering: een kapotte opgeslagen waarde mag de chat niet stilzetten.
 */
export function normaliseer(ruw: unknown): MotorToewijzing {
  const bron = (ruw && typeof ruw === 'object') ? ruw as Record<string, unknown> : {};
  const bezet = new Set<HoofdMotor>();
  const uit = {} as MotorToewijzing;
  for (const agent of HOOFD_AGENTS) {
    const gevraagd = bron[agent];
    const kandidaten: unknown[] = gevraagd === undefined ? [STANDAARD_TOEWIJZING[agent]] : [gevraagd, STANDAARD_TOEWIJZING[agent]];
    let gekozen: HoofdMotor = 'sleutels';
    for (const k of kandidaten) {
      if (typeof k !== 'string') continue;
      const motor = k as HoofdMotor;
      if (!TOEGESTAAN[agent].includes(motor)) continue;
      if (motor !== 'sleutels' && bezet.has(motor)) continue;
      gekozen = motor;
      break;
    }
    // Een expliciet gekozen 'sleutels' mag nooit stilletjes een abonnement worden.
    if (gevraagd === 'sleutels') gekozen = 'sleutels';
    if (gekozen !== 'sleutels') bezet.add(gekozen);
    uit[agent] = gekozen;
  }
  return uit;
}

/**
 * Wat je voor deze agent in het menu kunt kiezen: toegestaan, en niet al van
 * een andere agent. Zijn eigen huidige keuze staat er altijd in.
 */
export function kiesbaar(toewijzing: MotorToewijzing, agent: HoofdAgent): HoofdMotor[] {
  const vanAnderen = new Set(
    HOOFD_AGENTS.filter(a => a !== agent).map(a => toewijzing[a]).filter(m => m !== 'sleutels'),
  );
  return TOEGESTAAN[agent].filter(m => m === 'sleutels' || !vanAnderen.has(m));
}

/**
 * Een nieuwe keuze voor één agent. Neemt hij een abonnement dat al van een
 * andere agent was, dan krijgt die ander API-sleutels -- de keuze die je nú
 * maakt wint, en er staat nooit iets dubbel.
 */
export function wijsToe(toewijzing: MotorToewijzing, agent: HoofdAgent, motor: HoofdMotor): MotorToewijzing {
  if (!TOEGESTAAN[agent].includes(motor)) return toewijzing;
  const volgende = { ...toewijzing, [agent]: motor };
  if (motor !== 'sleutels') {
    for (const ander of HOOFD_AGENTS) {
      if (ander !== agent && volgende[ander] === motor) volgende[ander] = 'sleutels';
    }
  }
  return normaliseer(volgende);
}

/** Het abonnement van deze agent, of null als hij op API-sleutels draait. */
export function abonnementVan(toewijzing: MotorToewijzing, agent: HoofdAgent): AgentEngine | null {
  const m = toewijzing[agent];
  return m === 'sleutels' ? null : m;
}

/**
 * De cascade van één agent: zijn eigen abonnement vooraan, daarna alleen
 * API-sleutels.
 *
 * Elke abonnement-slot die al in de cascade stond gaat eruit -- ook die van de
 * ★ Primary. Anders zou de chat, als zijn eigen abonnement op is, doorvallen op
 * het abonnement van AXE Algo, en dat is precies het gevecht dat dit voorkomt.
 */
export function cascadeVoorAgent<T extends { provider?: string; model?: string; key?: string }>(
  cascade: readonly T[],
  abonnement: AgentEngine | null,
): T[] {
  const rest = zonderAbonnement(cascade);
  if (!abonnement) return rest;
  return [{ provider: ABONNEMENT_PROVIDER, model: abonnement, key: '' } as T, ...rest];
}
