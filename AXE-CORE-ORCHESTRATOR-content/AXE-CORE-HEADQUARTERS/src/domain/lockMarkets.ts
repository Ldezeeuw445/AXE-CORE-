/** Eén ticker uit GET /lockscreen/snapshot. Staat hier (domain) zodat de
 *  domeinregels er geen infrastructure voor hoeven te importeren; de gateway
 *  importeert het type van hier. */
export interface LockscreenMarket {
  symbol: string;
  label: string;
  price: number | null;
  spark?: number[];
  chg?: Record<string, { abs: number; pct: number }>;
  last_updated?: string | null;
  stale?: boolean;
  last_updated_label?: string | null;
}

/** Wat het slotscherm onder een ticker zet: koers, of 'Last updated', of pas dan een streepje. */
export function marktPrijsTekst(m: Pick<LockscreenMarket, 'price' | 'stale' | 'last_updated_label'>): string {
  if (m.price != null && Number.isFinite(m.price)) {
    return String(m.price);
  }
  return m.last_updated_label || '—';
}

export function marktOnderschrift(m: Pick<LockscreenMarket, 'stale' | 'last_updated_label'>): string | null {
  return m.stale ? (m.last_updated_label ?? 'Last updated') : null;
}
