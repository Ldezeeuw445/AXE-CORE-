/**
 * Geheugen in het gesprek, zonder dat het gesprek erop wacht.
 *
 * Twee lagen. Het profiel (belangrijkste + recente herinneringen) wordt op de
 * achtergrond warm gehouden en is er dus altijd, in 0 ms. Zoeken op wat Luka nu
 * zegt krijgt een harde grens; wat niet op tijd binnen is, valt weg voor deze
 * beurt. Budget 0 (chatLatency.ts) betekende dat het geheugen er nooit bij zat.
 */
import { bouwGeheugenBlok } from '@/domain/memory/geheugenBlok';
import {
  loadRagMemories,
  loadRecenteHerinneringen,
  searchRagMemories,
} from '@/infrastructure/persistence/ragMemoryService';

export const ZOEK_BUDGET_MS = 600;
const VERS_MS = 5 * 60_000;

let profiel: string[] = [];
let recent: string[] = [];
let geladenOp = 0;
let laden: Promise<void> | null = null;

function ververs(): Promise<void> {
  if (laden) return laden;
  laden = (async () => {
    const [p, r] = await Promise.all([
      loadRagMemories('user', 7, 20).catch(() => []),
      loadRecenteHerinneringen(12).catch(() => []),
    ]);
    if (p.length) profiel = p.map((m) => m.content);
    if (r.length) recent = r.map((m) => m.content);
    geladenOp = Date.now();
  })().finally(() => { laden = null; });
  return laden;
}

/** Bij het opstarten aanroepen, zodat de eerste beurt al een profiel heeft. */
export function warmGeheugen(): void {
  void ververs();
}

/** Wat net in dit gesprek onthouden is, telt meteen mee. */
export function onthoudInGesprek(inhoud: string): void {
  recent = [inhoud, ...recent.filter((r) => r !== inhoud)].slice(0, 20);
}

function binnen<T>(p: Promise<T>, ms: number, anders: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => { setTimeout(() => r(anders), ms); })]);
}

export async function geheugenVoorBeurt(tekst: string, budgetMs = ZOEK_BUDGET_MS): Promise<string> {
  if (Date.now() - geladenOp > VERS_MS) void ververs();
  const relevant = await binnen(
    searchRagMemories(tekst, 6).then((ms) => ms.map((m) => m.content)).catch(() => [] as string[]),
    budgetMs,
    [] as string[],
  );
  return bouwGeheugenBlok(relevant, recent, profiel);
}
