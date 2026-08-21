/**
 * One Obsidian note per closed trade — the raw material the graph is drawn
 * from.
 *
 * The scorecards next door are AGGREGATES: one living note per pair, rewritten
 * on every sync. They answer "what works on gold". They cannot answer "show me
 * every trade volumetric-ob took on h4 and how they ended", because by the time
 * a number reaches a scorecard the individual trades have been summed away.
 * A graph needs the nodes, not the totals.
 *
 * Note the earlier lesson this deliberately does NOT repeat: a previous
 * per-decision mirror wrote ~2000 tiny fragments and became noise. The
 * difference is what gets a note. That one wrote every DECISION, including the
 * holds — and the vast majority of cycles are holds. This writes only CLOSED
 * TRADES: something was actually risked and actually resolved. Yesterday's
 * whole day produced fifteen of those.
 *
 * Tags are the graph's wiring, and they are generated from
 * domain/tradingIntel/strategyColors.ts — the same registry that paints the
 * dots and triangles in the app. A second palette here would drift within a
 * week, and then the vault and the Trading tab would disagree about what
 * colour vbt: is.
 */
import { writeObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { frameworkOf, FRAMEWORK_LABELS } from '@/domain/tradingIntel/strategyColors';
import { canonicalTimeframe } from '@/domain/tradingIntel/timeframes';

export interface ClosedTradeNote {
  symbol: string;
  pnl: number;
  strategy?: string | null;
  timeframe?: string | null;
  side?: string | null;
  confidence?: number;
  exitReason?: string;
  tradeId?: string;
  returnPct?: number;
  /** Which account it ran on — the two brokers behave differently. */
  account?: string | null;
  closedAt?: string;
}

function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * An untagged trade is recorded as untagged.
 *
 * Most trades close at the broker on SL or TP, where AXE never sees the call,
 * and some brokers truncate the order comment the strategy rides on. Inventing
 * an attribution would poison exactly the thing the graph exists to show, so
 * these get their own hub instead — visible, countable, and not credited to
 * any strategy. The ledger already refuses to credit what it cannot attribute;
 * this tells the same story.
 */
const UNTAGGED = 'untagged';

export function tradeNoteMarkdown(t: ClosedTradeNote): { title: string; path: string; content: string; tags: string[] } {
  const closedAt = t.closedAt ?? new Date().toISOString();
  const strategy = t.strategy?.trim() || UNTAGGED;
  const fw = frameworkOf(t.strategy);
  const framework = fw ?? (t.strategy ? 'axe' : UNTAGGED);
  const tf = canonicalTimeframe(t.timeframe ?? undefined) ?? UNTAGGED;
  const win = t.pnl > 0;
  const result = t.pnl === 0 ? 'flat' : win ? 'win' : 'loss';
  const side = (t.side ?? '').toLowerCase() === 'sell' ? 'sell' : 'buy';
  const pair = t.symbol.toUpperCase();

  const tags = [
    `pair/${pair}`,
    `strategy/${slug(strategy)}`,
    `framework/${framework}`,
    `timeframe/${tf}`,
    `result/${result}`,
    `side/${side}`,
    'trading/trade',
  ];

  const title = `${pair} ${side.toUpperCase()} ${closedAt.slice(0, 16).replace('T', ' ')}`;
  const path = `Trading/Trades/${pair}-${closedAt.replace(/[:.]/g, '-')}.md`;

  // YAML frontmatter: Obsidian's Extended Graph reads properties, and Dataview
  // queries them. Quoted, because a strategy name can contain a colon (vbt:macd)
  // and an unquoted colon silently truncates the value.
  const lines = [
    '---',
    `pair: "${pair}"`,
    `strategy: "${strategy}"`,
    `framework: "${framework}"`,
    `timeframe: "${tf}"`,
    `side: "${side}"`,
    `result: "${result}"`,
    `pnl: ${Number.isFinite(t.pnl) ? t.pnl.toFixed(2) : 0}`,
    ...(Number.isFinite(t.returnPct ?? NaN) ? [`return_pct: ${(t.returnPct! * 100).toFixed(4)}`] : []),
    ...(Number.isFinite(t.confidence ?? NaN) ? [`confidence: ${((t.confidence ?? 0) * 100).toFixed(0)}`] : []),
    ...(t.account ? [`account: "${t.account}"`] : []),
    ...(t.exitReason ? [`exit_reason: "${t.exitReason}"`] : []),
    ...(t.tradeId ? [`trade_id: "${t.tradeId}"`] : []),
    `closed_at: "${closedAt}"`,
    `tags: [${tags.map(x => `"${x}"`).join(', ')}]`,
    '---',
    '',
    `# ${title}`,
    '',
    `**${result.toUpperCase()}** ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}` +
      (t.exitReason ? ` · closed by \`${t.exitReason}\`` : ''),
    '',
    '| | |',
    '|---|---|',
    `| Pair | [[${pair}]] |`,
    `| Strategy | [[${strategy}]] |`,
    `| Framework | [[${FRAMEWORK_LABELS[framework as keyof typeof FRAMEWORK_LABELS] ?? framework}]] |`,
    `| Timeframe | [[${tf}]] |`,
    `| Side | ${side.toUpperCase()} |`,
    ...(t.account ? [`| Account | ${t.account} |`] : []),
    ...(Number.isFinite(t.confidence ?? NaN) ? [`| Confidence | ${((t.confidence ?? 0) * 100).toFixed(0)}% |`] : []),
    '',
    // The links are the graph's edges. Each trade joins its pair, its strategy,
    // its framework, its timeframe and its outcome, so the funnel the brief
    // describes falls out of the structure rather than being drawn by hand.
    `[[${pair}]] · [[${strategy}]] · [[${tf}]] · [[${result === 'win' ? 'Wins' : result === 'loss' ? 'Losses' : 'Flat'}]] · [[${pair} — strategy scorecard]]`,
    '',
  ];

  return { title, path, content: lines.join('\n'), tags };
}

/** Best-effort: a vault write must never be able to stop a trade being recorded. */
export async function writeTradeNote(t: ClosedTradeNote): Promise<boolean> {
  try {
    const note = tradeNoteMarkdown(t);
    await writeObsidianNote({
      path: note.path,
      title: note.title,
      content: note.content,
      tags: note.tags,
      metadata: { pair: t.symbol, strategy: t.strategy ?? UNTAGGED, pnl: t.pnl },
    });
    return true;
  } catch (e) {
    console.warn('[tradeNotes] could not write note for', t.symbol, e);
    return false;
  }
}
