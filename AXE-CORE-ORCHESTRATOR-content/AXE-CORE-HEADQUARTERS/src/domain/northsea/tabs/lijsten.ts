/**
 * Groeperen, filteren en tellen voor de NorthSea-tabbladen.
 *
 * ## De pipelinekolommen
 *
 * Het voorbeeld heeft "New Opportunity → Qualifying → Matching → Verification →
 * Negotiation → Due Diligence → Closing". Die fases bestaan zo niet in AXE
 * Commodities. Wat er wél staat (september 2026) is `stage` (53× identified,
 * 2× verifying) en een fijnere `execution_state` (matched 30, qualifying 18,
 * discovered 2, awaiting_supplier_reply, buyer_qualification_needed,
 * seller_qualification_requested, seller_lc_terms_pending, commercial_mismatch).
 * De kolommen volgen die echte waarden. Een onbekende waarde valt niet weg maar
 * komt in de kolom die bij zijn `stage` hoort.
 */
import { getal } from '../desk';
import type { Bedrijf, Bericht, PipelineDeal, Telling } from './typen';
import { bezorgBadge, type Toon } from './status';

export type KolomId = 'nieuw' | 'gematcht' | 'kwalificatie' | 'wacht' | 'voorwaarden' | 'geblokkeerd' | 'afronding';

export const PIPELINE_KOLOMMEN: ReadonlyArray<{ id: KolomId; label: string; toon: Toon; uitleg: string }> = [
  { id: 'nieuw', label: 'New', toon: 'blauw', uitleg: 'Discovered or identified, not matched yet.' },
  { id: 'gematcht', label: 'Matched', toon: 'geel', uitleg: 'Buyer requirement and supplier offer matched; not in qualification.' },
  { id: 'kwalificatie', label: 'Qualifying', toon: 'blauw', uitleg: 'Buyer or seller qualification in progress.' },
  { id: 'wacht', label: 'Awaiting reply', toon: 'geel', uitleg: 'Waiting on a counterparty.' },
  { id: 'voorwaarden', label: 'Terms', toon: 'oranje', uitleg: 'Commercial or payment terms being settled.' },
  { id: 'geblokkeerd', label: 'Blocked', toon: 'rood', uitleg: 'A blocker or commercial mismatch stops progress.' },
  { id: 'afronding', label: 'Closing', toon: 'groen', uitleg: 'Introduced, negotiating, contracting, shipping or won.' },
];

const UITVOERING_KOLOM: Record<string, KolomId> = {
  discovered: 'nieuw',
  matched: 'gematcht',
  qualifying: 'kwalificatie',
  buyer_qualification_needed: 'kwalificatie',
  seller_qualification_requested: 'kwalificatie',
  parallel_qualification_active: 'kwalificatie',
  awaiting_supplier_reply: 'wacht',
  awaiting_buyer_reply: 'wacht',
  seller_lc_terms_pending: 'voorwaarden',
  commercial_mismatch: 'geblokkeerd',
};

const STAGE_KOLOM: Record<string, KolomId> = {
  identified: 'nieuw',
  verifying: 'kwalificatie',
  qualified: 'kwalificatie',
  contacted: 'wacht',
  engaged: 'wacht',
  matching: 'gematcht',
  introduced: 'afronding',
  negotiating: 'afronding',
  contracting: 'afronding',
  shipment: 'afronding',
  commission_due: 'afronding',
  won: 'afronding',
};

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** De kolom die een deal zou hebben als er geen blokkade was.
 *
 * Nodig omdat een blokkade in `pipelineKolom` alles overstemt: alle 18 deals die
 * in kwalificatie zitten zijn ook geblokkeerd, dus de kolom Qualifying staat op
 * 0 terwijl Reports er 18 telt. Twee waarheden over dezelfde deals. Hiermee kan
 * een tegel zeggen hoeveel er onder Blocked staan in plaats van ze te verzwijgen. */
export function kolomZonderBlokkade(d: Pick<PipelineDeal, 'stage' | 'execution_state'>): KolomId {
  const stage = norm(d.stage);
  // Latere fases winnen van een achtergebleven uitvoeringsstatus.
  if (['introduced', 'negotiating', 'contracting', 'shipment', 'commission_due', 'won'].includes(stage)) return 'afronding';
  return UITVOERING_KOLOM[norm(d.execution_state)] ?? STAGE_KOLOM[stage] ?? 'nieuw';
}

export function pipelineKolom(d: Pick<PipelineDeal, 'stage' | 'execution_state' | 'geblokkeerd'>): KolomId {
  if (d.geblokkeerd) return 'geblokkeerd';
  return kolomZonderBlokkade(d);
}

/** Hoeveel deals in deze kolom zouden staan, maar onder Blocked staan. */
export function geblokkeerdIn(
  deals: readonly Pick<PipelineDeal, 'stage' | 'execution_state' | 'geblokkeerd'>[],
  kolom: KolomId,
): number {
  return deals.filter(d => d.geblokkeerd && kolomZonderBlokkade(d) === kolom).length;
}

const tijd = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

export function groepeerPipeline(deals: readonly PipelineDeal[]): Record<KolomId, PipelineDeal[]> {
  const uit = Object.fromEntries(PIPELINE_KOLOMMEN.map(k => [k.id, [] as PipelineDeal[]])) as Record<KolomId, PipelineDeal[]>;
  for (const d of deals) {
    if (norm(d.stage) === 'lost') continue;
    uit[pipelineKolom(d)].push(d);
  }
  for (const k of Object.keys(uit) as KolomId[]) {
    uit[k].sort((a, b) => tijd(b.updated_at ?? b.created_at) - tijd(a.updated_at ?? a.created_at));
  }
  return uit;
}

/** Som van ingevulde volumes; null als er geen enkel is (dan toont het scherm een streepje). */
export function volumeSom(deals: ReadonlyArray<{ volume_mt?: number | string | null }>): number | null {
  const n = deals.map(d => getal(d.volume_mt)).filter((x): x is number => x !== null);
  return n.length ? n.reduce((a, b) => a + b, 0) : null;
}

/** Hoofdletterongevoelig zoeken in een paar velden. Leeg zoekwoord past altijd. */
export function past(zoek: string, ...velden: Array<string | null | undefined>): boolean {
  const q = norm(zoek);
  if (!q) return true;
  return velden.some(v => norm(v).includes(q));
}

/** Tellen per sleutel, grootste eerst; leeg of null wordt "(unknown)". */
export function tel<T>(items: readonly T[], sleutel: (x: T) => string | null | undefined): Telling[] {
  const m = new Map<string, number>();
  for (const x of items) {
    const k = (sleutel(x) ?? '').trim() || '(unknown)';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([k, aantal]) => ({ sleutel: k, aantal })).sort((a, b) => b.aantal - a.aantal || a.sleutel.localeCompare(b.sleutel));
}

export interface BedrijfFilter {
  zoek: string;
  soort: string;       // 'alle' of een company_type
  verificatie: string; // 'alle' of een verification_status
}

export function filterBedrijven(bedrijven: readonly Bedrijf[], f: BedrijfFilter): Bedrijf[] {
  return bedrijven.filter(b =>
    (f.soort === 'alle' || norm(b.soort) === f.soort)
    && (f.verificatie === 'alle' || norm(b.verificatie) === f.verificatie)
    && past(f.zoek, b.naam, b.land, b.stad, (b.commodities ?? []).join(' '), b.website),
  );
}

export type BerichtFilter = 'alle' | 'email' | 'telefoon' | 'intern' | 'actie' | 'inkomend' | 'uitgaand' | 'niet_bezorgd' | 'akkoord';

/** Heeft dit bericht iets van Luka nodig: een concept dat wacht, of intelligentie die om akkoord vraagt. */
export function vraagtActie(b: Bericht): boolean {
  if ((b.concepten ?? []).some(c => !c.sent_at && norm(c.akkoord) === 'pending')) return true;
  return norm(b.richting) === 'inbound' && b.intelligentie?.akkoord_nodig === true && norm(b.intelligentie?.status) !== 'handled';
}

export function nietBezorgd(b: Bericht): boolean {
  return bezorgBadge(b.bezorging)?.toon === 'rood';
}

export function wachtOpAkkoord(b: Bericht): boolean {
  if ((b.concepten ?? []).some(c => !c.sent_at && norm(c.akkoord) === 'pending')) return true;
  return b.intelligentie?.akkoord_nodig === true && norm(b.intelligentie?.status) !== 'handled';
}

export function filterBerichten(berichten: readonly Bericht[], filter: BerichtFilter, zoek: string): Bericht[] {
  return berichten.filter(b => {
    const kanaal = norm(b.kanaal);
    const richting = norm(b.richting);
    const inFilter =
      filter === 'alle' ? true
        : filter === 'email' ? kanaal === 'email'
          : filter === 'telefoon' ? kanaal === 'phone'
            : filter === 'intern' ? richting === 'internal'
              : filter === 'inkomend' ? richting === 'inbound'
                : filter === 'uitgaand' ? richting === 'outbound'
                  : filter === 'niet_bezorgd' ? nietBezorgd(b)
                    : filter === 'akkoord' ? wachtOpAkkoord(b)
                      : vraagtActie(b);
    return inFilter && past(zoek, b.onderwerp, b.bedrijf, b.contact, b.contact_email, b.deal_code, b.tekst);
  });
}

/**
 * Groepeer berichten tot één gesprek: dezelfde deal, anders hetzelfde adres,
 * anders hetzelfde bedrijf. Losse rijen zonder koppeling blijven alleen.
 */
export function threadSleutel(b: Pick<Bericht, 'id' | 'deal_id' | 'contact_email' | 'bedrijf_id'>): string {
  if (b.deal_id) return `deal:${b.deal_id}`;
  const mail = (b.contact_email ?? '').trim().toLowerCase();
  if (mail) return `mail:${mail}`;
  if (b.bedrijf_id) return `co:${b.bedrijf_id}`;
  return `msg:${b.id}`;
}

export interface BerichtThread {
  sleutel: string;
  berichten: Bericht[];
  laatste: Bericht;
}

export function groepeerBerichten(berichten: readonly Bericht[]): BerichtThread[] {
  const m = new Map<string, Bericht[]>();
  for (const b of berichten) {
    const k = threadSleutel(b);
    const lijst = m.get(k);
    if (lijst) lijst.push(b);
    else m.set(k, [b]);
  }
  const threads: BerichtThread[] = [];
  for (const [sleutel, lijst] of m) {
    lijst.sort((a, b) => tijd(b.occurred_at) - tijd(a.occurred_at));
    threads.push({ sleutel, berichten: lijst, laatste: lijst[0] });
  }
  threads.sort((a, b) => tijd(b.laatste.occurred_at) - tijd(a.laatste.occurred_at));
  return threads;
}

/** Een lijst die de backend als JSON-waarde stuurt (jsonb-array of losse tekst) als strings. */
export function alsLijst(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map(x => (typeof x === 'string' ? x : x && typeof x === 'object' ? JSON.stringify(x) : String(x))).filter(s => s.trim() !== '');
  }
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  if (v && typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, w]) => `${k}: ${typeof w === 'string' ? w : JSON.stringify(w)}`);
  return [];
}
