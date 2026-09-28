/**
 * P1 Communication Engine: hoe de GTC zijn uitkomsten toont.
 *
 * De engine (backend/northsea_mcp/northsea_mcp/engine_rules.py) is deterministisch
 * en schrijft codes; dit bestand vertaalt die codes naar kleur en woorden. Geen
 * nieuwe logica: een onbekende code blijft zichtbaar als hij is, grijs.
 */
import type { Toon } from './tabs/status';

const BLOKKADE_TOON: Record<string, Toon> = {
  synthetic: 'grijs',
  closed: 'grijs',
  do_not_contact: 'rood',
  contact_policy_review: 'oranje',
  channel_bounced: 'rood',
  approval_pending: 'oranje',
  reply_needed: 'oranje',
  awaiting_reply_overdue: 'geel',
  awaiting_reply: 'blauw',
  seller_unqualified: 'geel',
  buyer_unqualified: 'geel',
  protection_missing: 'oranje',
  ready_for_review: 'groen',
};

export function blokkadeToon(code: string | null | undefined): Toon {
  return (code && BLOKKADE_TOON[code]) || 'grijs';
}

const EIGENAAR: Record<string, string> = { luka: 'Luka', axe: 'AXE', counterparty: 'Counterparty', none: '—' };

export function eigenaarLabel(e: string | null | undefined): string {
  return (e && EIGENAAR[e]) || (e?.trim() || '—');
}

const TERM_LABEL: Record<string, string> = {
  commodity: 'Commodity', grade: 'Grade', purity_pct: 'Purity %', quantity_mt: 'Quantity (MT)', quantity_text: 'Quantity',
  recurring: 'Recurring', origin: 'Origin', destination_or_port: 'Port / destination', incoterms: 'Incoterms',
  payment_instruments: 'Payment', pricing_basis: 'Pricing basis', prices: 'Prices', validity: 'Validity', timing: 'Timing',
  authority_claims: 'Authority claimed', documents_mentioned: 'Documents mentioned',
};

function waardeTekst(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) {
    return v.map(x => (x && typeof x === 'object'
      ? [(x as Record<string, unknown>).currency, (x as Record<string, unknown>).value, (x as Record<string, unknown>).unit]
          .filter(d => d !== undefined && d !== null && d !== '').join(' ') || JSON.stringify(x)
      : String(x))).join(', ');
  }
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Alleen termen die de engine echt vond (null/leeg valt weg), in vaste volgorde. */
export function termenRegels(termen: Record<string, unknown> | null | undefined): string[] {
  if (!termen) return [];
  const volgorde = [...Object.keys(TERM_LABEL), ...Object.keys(termen).filter(k => !(k in TERM_LABEL)).sort()];
  return volgorde
    .filter(k => k in termen)
    .map(k => [k, termen[k]] as const)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${TERM_LABEL[k] ?? k}: ${waardeTekst(v)}`);
}

/**
 * Wie maakte het concept en wie keurde het goed. Een akkoord zonder menselijke
 * herkomst heet hier nooit "approved by Luka": de tekst volgt de kolommen.
 */
export function conceptHerkomst(c: { gemaakt_door?: string | null; akkoord_door_soort?: string | null; akkoord_door?: string | null }): string {
  const delen: string[] = [];
  if (c.gemaakt_door) delen.push(c.gemaakt_door === 'northsea-engine' ? 'Prepared by the engine' : `Prepared by ${c.gemaakt_door}`);
  if (c.akkoord_door_soort === 'human') delen.push(`approved by ${c.akkoord_door || 'a human (name not recorded)'}`);
  else if (c.akkoord_door_soort) delen.push(`approval actor: ${c.akkoord_door_soort}`);
  return delen.join(' · ');
}
