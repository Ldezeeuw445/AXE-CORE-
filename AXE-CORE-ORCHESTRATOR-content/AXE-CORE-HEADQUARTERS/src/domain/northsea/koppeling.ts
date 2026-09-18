/**
 * Deterministische communicatie→deal associatie, dezelfde voorrang als
 * supabase/northsea/functions/_shared/mapping.ts (P0.7), plus twee veilige
 * extra’s die die mapping op inbound al zou doen als de rij toen was gelopen:
 * unieke commerciële termen, en een bestaande thread (onderwerp + tegenpartij).
 *
 * Dit bestand SCHRIJFT NIETS. Een hoge score is geen opportunity_id-write.
 * Meerdere even sterke kandidaten blijven AMBIGUOUS.
 */
import type { Bericht, DealDetail } from '@/domain/northsea/tabs/typen';

export type KoppelKlasse = 'LINKED' | 'HIGH_CONFIDENCE_MATCH' | 'AMBIGUOUS' | 'UNLINKED';

export interface KoppelKandidaat {
  id: string;
  label: string;
  waarom: string;
}

export interface KoppelOordeel {
  klasse: KoppelKlasse;
  basis: string;
  dealId: string | null;
  kandidaten: KoppelKandidaat[];
  reden: string;
  /** False: test, intern, platform/spam — geen commerciële dealactie. */
  commercieel: boolean;
}

const CLOSED = new Set(['lost', 'won']);
const PLATFORM = /tradewheel|whatsapp-verificatie|verificatiecode|empty pawn shop|let’s get started|lets get started|kaicalls|call\.completed/i;
const INTERN = /trade center: (automation heartbeat|system check)|source qualification:/i;
const DSN = /undelivered mail|mailer-daemon|delivery status notification/i;
const STEDEN = /\b(Qinzhou|Hamburg|Jebel Ali|Rotterdam|Antwerp|Shanghai|Busan|Genoa|Dubai)\b/i;

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function threadMessageIds(inReplyTo: unknown, references: unknown): string[] {
  const tekst = [inReplyTo, references]
    .map(v => (Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : ''))
    .join(' ');
  const ids = [...tekst.matchAll(/<([^<>\s]+)>/g)].map(m => m[1].trim().toLowerCase());
  return [...new Set(ids)].slice(0, 50);
}

export function normalizeMessageId(id: unknown): string | null {
  if (typeof id !== 'string' || !id.trim()) return null;
  return id.trim().replace(/^<|>$/g, '').toLowerCase();
}

export function normOnderwerp(s: string | null | undefined): string {
  return (s ?? '').replace(/^(re|fw|fwd)\s*:\s*/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isCommercieelBericht(b: Pick<Bericht, 'test' | 'richting' | 'kanaal' | 'onderwerp' | 'intelligentie'>): boolean {
  if (b.test) return false;
  if (norm(b.richting) === 'internal') return false;
  const onderwerp = b.onderwerp ?? '';
  if (INTERN.test(onderwerp) || PLATFORM.test(onderwerp) || DSN.test(onderwerp)) return false;
  const klasse = norm(b.intelligentie?.classificatie);
  if (klasse === 'spam' || klasse === 'internal') return false;
  return true;
}

function dealLabel(d: DealDetail): string {
  const code = d.code?.trim();
  const prod = d.aanbod?.product || d.vraag?.product || d.aanbod?.commodity || d.vraag?.commodity;
  const dest = d.vraag?.bestemming;
  const kop = code && !['high', 'medium', 'low', 'secondary'].includes(code.toLowerCase()) ? code : null;
  return [kop, prod, dest].filter(Boolean).join(' · ') || d.id.slice(0, 8);
}

function kandidaat(d: DealDetail, waarom: string): KoppelKandidaat {
  return { id: d.id, label: dealLabel(d), waarom };
}

function openDealsVanBedrijf(deals: readonly DealDetail[], bedrijfId: string | null | undefined): DealDetail[] {
  if (!bedrijfId) return [];
  return deals.filter(d => {
    if (CLOSED.has(norm(d.stage))) return false;
    return d.koper?.id === bedrijfId || d.leverancier?.id === bedrijfId;
  });
}

function qty(d: DealDetail): number | null {
  const v = d.vraag?.volume_mt ?? d.aanbod?.volume_mt;
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function dest(d: DealDetail): string {
  return norm(d.vraag?.bestemming);
}

function incoterm(d: DealDetail): string {
  return norm(d.vraag?.incoterm || d.aanbod?.incoterm);
}

/** Termen die het bericht zelf noemt — geen afgeleide dealstaat. */
export function berichtTermen(b: Pick<Bericht, 'onderwerp' | 'tekst' | 'intelligentie'>): { qty: number | null; incoterm: string | null; dest: string | null } {
  const intel = b.intelligentie?.engine?.termen ?? (
    b.intelligentie?.termen && typeof b.intelligentie.termen === 'object' && !Array.isArray(b.intelligentie.termen)
      ? b.intelligentie.termen as Record<string, unknown>
      : null
  );
  const intelQty = intel ? Number(intel.quantity_mt) : NaN;
  const ruw = `${b.onderwerp ?? ''}\n${b.tekst ?? ''}`;
  const q = ruw.match(/(\d{1,6}(?:[.,]\d+)?)\s*(?:mt|metric tons?|tonnes?)/i);
  const inc = ruw.match(/\b(CIF|FOB|CFR|DAP|DDP|EXW|FCA)\b/i)?.[1] ?? null;
  const plaats = ruw.match(STEDEN)?.[1] ?? null;
  return {
    qty: Number.isFinite(intelQty) ? intelQty : (q ? Number(q[1].replace(',', '.')) : null),
    incoterm: inc,
    dest: plaats,
  };
}

function uniekeTermMatch(b: Bericht, bedrijfDeals: readonly DealDetail[]): DealDetail | null {
  if (bedrijfDeals.length < 2) return null;
  const t = berichtTermen(b);
  const destHits = t.dest
    ? bedrijfDeals.filter(d => dest(d).includes(norm(t.dest)))
    : [];
  if (t.dest && destHits.length === 1) return destHits[0];
  const qtyHits = t.qty != null
    ? bedrijfDeals.filter(d => qty(d) === t.qty)
    : [];
  if (t.qty != null && t.incoterm && qtyHits.length === 1 && incoterm(qtyHits[0]).includes(norm(t.incoterm))) {
    return qtyHits[0];
  }
  return null;
}

function opgeslagenKandidaten(b: Bericht): string[] {
  const ruw = b.koppeling_kandidaten;
  if (!Array.isArray(ruw)) return [];
  return [...new Set(ruw.map(x => String(x)).filter(Boolean))];
}

function rfcDeals(b: Bericht, corpus: readonly Bericht[]): string[] {
  const zoek = new Set(threadMessageIds(b.in_reply_to, b.referenties));
  const eigen = normalizeMessageId(b.rfc_id);
  if (eigen) zoek.add(eigen);
  if (zoek.size === 0) return [];
  const hits = new Set<string>();
  for (const x of corpus) {
    if (x.id === b.id || !x.deal_id) continue;
    const rfc = normalizeMessageId(x.rfc_id);
    if (rfc && zoek.has(rfc)) hits.add(x.deal_id);
  }
  return [...hits];
}

function onderwerpDeals(b: Bericht, corpus: readonly Bericht[]): string[] {
  const onderwerp = normOnderwerp(b.onderwerp);
  if (!onderwerp) return [];
  const hits = new Set<string>();
  for (const x of corpus) {
    if (x.id === b.id || !x.deal_id) continue;
    if (normOnderwerp(x.onderwerp) !== onderwerp) continue;
    const zelfdeMail = !!b.contact_email && norm(x.contact_email) === norm(b.contact_email);
    const zelfdeCo = !!b.bedrijf_id && x.bedrijf_id === b.bedrijf_id;
    if (zelfdeMail || zelfdeCo) hits.add(x.deal_id);
  }
  return [...hits];
}

function geschiedenisDeals(b: Bericht, corpus: readonly Bericht[]): string[] {
  const hits = new Set<string>();
  for (const x of corpus) {
    if (x.id === b.id || !x.deal_id) continue;
    const zelfdeMail = !!b.contact_email && norm(x.contact_email) === norm(b.contact_email);
    const zelfdeCo = !!b.bedrijf_id && x.bedrijf_id === b.bedrijf_id;
    if (zelfdeMail || zelfdeCo) hits.add(x.deal_id);
  }
  return [...hits];
}

function hoog(
  basis: string, deal: DealDetail, waarom: string, reden: string, commercieel: boolean,
): KoppelOordeel {
  return {
    klasse: 'HIGH_CONFIDENCE_MATCH', basis, dealId: deal.id,
    kandidaten: [kandidaat(deal, waarom)], reden, commercieel,
  };
}

function dubbel(
  basis: string, deals: readonly DealDetail[], waarom: string, reden: string, commercieel: boolean,
): KoppelOordeel {
  return {
    klasse: 'AMBIGUOUS', basis, dealId: null,
    kandidaten: deals.map(d => kandidaat(d, waarom)), reden, commercieel,
  };
}

/**
 * Classificeer één bericht tegen de open deals en de rest van de inbox.
 * Geen write, geen gok.
 */
export function beoordeelKoppeling(
  b: Bericht,
  deals: readonly DealDetail[],
  corpus: readonly Bericht[] = [],
): KoppelOordeel {
  const commercieel = isCommercieelBericht(b);
  const dealVan = (id: string | null | undefined) => deals.find(d => d.id === id) ?? null;

  if (b.deal_id) {
    const d = dealVan(b.deal_id);
    return {
      klasse: 'LINKED', basis: b.koppeling_basis || 'stored_opportunity_id', dealId: b.deal_id,
      kandidaten: d ? [kandidaat(d, 'Already stored on the communication row')] : [],
      reden: 'Linked in the database.', commercieel,
    };
  }

  if (!commercieel) {
    const reden = b.test ? 'Synthetic / test record — never drives deal state.'
      : norm(b.richting) === 'internal' || INTERN.test(b.onderwerp ?? '') ? 'Internal system note, not a counterparty thread.'
        : DSN.test(b.onderwerp ?? '') ? 'Delivery-status notice, not a commercial reply.'
          : 'Platform or non-commercial mail. Not a deal thread.';
    return { klasse: 'UNLINKED', basis: b.koppeling_basis || 'non_commercial', dealId: null, kandidaten: [], reden, commercieel: false };
  }

  const bedrijfDeals = openDealsVanBedrijf(deals, b.bedrijf_id);
  const rfc = rfcDeals(b, corpus).map(dealVan).filter((d): d is DealDetail => !!d);
  if (rfc.length === 1) {
    return hoog('thread', rfc[0], 'In-Reply-To / References match a message already on this deal',
      'RFC thread identifiers point to exactly one stored deal. Displayed only — not written.', commercieel);
  }
  if (rfc.length > 1) {
    return dubbel('thread_conflict', rfc, 'RFC thread identifier also appears on this deal',
      'Thread identifiers point to more than one deal. Left unlinked.', commercieel);
  }

  const termenDeal = uniekeTermMatch(b, bedrijfDeals);
  if (termenDeal) {
    return hoog('commercial_terms_unique', termenDeal,
      'Unique quantity / destination / Incoterm among this counterparty’s open deals',
      'Several open deals for this counterparty; the message names terms that fit exactly one. Not written.',
      commercieel);
  }

  if (bedrijfDeals.length === 1) {
    return hoog('counterparty_single_open_opportunity', bedrijfDeals[0],
      'Only open opportunity for this counterparty',
      'P0.7 rule: known counterparty with exactly one open opportunity. Displayed only — not written.',
      commercieel);
  }

  const onderwerp = onderwerpDeals(b, corpus).map(dealVan).filter((d): d is DealDetail => !!d);
  if (onderwerp.length === 1) {
    return hoog('thread_subject_counterparty', onderwerp[0],
      'Same counterparty and same subject as a message already stored on this deal',
      'Existing communication history on this exact thread. Not written.', commercieel);
  }
  if (onderwerp.length > 1) {
    return dubbel('thread_subject_conflict', onderwerp, 'Same subject and counterparty',
      'The same subject exists on more than one deal. Left unlinked.', commercieel);
  }

  const hist = geschiedenisDeals(b, corpus).map(dealVan).filter((d): d is DealDetail => !!d);
  if (hist.length === 1 && bedrijfDeals.length <= 1) {
    return hoog('communication_history', hist[0],
      'Only stored deal already linked to this counterparty or address',
      'Existing communication history names one deal, and this counterparty is not on several open opportunities. Not written.',
      commercieel);
  }

  if (bedrijfDeals.length > 1) {
    return dubbel(
      b.koppeling_basis || 'counterparty_multiple_open_opportunities',
      bedrijfDeals,
      'Same counterparty, more than one open opportunity',
      'Same counterparty has several open opportunities. No unique thread, RFC id or commercial term. Left unlinked.',
      commercieel,
    );
  }

  if (hist.length > 1) {
    return dubbel('communication_history_conflict', hist, 'Earlier messages for this counterparty',
      'Earlier messages for this counterparty sit on more than one deal. Left unlinked.', commercieel);
  }

  const opgeslagen = opgeslagenKandidaten(b).map(dealVan).filter((d): d is DealDetail => !!d);
  if (opgeslagen.length > 1 || norm(b.koppeling) === 'ambiguous') {
    return dubbel(
      b.koppeling_basis || 'ambiguous',
      opgeslagen.length ? opgeslagen : bedrijfDeals,
      'Inbound mapping stored these candidates without choosing',
      'Inbound mapping left this ambiguous. Candidates are shown; nothing was written.',
      commercieel,
    );
  }

  if (!b.bedrijf_id) {
    return { klasse: 'UNLINKED', basis: 'unknown_counterparty', dealId: null, kandidaten: [], reden: 'No company or contact on the row.', commercieel };
  }
  return {
    klasse: 'UNLINKED', basis: b.koppeling_basis || 'counterparty_no_open_opportunity', dealId: null, kandidaten: [],
    reden: 'Company is recorded, but it is not buyer or supplier on any open opportunity, and no existing thread points to one deal.',
    commercieel,
  };
}

export function koppelTellers(oordelen: readonly KoppelOordeel[]): Record<KoppelKlasse, number> {
  const t: Record<KoppelKlasse, number> = { LINKED: 0, HIGH_CONFIDENCE_MATCH: 0, AMBIGUOUS: 0, UNLINKED: 0 };
  for (const o of oordelen) t[o.klasse] += 1;
  return t;
}

export function koppelLabel(klasse: KoppelKlasse): string {
  return klasse === 'LINKED' ? 'Linked'
    : klasse === 'HIGH_CONFIDENCE_MATCH' ? 'High-confidence match'
      : klasse === 'AMBIGUOUS' ? 'Ambiguous'
        : 'Unlinked';
}

export function koppelToon(klasse: KoppelKlasse): 'groen' | 'blauw' | 'oranje' | 'grijs' {
  return klasse === 'LINKED' ? 'groen'
    : klasse === 'HIGH_CONFIDENCE_MATCH' ? 'blauw'
      : klasse === 'AMBIGUOUS' ? 'oranje'
        : 'grijs';
}

/** Berichten die bij deze deal horen in de database of als enige hoge/dubbelzinnige kandidaat. */
export function berichtHoortBijDeal(b: Bericht, dealId: string, oordeel: KoppelOordeel | undefined): boolean {
  if (b.deal_id === dealId) return true;
  if (!oordeel) return false;
  if (oordeel.dealId === dealId) return true;
  return oordeel.kandidaten.some(k => k.id === dealId);
}

export function isVolgendeActieVerlopen(volgendeOp: string | null | undefined, nu: number): boolean {
  if (!volgendeOp) return false;
  const t = Date.parse(volgendeOp);
  return Number.isFinite(t) && t < nu;
}
