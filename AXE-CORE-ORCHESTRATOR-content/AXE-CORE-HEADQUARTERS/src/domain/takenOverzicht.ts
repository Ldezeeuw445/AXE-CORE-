/**
 * Het Taken-overzicht in gewone woorden: wat wacht op jou, wat loopt (en bij
 * wie), wat is vandaag klaar. Plus de planner-log zonder herhaling: drie keer
 * "Build next step: AXON Memory" is één regel met ×3.
 *
 * Puur: geen React, geen fetch. Alleen echte rijen gaan erin; niets wordt
 * verzonnen om een sectie te vullen.
 */

export type TaakStand = 'todo' | 'in-progress' | 'done' | 'blocked';

/** Status in gewoon Nederlands, één woordenlijst voor de hele tab. */
export const STATUS_NL: Record<TaakStand, string> = {
  todo: 'Open',
  'in-progress': 'Bezig',
  done: 'Klaar',
  blocked: 'Wacht op jou',
};

/** Planner/kernel-status (completed, running, …) naar gewone taal. */
export function plannerStatusNL(status: string, goedkeuringNodig = false): string {
  switch (status) {
    case 'completed': case 'done': return 'Klaar';
    case 'running': case 'leased': case 'in_progress': return 'Bezig';
    case 'failed': return 'Mislukt';
    case 'cancelled': case 'rejected': return 'Afgewezen';
    default: return goedkeuringNodig ? 'Wacht op jou' : 'Gepland';
  }
}

export interface OverzichtTaak {
  id: string;
  title: string;
  status: TaakStand;
  assignee: string;
  createdAt: number;
  /** Wanneer hij klaar ging; ontbreekt dan telt hij niet als "vandaag". */
  klaarOp?: number;
}

export interface Secties<T extends OverzichtTaak> {
  wacht: T[];
  bezig: T[];
  klaarVandaag: T[];
}

function zelfdeDag(a: number, b: number): boolean {
  const x = new Date(a); const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export function verdeelSecties<T extends OverzichtTaak>(taken: T[], nu = Date.now()): Secties<T> {
  const nieuwst = (a: T, b: T) => (b.klaarOp ?? b.createdAt) - (a.klaarOp ?? a.createdAt);
  return {
    wacht: taken.filter((t) => t.status === 'blocked').sort(nieuwst),
    bezig: taken.filter((t) => t.status === 'in-progress').sort(nieuwst),
    klaarVandaag: taken.filter((t) => t.status === 'done' && t.klaarOp != null && zelfdeDag(t.klaarOp, nu)).sort(nieuwst),
  };
}

/** Wie er bezig zijn, met hoeveel: "Code Agent (2), AXE Core". */
export function wieBezig(bezig: OverzichtTaak[]): string {
  const tel = new Map<string, number>();
  for (const t of bezig) tel.set(t.assignee || 'onbekend', (tel.get(t.assignee || 'onbekend') ?? 0) + 1);
  return [...tel].map(([w, n]) => (n > 1 ? `${w} (${n})` : w)).join(', ');
}

export interface PlannerRegel {
  id: string;
  title: string;
  status: string;
  created_at: string;
  metadata?: { app?: string; goedkeuring?: string } | null;
}

export interface PlannerGroep<T extends PlannerRegel> {
  sleutel: string;
  /** De nieuwste van de groep; die wordt getoond. */
  laatste: T;
  aantal: number;
  ids: string[];
}

function normaal(titel: string): string {
  return titel.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Dezelfde titel, hetzelfde project, dezelfde status: één regel met teller.
 * Een taak die op jouw akkoord wacht wordt nooit samengevoegd, want daar hoort
 * één knop bij één taak.
 */
export function groepeerPlanner<T extends PlannerRegel>(taken: T[]): PlannerGroep<T>[] {
  const groepen = new Map<string, PlannerGroep<T>>();
  for (const t of taken) {
    const wacht = t.metadata?.goedkeuring === 'nodig' && t.status === 'pending';
    const sleutel = wacht ? `id:${t.id}` : `${normaal(t.title)}|${t.metadata?.app ?? 'axe_core'}|${t.status}`;
    const g = groepen.get(sleutel);
    if (!g) { groepen.set(sleutel, { sleutel, laatste: t, aantal: 1, ids: [t.id] }); continue; }
    g.aantal += 1; g.ids.push(t.id);
    if (Date.parse(t.created_at) > Date.parse(g.laatste.created_at)) g.laatste = t;
  }
  return [...groepen.values()];
}
