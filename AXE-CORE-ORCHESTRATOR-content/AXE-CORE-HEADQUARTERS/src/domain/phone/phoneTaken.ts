/**
 * Taken op de telefoon: geen zes keer dezelfde DEAL-002-regel.
 */
export interface TelefoonTaak {
  id: string;
  titel: string;
  status: string;
  aantal: number;
}

const DEAL = /\bDEAL-\d+\b/i;
const PREFIX = /^(continue|fix|planner)\s*:\s*/i;

function kernTitel(titel: string): string {
  return titel.replace(PREFIX, '').replace(/^yes needed:\s*/i, '').trim();
}

function sleutelVan(row: { id: string; title: string; metadata?: Record<string, unknown> }): string {
  const meta = row.metadata ?? {};
  const deal = meta.deal_id ?? meta.dealId ?? meta.deal;
  if (typeof deal === 'string' && deal.trim()) return `deal:${deal.trim().toLowerCase()}`;
  const uitTitel = row.title.match(DEAL)?.[0];
  if (uitTitel) return `deal:${uitTitel.toUpperCase()}`;
  const kern = kernTitel(row.title).toLowerCase().replace(/\s+/g, ' ');
  return kern || row.id;
}

export function groepeerTelefoonTaken(
  rows: ReadonlyArray<{ id: string; title: string; status: string; updated_at?: string; metadata?: Record<string, unknown> }>,
): TelefoonTaak[] {
  const groepen = new Map<string, typeof rows[number][]>();
  for (const r of rows) {
    const k = sleutelVan(r);
    const lijst = groepen.get(k);
    if (lijst) (lijst as typeof rows[number][]).push(r);
    else groepen.set(k, [r]);
  }
  const uit: TelefoonTaak[] = [];
  for (const groep of groepen.values()) {
    const nieuwste = [...groep].sort((a, b) => {
      const ta = Date.parse(a.updated_at ?? '') || 0;
      const tb = Date.parse(b.updated_at ?? '') || 0;
      return tb - ta;
    })[0];
    uit.push({
      id: nieuwste.id,
      titel: kernTitel(nieuwste.title) || nieuwste.title,
      status: nieuwste.status,
      aantal: groep.length,
    });
  }
  return uit;
}
