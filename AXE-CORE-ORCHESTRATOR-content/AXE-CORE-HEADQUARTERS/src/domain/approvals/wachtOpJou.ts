/**
 * "Wacht op jou": één lijst met álles wat op Luka's ja of nee wacht.
 *
 * ## Waarom (Luka, 16 nov 2026)
 *
 * De Projects Manager zei "2 wachten al meer dan een dag op jouw ja", terwijl
 * Luka alles had goedgekeurd. Gemeten: core_approvals had 0 open vragen. De
 * twee taken hadden geen kaart (een verlopen, een nooit gemaakt), dus hij kon
 * ze nergens goedkeuren. Tegelijk wachtten er aan NorthSea-kant 65 dingen
 * (concepten, "Yes needed"-taken, inbound reviews) die AXE nergens samen liet
 * zien. Vragen stonden op vijf plekken; dus miste hij ze.
 *
 * Hier komt het samen. Elke rij zegt in gewone taal WAT het is, WAAROM het
 * wacht, VAN WIE (welke manager/app) en SINDS WANNEER. Rijen die AXE zelf kan
 * beslissen (core_approvals) krijgen ja/nee-knoppen; NorthSea-rijen openen de
 * desk, want een mail goedkeuren moet daar, met de tekst ervoor.
 */

export type WachtBron = 'axe' | 'northsea';

export interface WachtItem {
  id: string;
  bron: WachtBron;
  /** App waar het bij hoort: "AXE Core", "NorthSea". */
  app: string;
  /** Manager die het vraagt, leesbaar. */
  wie: string;
  wat: string;
  waarom: string;
  /** ISO-tijd. */
  sinds: string;
  /** Ja/nee kan hier; anders "Open". */
  kanHierBeslissen: boolean;
  taskId?: string;
  dealId?: string;
  /** NorthSea: de soort (reply_draft, deal_decision, ...) en het id voor goedkeuren. */
  soort?: string;
  approvalId?: string;
  /** NorthSea-concept dat Luka hier zelf kan goedkeuren en versturen (niet gevoelig). */
  kanVersturen?: boolean;
}

export interface AxeVraag {
  id: string;
  task_id: string;
  title?: string | null;
  detail?: string | null;
  wat?: string | null;
  waarom?: string | null;
  kind?: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

export interface NorthseaVraag {
  approval_id: string;
  kind: string;
  deal_id?: string | null;
  subject?: string | null;
  sensitive_action?: boolean | null;
  gate?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const MANAGER_NAMEN: Record<string, string> = {
  projectsmgr: 'Projects Manager',
  northseamgr: 'NorthSea Manager',
  axemanager: 'AXE Core',
  tradingmgr: 'Trading Manager',
};

function schoon(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** "Yes needed: 2356eac9-…-… — Copper Cathode" -> "Copper Cathode". UUID's zegt Luka niets. */
export function zonderUuid(s: string): string {
  return schoon(
    s.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
      .replace(/^\s*(yes needed|ja nodig)\s*:\s*/i, '')
      .replace(/^\s*[—–-]+\s*/, ''),
  );
}

const NORTHSEA_SOORT: Record<string, { wat: string; waarom: string }> = {
  reply_draft: {
    wat: 'Mail klaar om te versturen',
    waarom: 'De desk schreef deze mail. Lees hem en druk op "Versturen"; zonder jou gaat hij niet weg.',
  },
  deal_tasks_approval: {
    wat: 'Volgende stap van een deal',
    waarom: 'De desk wil verder met deze deal maar dit valt buiten de vaste regel. Kijk of hij door mag.',
  },
  action_queue_approval: {
    wat: 'Actie van de desk',
    waarom: 'Een actie die alleen met jouw ja mag (bijvoorbeeld onderzoek dat geld kost).',
  },
  deal_decision: {
    wat: 'Besluit over een deal',
    waarom: 'De deal staat stil tot jij kiest: door, parkeren of stoppen.',
  },
  inbound_needs_human_review: {
    wat: 'Binnengekomen mail om te lezen',
    waarom: 'Een tegenpartij schreef iets dat de desk niet zelf mag afhandelen.',
  },
};

export function vanAxe(rijen: AxeVraag[], managerVanTaak: Record<string, string> = {}): WachtItem[] {
  return rijen.filter((r) => r.id && r.task_id).map((r) => {
    const meta = r.metadata ?? {};
    const mgr = String(managerVanTaak[r.task_id] ?? meta.manager ?? meta.requested_by ?? '');
    return {
      id: `axe:${r.id}`,
      bron: 'axe' as const,
      app: 'AXE Core',
      wie: MANAGER_NAMEN[mgr] ?? (mgr || 'AXE Core'),
      wat: schoon(r.wat || r.title) || 'Een stap die je ok nodig heeft',
      waarom: schoon(r.waarom || r.detail) || 'Geen uitleg meegegeven.',
      sinds: r.created_at,
      kanHierBeslissen: true,
      taskId: r.task_id,
    };
  });
}

export function vanNorthsea(rijen: NorthseaVraag[]): WachtItem[] {
  return rijen.filter((r) => r.approval_id).map((r) => {
    const soort = NORTHSEA_SOORT[r.kind] ?? { wat: 'Vraag van de desk', waarom: schoon(r.gate) || 'Wacht op jouw besluit.' };
    const onderwerp = zonderUuid(schoon(r.subject));
    return {
      id: `northsea:${r.kind}:${r.approval_id}`,
      bron: 'northsea' as const,
      app: 'NorthSea',
      wie: 'NorthSea Manager',
      wat: onderwerp ? `${soort.wat}: ${onderwerp}` : soort.wat,
      waarom: soort.waarom,
      sinds: r.created_at || r.updated_at || '',
      kanHierBeslissen: false,
      dealId: r.deal_id || undefined,
      soort: r.kind,
      approvalId: r.approval_id,
      kanVersturen: r.kind === 'reply_draft' && r.sensitive_action !== true,
    };
  });
}

/** Oudste eerst: wat het langst wacht, staat bovenaan. */
export function samen(...lijsten: WachtItem[][]): WachtItem[] {
  const gezien = new Set<string>();
  return lijsten.flat()
    .filter((i) => (gezien.has(i.id) ? false : (gezien.add(i.id), true)))
    .sort((a, b) => a.sinds.localeCompare(b.sinds));
}

export function hoeLang(sinds: string, nu: Date = new Date()): string {
  const t = Date.parse(sinds);
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((nu.getTime() - t) / 60_000));
  if (min < 60) return `${min} min`;
  const uur = Math.round(min / 60);
  if (uur < 48) return `${uur} uur`;
  return `${Math.round(uur / 24)} dagen`;
}
