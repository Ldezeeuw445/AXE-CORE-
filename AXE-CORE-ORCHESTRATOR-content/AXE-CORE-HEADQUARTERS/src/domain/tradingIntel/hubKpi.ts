/**
 * Cijfers voor de Trading-hub (25 nov, Luka: elke tab KPI's en acties).
 *
 * Alles uit core_trading_trades: gesloten trades met een echte pnl. Geen
 * verzonnen equity-reeks -- de lijn is de opgetelde P&L van gesloten trades,
 * en zo heet hij ook op het scherm.
 */
export type HubTrade = {
  symbol: string;
  side: string;
  status: string;
  pnl: number | null;
  closed_at: string | null;
  opened_at: string;
  strategy: string | null;
  venue: string;
};

function gesloten(trades: readonly HubTrade[]): HubTrade[] {
  return trades
    .filter((t) => t.status === 'closed' && t.closed_at && typeof t.pnl === 'number' && Number.isFinite(t.pnl))
    .sort((a, b) => Date.parse(a.closed_at!) - Date.parse(b.closed_at!));
}

/** Opgetelde P&L na elke gesloten trade, oudste eerst. */
export function pnlCurve(trades: readonly HubTrade[]): Array<{ t: string; v: number }> {
  let som = 0;
  return gesloten(trades).map((t) => ({ t: t.closed_at!, v: (som += t.pnl as number) }));
}

/** Winstpercentage over de laatste `n` gesloten trades; null zonder trades. */
export function winRate(trades: readonly HubTrade[], n = 50): { pct: number; n: number } | null {
  const laatst = gesloten(trades).slice(-n);
  if (!laatst.length) return null;
  const wins = laatst.filter((t) => (t.pnl as number) > 0).length;
  return { pct: Math.round((wins / laatst.length) * 100), n: laatst.length };
}

/** P&L per sluitdag, de laatste `n` dagen waarop iets sloot (niet kalenderdagen). */
export function pnlPerDag(trades: readonly HubTrade[], n = 14): Array<{ dag: string; pnl: number; trades: number }> {
  const per = new Map<string, { pnl: number; trades: number }>();
  for (const t of gesloten(trades)) {
    const dag = t.closed_at!.slice(0, 10);
    const r = per.get(dag) ?? { pnl: 0, trades: 0 };
    r.pnl += t.pnl as number;
    r.trades += 1;
    per.set(dag, r);
  }
  return [...per.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-n).map(([dag, r]) => ({ dag, ...r }));
}

/** Per strategie: som en aantal, grootste absolute P&L eerst. */
export function perStrategie(trades: readonly HubTrade[], max = 5): Array<{ naam: string; pnl: number; n: number }> {
  const per = new Map<string, { pnl: number; n: number }>();
  for (const t of gesloten(trades)) {
    const naam = t.strategy?.trim() || 'No strategy';
    const r = per.get(naam) ?? { pnl: 0, n: 0 };
    r.pnl += t.pnl as number;
    r.n += 1;
    per.set(naam, r);
  }
  return [...per.entries()].map(([naam, r]) => ({ naam, ...r })).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, max);
}

/** Terugval vanaf de piek in procent (0 = op de piek). Null als een van beide ontbreekt. */
export function terugvalPct(piek: number | null | undefined, equity: number | null | undefined): number | null {
  if (piek == null || equity == null || !(piek > 0)) return null;
  return Math.max(0, Math.round(((piek - equity) / piek) * 1000) / 10);
}

/** "3d ago", "2mo ago": hoe oud de laatste gesloten trade is. */
export function geledenKort(iso: string | null | undefined, nu = Date.now()): string {
  const ms = iso ? nu - Date.parse(iso) : NaN;
  if (!Number.isFinite(ms) || ms < 0) return '';
  const dag = Math.floor(ms / 86_400_000);
  if (dag < 1) return 'today';
  if (dag < 45) return `${dag}d ago`;
  return `${Math.round(dag / 30)}mo ago`;
}
