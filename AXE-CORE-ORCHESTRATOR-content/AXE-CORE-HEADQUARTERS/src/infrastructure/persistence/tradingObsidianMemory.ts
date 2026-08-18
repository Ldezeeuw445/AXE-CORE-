/**
 * tradingObsidianMemory — a growing, structured trading knowledge base in
 * Obsidian, generated FROM the per-(pair × strategy) ledger.
 *
 * The old per-decision mirror wrote ~2000 tiny fragments (and silently failed,
 * leaving 0 notes) — that is noise, not memory. This instead keeps ONE living
 * note per pair (the scorecard) plus a strategy index, upserted on every
 * self-test / trade close, so the vault becomes a real, legible record of what
 * works where that grows and stays organised instead of a pile. Uses
 * writeObsidianNote (the same path AXE's reflections use, which works) — one
 * note per pair, keyed by path, so re-syncing updates in place.
 */
import { writeObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { getLedger, MIN_LIVE_SAMPLE, type LedgerStats } from '@/infrastructure/persistence/tradingLedgerService';

function pct(n: number): string { return `${(n * 100).toFixed(1)}%`; }
function pf(n: number): string { return Number.isFinite(n) ? n.toFixed(2) : '∞'; }
function slug(pair: string): string { return pair.replace(/[^A-Za-z0-9]/g, ''); }

function scorecardMarkdown(pair: string, rows: LedgerStats[]): string {
  const ranked = [...rows].sort((a, b) => b.expectancy - a.expectancy);
  const best = ranked[0];
  const lines: string[] = [];
  lines.push(`# ${pair} — strategy scorecard`);
  lines.push('');
  lines.push(`**Current pick:** ${best ? `\`${best.strategy}\`` : '—'}  ·  _updated ${new Date().toISOString().slice(0, 16)}_`);
  lines.push('');
  lines.push('| Strategy | Live trades | Win% | Net | PF | Self-test (net / win / trades) | Source |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const s of ranked) {
    const isFramework = s.strategy.includes(':');
    const source = isFramework ? s.strategy.split(':')[0] : 'axe';
    const live = s.trades > 0
      ? `${s.trades}${s.trades < MIN_LIVE_SAMPLE ? ' (low)' : ''}`
      : '—';
    const bt = s.backtest ? `${pct(s.backtest.netReturnPct)} / ${(s.backtest.winRate * 100).toFixed(0)}% / ${s.backtest.trades}` : '—';
    const mark = s === best ? ' ⭐' : '';
    lines.push(`| \`${s.strategy}\`${mark} | ${live} | ${s.trades > 0 ? `${(s.winRate * 100).toFixed(0)}%` : '—'} | ${s.trades > 0 ? pct(s.netReturnPct) : '—'} | ${s.trades > 0 ? pf(s.profitFactor) : '—'} | ${bt} | ${source} |`);
  }
  lines.push('');
  lines.push('Ranked by expectancy (live record once sampled, else the self-test prior). ⭐ = what AXE Algo trades this pair with now.');
  lines.push('');
  lines.push(`[[Trading Agent]] · [[Strategy index]] · [[${pair}]]`);
  return lines.join('\n');
}

function indexMarkdown(byPair: Map<string, LedgerStats[]>): string {
  const lines: string[] = [];
  lines.push('# Strategy index — what works where');
  lines.push('');
  lines.push(`_updated ${new Date().toISOString().slice(0, 16)} · ${byPair.size} pairs tracked_`);
  lines.push('');
  lines.push('| Pair | Best strategy | Source | Edge (expectancy) | Live trades |');
  lines.push('|---|---|---|---|---|');
  const frameworkWins: Record<string, number> = {};
  for (const [pair, rows] of [...byPair.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const best = [...rows].sort((a, b) => b.expectancy - a.expectancy)[0];
    if (!best) continue;
    const source = best.strategy.includes(':') ? best.strategy.split(':')[0] : 'axe';
    frameworkWins[source] = (frameworkWins[source] ?? 0) + 1;
    lines.push(`| [[${pair}]] | \`${best.strategy}\` | ${source} | ${(best.expectancy * 100).toFixed(3)}% | ${best.trades} |`);
  }
  lines.push('');
  lines.push('## Who is winning');
  for (const [src, n] of Object.entries(frameworkWins).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${src}**: best on ${n} pair(s)`);
  }
  lines.push('');
  lines.push('Every strategy — AXE Algo\'s own and each framework\'s (vbt:*, ml:*, …) — competes in the same ledger. This index is the leaderboard.');
  lines.push('');
  lines.push('[[Trading Agent]]');
  return lines.join('\n');
}

/**
 * Regenerate the trading knowledge base from the ledger. One scorecard note
 * per pair + one index note. Idempotent (upsert by path). Returns how many
 * notes were written. Best-effort per note so one failure doesn't abort the rest.
 */
export async function syncTradingObsidian(): Promise<{ notes: number; pairs: number }> {
  const ledger = await getLedger();
  if (!ledger.length) return { notes: 0, pairs: 0 };

  const byPair = new Map<string, LedgerStats[]>();
  for (const r of ledger) {
    const arr = byPair.get(r.pair) ?? [];
    arr.push(r);
    byPair.set(r.pair, arr);
  }

  let notes = 0;
  for (const [pair, rows] of byPair.entries()) {
    try {
      await writeObsidianNote({
        path: `Trading/${slug(pair)}-scorecard.md`,
        title: `${pair} — strategy scorecard`,
        content: scorecardMarkdown(pair, rows),
        tags: ['trading', 'scorecard', pair.toLowerCase()],
        source: 'system',
        metadata: { pair, kind: 'scorecard', agentId: 'axe_algo' },
      });
      notes += 1;
    } catch (e) {
      console.warn(`[tradingObsidian] scorecard write failed for ${pair}:`, e);
    }
  }

  try {
    await writeObsidianNote({
      path: 'Trading/Strategy-index.md',
      title: 'Strategy index — what works where',
      content: indexMarkdown(byPair),
      tags: ['trading', 'index'],
      source: 'system',
      metadata: { kind: 'strategy-index', agentId: 'axe_algo' },
    });
    notes += 1;
  } catch (e) {
    console.warn('[tradingObsidian] index write failed:', e);
  }

  return { notes, pairs: byPair.size };
}
