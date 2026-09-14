/**
 * De kaartjes bovenin en de dealtabel boven de composer.
 *
 * ## Alleen wat er staat
 *
 * Het ontwerp toont "$12.4M potential commission" en een ID als
 * "NORTHSEA-017". In de database (september 2026) heeft geen enkele deal een
 * commissiebedrag of waarde, twee hebben een percentage, en de enige codes zijn
 * DEAL-001, DEAL-002 en een paar varianten. Dus: een streepje waar niets staat,
 * een percentage als dat er is, en als ID de code -- of anders het begin van de
 * database-id, zodat je hem terugvindt. Nooit een bedrag of nummer dat iemand
 * voor echt aanziet.
 *
 * "Active" is dezelfde regel als de kaart en de backend (kaart.ts, isActief),
 * zodat het kaartje, het tabblad en de legenda hetzelfde getal tonen.
 */
import { isDealCode } from './chase';
import { isActief, type KaartDeal } from './kaart';

export type DealTab = 'actief' | 'pipeline' | 'afgerond';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Postgres numeric komt als tekst binnen; leeg of onzin is null, geen 0. */
export function getal(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function open(d: KaartDeal): boolean {
  const s = (d.stage ?? '').trim();
  return s !== 'won' && s !== 'lost';
}

function inTab(d: KaartDeal, tab: DealTab): boolean {
  if (tab === 'actief') return isActief(d);
  if (tab === 'pipeline') return open(d);
  return (d.stage ?? '').trim() === 'won';
}

const tijd = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/** De rijen van een tabblad, laatst bijgewerkt bovenaan. */
export function dealRijen(deals: readonly KaartDeal[], tab: DealTab): KaartDeal[] {
  return deals
    .filter(d => inTab(d, tab))
    .sort((a, b) => tijd(b.updated_at ?? b.created_at) - tijd(a.updated_at ?? a.created_at));
}

export function dealId(d: KaartDeal): string {
  return isDealCode(d.code) ? d.code.trim() : `#${d.id.slice(0, 6)}`;
}

export function volumeTekst(d: KaartDeal): string {
  const n = getal(d.volume_mt);
  return n === null ? '—' : `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} MT`;
}

export function geld(n: number, valuta = 'USD'): string {
  const teken = valuta === 'EUR' ? '€' : valuta === 'GBP' ? '£' : '$';
  if (Math.abs(n) >= 1e6) return `${teken}${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${teken}${Math.round(n / 1e3)}K`;
  return `${teken}${Math.round(n)}`;
}

/** Een bedrag als dat er is, anders het percentage, anders een streepje. */
export function commissieTekst(d: KaartDeal): string {
  const bedrag = getal(d.commissie_bedrag);
  if (bedrag !== null) return geld(bedrag, d.valuta ?? 'USD');
  const pct = getal(d.commissie_pct);
  return pct !== null ? `${pct}%` : '—';
}

/** "parallel_qualification_active" → "Parallel qualification active". */
export function faseLabel(d: KaartDeal): string {
  const ruw = (d.execution_state || d.stage || '').trim();
  if (!ruw) return '—';
  const t = ruw.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function tegenpartijen(d: KaartDeal): string {
  const k = d.koper?.trim();
  const l = d.leverancier?.trim();
  if (k && l) return `${l} → ${k}`;
  return l || k || '—';
}

export interface DeskTellers {
  actief: number;
  pipeline: number;
  afgerond: number;
  nieuwDezeWeek: number;
  akkoord: number;
  /** Wat er op het kaartje onder "awaiting approval" staat: codes, anders producten. */
  akkoordNamen: string[];
  geblokkeerd: number;
  /** Som van de ingevulde commissiebedragen; null als er geen enkele is. */
  commissie: number | null;
  commissieDeals: number;
}

export function deskTellers(deals: readonly KaartDeal[], nu: number): DeskTellers {
  const openDeals = deals.filter(open);
  const wachten = openDeals.filter(d => d.akkoord_nodig);
  const bedragen = openDeals.map(d => getal(d.commissie_bedrag)).filter((n): n is number => n !== null);
  return {
    actief: deals.filter(isActief).length,
    pipeline: openDeals.length,
    afgerond: deals.filter(d => inTab(d, 'afgerond')).length,
    nieuwDezeWeek: deals.filter(d => isActief(d) && nu - tijd(d.created_at) < WEEK_MS).length,
    akkoord: wachten.length,
    akkoordNamen: wachten.map(d => (isDealCode(d.code) ? d.code.trim() : d.product?.trim() || dealId(d))),
    geblokkeerd: openDeals.filter(d => d.geblokkeerd).length,
    commissie: bedragen.length ? bedragen.reduce((a, b) => a + b, 0) : null,
    commissieDeals: bedragen.length,
  };
}
