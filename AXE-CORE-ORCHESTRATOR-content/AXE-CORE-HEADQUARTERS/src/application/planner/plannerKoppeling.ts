/**
 * De app en de planner op de agent-host houden elkaar bij.
 *
 * 1. De verdeling uit Instellingen → Motoren per agent leeft in localStorage;
 *    de planner draait in de lokale API en moet hem aangereikt krijgen. Bij het
 *    opstarten en bij elke wijziging.
 * 2. Wat de planner bedenkt of afmaakt, meldt de app aan de zwevende bol
 *    (shared/axeActiviteit), zodat je ZIET dat er gewerkt wordt zonder dat je
 *    iets vroeg. Eens per anderhalve minuut kijken, alleen als het venster zichtbaar is.
 */
import { plannerTaken, plannerZetMotoren, type PlannerTaak } from '@/infrastructure/gateways/axeCoreApiService';
import { leesToewijzing } from '@/infrastructure/persistence/agentMotorenOpslag';
import { meldActiviteit } from '@/shared/axeActiviteit';
import { saveRagMemory } from '@/infrastructure/persistence/ragMemoryService';

const AGENT: Record<string, string> = { 'axe-core': 'AXE Core', 'code-agent': 'Code Agent', 'axe-algo': 'AXE Algo', 'maps-agent': 'Northsea Desk' };
const IN_GEHEUGEN_SLEUTEL = 'axe_planner_in_geheugen';
const GEZIEN_SLEUTEL = 'axe_planner_gezien';
const POLL_MS = 90_000;

function geefMotorenDoor(): void {
  void plannerZetMotoren(leesToewijzing() as unknown as Record<string, string>).catch(() => { /* host zonder planner */ });
}

/** Wat er nieuw is sinds de vorige blik, als melding. Puur, zodat het te testen is. */
export function nieuweMeldingen(taken: PlannerTaak[], gezien: Record<string, string>): { label: string; id: string; stand: string }[] {
  const uit: { label: string; id: string; stand: string }[] = [];
  for (const t of taken) {
    const agent = AGENT[t.metadata?.agent ?? t.assignee ?? ''] ?? 'AXE';
    const stand = t.status === 'completed' ? 'klaar'
      : t.metadata?.goedkeuring === 'nodig' && t.status === 'pending' ? 'wacht'
      : t.status === 'pending' ? 'gepland' : t.status;
    if (gezien[t.id] === stand) continue;
    if (stand === 'klaar') uit.push({ id: t.id, stand, label: `${agent} deed: ${t.title}` });
    else if (stand === 'wacht') uit.push({ id: t.id, stand, label: `${agent} vraagt akkoord: ${t.title}` });
    else if (stand === 'gepland') uit.push({ id: t.id, stand, label: `${agent} plant: ${t.title}` });
  }
  return uit;
}

/**
 * Afgeronde planner-taken het doorzoekbare geheugen in, één keer per taak.
 *
 * De planner schrijft zijn uitkomst in de tabel `memory`, maar de chat en de
 * code-agent zoeken in rag_memories (embeddings). Zonder deze stap wist de chat
 * niet wat de planner vannacht had uitgezocht. De embedding maakt de app, met
 * dezelfde embedder als elke andere herinnering, zodat ze vergelijkbaar zijn.
 */
function naarGeheugen(taken: PlannerTaak[]): void {
  let gedaan: string[] = [];
  try { gedaan = JSON.parse(localStorage.getItem(IN_GEHEUGEN_SLEUTEL) ?? '[]'); } catch { /* leeg */ }
  const nieuw = taken.filter(t => t.status === 'completed' && t.result?.output && !gedaan.includes(t.id));
  for (const t of nieuw) {
    const agent = AGENT[t.metadata?.agent ?? ''] ?? 'AXE';
    void saveRagMemory({
      category: 'agent',
      importance: 6,
      content: `[planner · ${agent}] ${t.title}\n→ ${String(t.result?.output).slice(0, 1500)}`,
      metadata: { source: 'planner', taakId: t.id, app: (t.metadata as Record<string, unknown> | null)?.app },
    }).catch(() => { /* volgende ronde opnieuw */ });
    gedaan.push(t.id);
  }
  if (nieuw.length) {
    try { localStorage.setItem(IN_GEHEUGEN_SLEUTEL, JSON.stringify(gedaan.slice(-300))); } catch { /* quota */ }
  }
}

export function startPlannerKoppeling(): void {
  geefMotorenDoor();
  window.addEventListener('axe:agent-motoren', geefMotorenDoor);

  let eersteKeer = true;
  const kijk = async () => {
    if (document.hidden) return;
    let gezien: Record<string, string> = {};
    try { gezien = JSON.parse(localStorage.getItem(GEZIEN_SLEUTEL) ?? '{}'); } catch { /* leeg */ }
    const { taken } = await plannerTaken(20).catch(() => ({ taken: [] as PlannerTaak[] }));
    const meldingen = nieuweMeldingen(taken, gezien);
    naarGeheugen(taken);
    for (const m of meldingen) gezien[m.id] = m.stand;
    try {
      const houd = new Set(taken.map(t => t.id));
      localStorage.setItem(GEZIEN_SLEUTEL, JSON.stringify(Object.fromEntries(Object.entries(gezien).filter(([id]) => houd.has(id)))));
    } catch { /* quota */ }
    // Bij het opstarten niet de hele achterstand afspelen: alleen onthouden.
    if (!eersteKeer && meldingen.length) {
      const m = meldingen[0];
      meldActiviteit({
        doelen: ['planner', '/tasks'],
        label: meldingen.length > 1 ? `${m.label} (+${meldingen.length - 1})` : m.label,
        kleur: m.stand === 'wacht' ? '#fbbf24' : m.stand === 'klaar' ? '#34d399' : '#22d3ee',
      });
    }
    eersteKeer = false;
  };
  void kijk();
  setInterval(() => { void kijk(); }, POLL_MS);
}
