/**
 * De data van de tabbladen naast Live Map, precies zoals backend/axe_api/northsea.py
 * (TAB_SQL) ze teruggeeft. Veldnamen zijn de aliassen uit die queries.
 *
 * Alles is optioneel of nullable: de database heeft lege velden (geen enkele deal
 * heeft een waarde, geen enkel bedrijf is geverifieerd), en een lokale API van vóór
 * deze tabbladen stuurt het tabblad helemaal niet. Het scherm toont dan wat er is,
 * nooit een verzonnen getal.
 */

export type TabNaam =
  | 'deals' | 'pipeline' | 'tegenpartijen' | 'communicatie'
  | 'documenten' | 'bewijs' | 'automatisering' | 'rapporten' | 'werk';

type Tekst = string | null | undefined;
type Getal = number | string | null | undefined;
type Tijd = string | null | undefined;

export interface BedrijfKort {
  id?: Tekst;
  naam?: Tekst;
  land?: Tekst;
  stad?: Tekst;
  soort?: Tekst;
  verificatie?: Tekst;
}

export interface DealVraag {
  commodity?: Tekst; product?: Tekst; grade?: Tekst; zuiverheid?: Getal; volume_mt?: Getal;
  frequentie?: Tekst; incoterm?: Tekst; betaling?: Tekst; bestemming?: Tekst;
  doelprijs?: Getal; valuta?: Tekst; levering?: Tijd; status?: Tekst;
}

export interface DealAanbod {
  commodity?: Tekst; product?: Tekst; grade?: Tekst; zuiverheid?: Getal; herkomst?: Tekst;
  volume_mt?: Getal; maandcapaciteit_mt?: Getal; laadhaven?: Tekst; incoterm?: Tekst; betaling?: Tekst;
  prijsbasis?: Tekst; prijs?: Getal; valuta?: Tekst; mandaat?: Tekst; geldig_tot?: Tijd; status?: Tekst;
}

export interface DealMatch {
  score?: number | null;
  uitvoerbaar?: boolean | null;
  blokkades?: unknown;
  ontbreekt?: unknown;
  op?: Tijd;
}

export interface DealGebeurtenis {
  id: string | number;
  soort?: Tekst;
  actor?: Tekst;
  samenvatting?: Tekst;
  created_at?: Tijd;
}

export interface DealTaak {
  id: string;
  bron: 'taak' | 'actie';
  titel?: Tekst;
  soort?: Tekst;
  status?: Tekst;
  prioriteit?: number | null;
  akkoord_nodig?: boolean | null;
  due_at?: Tijd;
  fout?: Tekst;
  created_at?: Tijd;
}

/** De negen poorten uit DEAL_STATE_MACHINE.md, in volgorde. */
export const POORTEN = [
  'poort_koper', 'poort_verkoper', 'poort_commercieel', 'poort_bewijs', 'poort_bescherming',
  'poort_introductie', 'poort_transactie', 'poort_uitvoering', 'poort_afrekening',
] as const;
export type Poort = typeof POORTEN[number];

export type DealDetail = {
  id: string;
  code?: Tekst;
  stage?: Tekst;
  execution_state?: Tekst;
  gereedheid?: number | null;
  gereedheid_opbouw?: unknown;
  blokkade?: Tekst;
  volgende?: Tekst;
  volgende_op?: Tijd;
  akkoord_nodig?: boolean | null;
  akkoord_soort?: Tekst;
  kwalificatie?: Tekst;
  automatisering?: Tekst;
  wacht_sinds?: Tijd;
  opvolgingen?: number | null;
  match_score?: number | null;
  waarde?: Getal;
  valuta?: Tekst;
  commissie_soort?: Tekst;
  commissie_pct?: Getal;
  commissie_bedrag?: Getal;
  commissie_akkoord?: Tekst;
  notities?: Tekst;
  created_at?: Tijd;
  updated_at?: Tijd;
  koper?: BedrijfKort | null;
  leverancier?: BedrijfKort | null;
  vraag?: DealVraag | null;
  aanbod?: DealAanbod | null;
  match?: DealMatch | null;
  gebeurtenissen?: DealGebeurtenis[] | null;
  taken?: DealTaak[] | null;
  aantallen?: { communicatie?: number; bewijs?: number; documenten?: number; taken?: number } | null;
} & Partial<Record<Poort, boolean | null>>;

export interface PipelineDeal {
  id: string;
  code?: Tekst;
  stage?: Tekst;
  execution_state?: Tekst;
  gereedheid?: number | null;
  geblokkeerd?: boolean | null;
  akkoord_nodig?: boolean | null;
  product?: Tekst;
  commodity?: Tekst;
  volume_mt?: Getal;
  incoterm?: Tekst;
  koper?: Tekst;
  koper_land?: Tekst;
  leverancier?: Tekst;
  leverancier_land?: Tekst;
  waarde?: Getal;
  valuta?: Tekst;
  created_at?: Tijd;
  updated_at?: Tijd;
}

export interface Contact {
  id: string;
  naam?: Tekst;
  rol?: Tekst;
  email?: Tekst;
  telefoon?: Tekst;
  linkedin?: Tekst;
  primair?: boolean | null;
  verificatie?: Tekst;
}

export interface VerificatieCheck {
  id: string;
  soort?: Tekst;
  status?: Tekst;
  score_delta?: number | null;
  bron_url?: Tekst;
  notities?: Tekst;
  checked_at?: Tijd;
  gegevens?: unknown;
  bedrijf?: Tekst;
  contact?: Tekst;
}

export interface Bedrijf {
  id: string;
  naam?: Tekst;
  soort?: Tekst;
  land?: Tekst;
  stad?: Tekst;
  website?: Tekst;
  commodities?: string[] | null;
  bron_url?: Tekst;
  bron_soort?: Tekst;
  handel?: Tekst;
  verificatie_score?: number | null;
  verificatie?: Tekst;
  geverifieerd_op?: Tijd;
  notities?: Tekst;
  created_at?: Tijd;
  updated_at?: Tijd;
  contacten?: Contact[] | null;
  checks?: VerificatieCheck[] | null;
  deals?: number | null;
  laatste_contact?: Tijd;
}

export interface EmailIntelligentie {
  classificatie?: Tekst;
  intentie?: Tekst;
  urgentie?: Tekst;
  risico?: Tekst;
  score?: number | null;
  samenvatting?: Tekst;
  termen?: unknown;
  ontbreekt?: unknown;
  rode_vlaggen?: unknown;
  advies?: Tekst;
  akkoord_nodig?: boolean | null;
  status?: Tekst;
  /** P1: deterministische Communication Engine; termen zijn wat de tegenpartij zei, niet geverifieerd. */
  engine?: EngineAnalyse | null;
}

export interface EngineAnalyse {
  soort?: Tekst;
  categorieen?: string[] | null;
  termen?: Record<string, unknown> | null;
  ontbreekt?: string[] | null;
  urgentie?: Tekst;
  risico?: Tekst;
  redenen?: string[] | null;
  versie?: Tekst;
  op?: Tijd;
}

export interface Concept {
  id: string;
  onderwerp?: Tekst;
  aan?: Tekst;
  tekst?: Tekst;
  doel?: Tekst;
  akkoord?: Tekst;
  gevoelig?: boolean | null;
  sent_at?: Tijd;
  created_at?: Tijd;
  levensloop?: Tekst;
  akkoord_door_soort?: Tekst;
  akkoord_door?: Tekst;
  gemaakt_door?: Tekst;
}

export interface Bericht {
  id: string;
  richting?: Tekst;
  kanaal?: Tekst;
  onderwerp?: Tekst;
  tekst?: Tekst;
  occurred_at?: Tijd;
  bezorging?: Tekst;
  koppeling?: Tekst;
  koppeling_basis?: Tekst;
  test?: boolean | null;
  afzender?: Tekst;
  akkoord_basis?: Tekst;
  verstuurd_door?: Tekst;
  bedrijf_id?: Tekst;
  bedrijf?: Tekst;
  bedrijf_land?: Tekst;
  contact?: Tekst;
  contact_email?: Tekst;
  deal_id?: Tekst;
  deal_code?: Tekst;
  intelligentie?: EmailIntelligentie | null;
  concepten?: Concept[] | null;
}

export interface DealDocument {
  id: string;
  soort?: Tekst;
  pad?: Tekst;
  url?: Tekst;
  status?: Tekst;
  metadata?: unknown;
  created_at?: Tijd;
  updated_at?: Tijd;
  deal_id?: Tekst;
  deal_code?: Tekst;
}

/** inbound_email_attachments: de kolommen staan niet vast in de query (to_jsonb), dus los. */
export type Bijlage = Record<string, unknown> & { id?: string };

export interface Bewijs {
  id: string;
  kant?: Tekst;
  soort?: Tekst;
  bron_soort?: Tekst;
  bron?: Tekst;
  claim?: Tekst;
  verificatie?: Tekst;
  verified_at?: Tijd;
  metadata?: unknown;
  created_at?: Tijd;
  deal_id?: Tekst;
  deal_code?: Tekst;
  product?: Tekst;
}

export interface AutomatiseringsBeleid {
  auto_send_qualification?: boolean | null;
  auto_send_followups?: boolean | null;
  auto_reply_nonbinding?: boolean | null;
  auto_disclose_counterparty_identity?: boolean | null;
  auto_accept_pricing?: boolean | null;
  auto_sign_documents?: boolean | null;
  auto_change_banking?: boolean | null;
  followup_interval_hours?: number | null;
  max_auto_followups?: number | null;
  operational_mailbox?: Tekst;
  updated_at?: Tijd;
}

export interface Campagne {
  id: string;
  richting?: Tekst;
  commodity?: Tekst;
  product?: Tekst;
  gebieden?: string[] | null;
  status?: Tekst;
  prioriteit?: number | null;
  gevonden?: number | null;
  gescreend?: number | null;
  benaderd?: number | null;
  gekwalificeerd?: number | null;
  volgende?: Tekst;
  volgende_op?: Tijd;
  updated_at?: Tijd;
}

export interface Telling {
  sleutel: string;
  aantal: number;
}

/** Een open taak van de desk, zoals de Taken-tab hem leest. */
export interface NorthseaTaak {
  id: string;
  bron: 'deal_task' | 'action_queue' | string;
  titel?: Tekst;
  status?: Tekst;
  /** In AXE Commodities een getal (0-100), niet 'high'/'low'. */
  prioriteit?: Getal;
  due_at?: Tijd;
  akkoord_nodig?: boolean | null;
  created_at?: Tijd;
  deal_code?: Tekst;
  deal_id?: Tekst;
}

/** Iets van de desk dat op een moment staat: een volgende actie of een campagne. */
export interface NorthseaAgendaItem {
  id: string;
  soort: 'next_action' | 'campagne' | string;
  wanneer?: Tijd;
  titel?: Tekst;
  deal_code?: Tekst;
}

export interface TabData {
  deals: { deals: DealDetail[] };
  pipeline: { deals: PipelineDeal[] };
  tegenpartijen: { bedrijven: Bedrijf[] };
  communicatie: { berichten: Bericht[] };
  documenten: { documenten: DealDocument[]; bijlagen: Bijlage[] };
  bewijs: { bewijs: Bewijs[]; checks: VerificatieCheck[] };
  automatisering: {
    beleid: AutomatiseringsBeleid | null;
    gebeurtenissen: Array<DealGebeurtenis & { deal_code?: Tekst }>;
    deal_automatisering: Array<{ status: string; aantal: number; laatst?: Tijd }>;
    campagnes: Campagne[];
    /** P1: echte engine-runs uit northsea_audit_events; ontbreekt zolang de migratie niet draait. */
    engine?: {
      runs: Array<{ op: string; samenvatting?: Record<string, number> | null; fouten?: string[] | null }>;
      followups: Array<{ status: string; aantal: number; eerstvolgende?: Tijd }>;
      chase_open: number;
      blokkades: Array<{ code: string; eigenaar: string; aantal: number }>;
      /** P2: CrewAI-runs uit northsea_audit_events (action=crew_run). */
      crewai?: Array<{
        op: string;
        crew?: Tekst;
        route?: Tekst;
        status?: Tekst;
        timings?: Record<string, number> | null;
        budget?: Record<string, unknown> | null;
        backend?: Tekst;
        result_type?: Tekst;
        fallback?: boolean | null;
        error?: Tekst;
        next_action?: Tekst;
        approval_required?: boolean | null;
        deal_id?: Tekst;
      }>;
    } | null;
  };
  werk: { taken: NorthseaTaak[]; agenda: NorthseaAgendaItem[] };
  rapporten: {
    fases: Telling[];
    uitvoering: Telling[];
    commodities: Array<{ sleutel: string; aanbod: number; vraag: number }>;
    bedrijf_soorten: Telling[];
    bedrijf_verificatie: Telling[];
    landen: Telling[];
    communicatie_weken: Array<{ week: string; inkomend: number; uitgaand: number; intern: number }>;
    deals_maanden: Array<{ maand: string; aantal: number }>;
    gereedheid: Telling[];
    bewijs: Telling[];
    taken: Telling[];
    totaal: {
      deals: number; gewonnen: number; bedrijven: number; contacten: number; communicatie_30d: number;
      campagnes: number; waarde_ingevuld: number; commissie_bedragen: number;
    };
  };
}
