/**
 * laneStance — wat AXE Intel en AXE Companion vonden, gemeten aan wat de markt deed.
 *
 * De twee lanes schreven hun lezing naar hun eigen geheugen, maar openden geen
 * episode: hun bijdrage kon dus nooit door een uitkomst versterkt of verzwakt
 * worden. Een lane die structureel verkeerd zat, bleef even zwaar meewegen als
 * een die structureel goed zat.
 *
 * De maat is objectief en ligt buiten de lane: de gerealiseerde trade op dat
 * symbool. Een lane beoordeelt zichzelf nooit. Wie LONG zei, zat goed als de
 * markt steeg — ongeacht of AXE Algo long of short ging, en ongeacht of de
 * lane in zijn eigen tekst zelfverzekerd klonk.
 */

export type LaneStance = 'long' | 'short' | 'neutral';

/** Leest precies één regel `STANCE: LONG|SHORT|NEUTRAL`. Geen gok uit vrije tekst. */
export function parseLaneStance(text: string | null | undefined): LaneStance | null {
  const line = String(text ?? '').split('\n').find(l => /^\s*STANCE\s*:/i.test(l));
  if (!line) return null;
  const v = line.replace(/^\s*STANCE\s*:\s*/i, '').trim().toUpperCase();
  if (/^(LONG|BULLISH|BUY)\b/.test(v)) return 'long';
  if (/^(SHORT|BEARISH|SELL)\b/.test(v)) return 'short';
  if (/^(NEUTRAL|FLAT|NONE|HOLD)\b/.test(v)) return 'neutral';
  return null;
}

/**
 * Welke kant de markt op ging, afgeleid van een gesloten trade. Een long die
 * won of een short die verloor = omhoog. Breakeven zegt niets, dus null.
 */
export function marketDirectionFromTrade(side: 'buy' | 'sell', pnl: number): 'up' | 'down' | null {
  if (!Number.isFinite(pnl) || pnl === 0) return null;
  const won = pnl > 0;
  return (side === 'buy') === won ? 'up' : 'down';
}

/** good/poor voor een stance tegen de marktrichting; null = niets te beoordelen. */
export function laneVerdict(stance: LaneStance, direction: 'up' | 'down' | null): 'good' | 'poor' | null {
  if (!direction || stance === 'neutral') return null;
  return (stance === 'long') === (direction === 'up') ? 'good' : 'poor';
}

/** Onderwerp van een lane-episode: symbool en stance, zodat het sluiten beide kent. */
export function deskEpisodeSubject(symbol: string, stance: LaneStance): string {
  return `${symbol.trim().toUpperCase()}|${stance}`;
}

export function parseDeskEpisodeSubject(subject: string): { symbol: string; stance: LaneStance } | null {
  const m = /^([A-Z0-9._-]+)\|(long|short|neutral)$/.exec(subject.trim());
  return m ? { symbol: m[1], stance: m[2] as LaneStance } : null;
}

/** De instructieregel voor beide lanes, zodat de stance altijd leesbaar is. */
export const STANCE_INSTRUCTION =
  'After the HANDOFF line, end with exactly one line: STANCE: LONG, STANCE: SHORT or STANCE: NEUTRAL — your directional read on this symbol, which will be scored against what the market actually does.';
