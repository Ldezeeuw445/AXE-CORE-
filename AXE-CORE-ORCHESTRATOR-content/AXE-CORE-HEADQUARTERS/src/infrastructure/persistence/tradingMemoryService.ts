/**
 * tradingMemoryService — the trading agent's memory, on its own.
 *
 * Why this file exists: "the memory is one big pile" turned out to be almost
 * literally true, and for a reason nobody could see from the UI. The trading
 * agent's entire brain — 14,873 rows, every decision, cycle, lesson, piece of
 * intel and mistake it has ever recorded — is written to `global_memory` under
 * the category `system_event`. That is 95% of that table. Filed under a label
 * that means "misc", next to 62 user preferences and 21 conversation contexts.
 *
 * So the memory was never unsorted. It was sorted into a box called "other".
 *
 * The structure is entirely in the key, which is why no query ever surfaced it:
 *
 *     ta:axe_trading_agent:<kind>:<id-or-symbol>
 *      │        │            │
 *      │        │            └─ decision | cycle | lesson | intel | win |
 *      │        │               loss | mistake | trade | thesis
 *      │        └─ always axe_trading_agent
 *      └─ the trading namespace, deliberately kept during the 1 Sep prune
 *
 * Everything here is read-only and aggregate-first. The trading agent keeps
 * writing through its own path; this only ever looks.
 */
import { sbRunSql } from '@/infrastructure/gateways/axeCoreApiService';

/** The kinds the agent actually records, in funnel order. */
export const TRADING_KINDS = [
  'intel', 'cycle', 'decision', 'trade', 'win', 'loss', 'mistake', 'lesson', 'thesis',
] as const;
export type TradingKind = (typeof TRADING_KINDS)[number];

export interface KindCount {
  kind: TradingKind;
  count: number;
  firstAt: string | null;
  lastAt: string | null;
}

export interface SymbolRow {
  symbol: string;
  decisions: number;
  cycles: number;
  wins: number;
  losses: number;
  mistakes: number;
  /** Mean recorded confidence, 0-1. Null when nothing carried one. */
  confidence: number | null;
}

export interface MemoryNote {
  kind: TradingKind;
  symbol: string | null;
  text: string;
  at: string;
}

export interface TradingMemoryOverview {
  kinds: KindCount[];
  symbols: SymbolRow[];
  /** Only lessons that say something. See LESSON_NOISE. */
  lessons: MemoryNote[];
  mistakes: MemoryNote[];
  /** How many "lessons" are a bare score line. Shown, not hidden. */
  lessonNoise: number;
  total: number;
  /** True when the aggregate query failed and this is not a real reading. */
  degraded: boolean;
  error?: string;
}

const BASE = "category = 'system_event' AND key LIKE 'ta:%'";

/** value is TEXT: JSON for structured kinds, a bare string for lessons. */
const JSON_ONLY = "AND left(btrim(value), 1) = '{'";

/**
 * Most "lessons" are not lessons.
 *
 * Of 3,522 rows the agent files as `lesson`, 2,876 are the string
 * `HOLD score=0.081` — one written per cycle, three within the same 17
 * seconds, only 586 distinct texts in the whole set. They are a scoreline the
 * cycle happened to log under the lesson key.
 *
 * The other 478 are real, and worth reading:
 *   "Early exit at +0.38% (peak +0.86%): gave back 56% of a +0.86% peak."
 *
 * Filtering here rather than in the page, because a list where 4 out of 5
 * entries say `HOLD score=` is a list nobody reads — which is how the 478
 * stayed invisible. The count of what was filtered is returned alongside, so
 * this hides noise without hiding the fact that the noise exists.
 */
const LESSON_NOISE = "value ~ '^(HOLD|BUY|SELL) score=' OR length(value) <= 40";

function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function str(v: unknown): string | null { return typeof v === 'string' && v ? v : null; }

/**
 * One round trip per shape rather than one big join: these run against the
 * read-only exec_sql RPC, and a failure in the symbol breakdown should not
 * cost you the counts as well.
 */
export async function loadTradingMemory(): Promise<TradingMemoryOverview> {
  const empty: TradingMemoryOverview = {
    kinds: [], symbols: [], lessons: [], mistakes: [], lessonNoise: 0,
    total: 0, degraded: true,
  };

  try {
    const [kindRows, symRows, lessonRows, noiseRows, mistakeRows] = await Promise.all([
      sbRunSql(`
        SELECT split_part(key,':',3) AS kind, count(*) AS n,
               min(created_at)::text AS first_at, max(created_at)::text AS last_at
        FROM global_memory WHERE ${BASE}
        GROUP BY 1 ORDER BY n DESC`),
      sbRunSql(`
        SELECT coalesce(nullif(value::jsonb->>'symbol',''),'?') AS symbol,
               count(*) FILTER (WHERE split_part(key,':',3)='decision') AS decisions,
               count(*) FILTER (WHERE split_part(key,':',3)='cycle')    AS cycles,
               count(*) FILTER (WHERE split_part(key,':',3)='win')      AS wins,
               count(*) FILTER (WHERE split_part(key,':',3)='loss')     AS losses,
               count(*) FILTER (WHERE split_part(key,':',3)='mistake')  AS mistakes,
               avg((value::jsonb->>'confidence')::numeric)              AS confidence
        FROM global_memory WHERE ${BASE} ${JSON_ONLY}
        GROUP BY 1 ORDER BY count(*) DESC LIMIT 40`),
      sbRunSql(`
        SELECT split_part(key,':',4) AS symbol, value AS text, created_at::text AS at
        FROM global_memory WHERE ${BASE} AND split_part(key,':',3)='lesson'
          AND NOT (${LESSON_NOISE})
        ORDER BY created_at DESC LIMIT 60`),
      sbRunSql(`
        SELECT count(*) AS n FROM global_memory
        WHERE ${BASE} AND split_part(key,':',3)='lesson' AND (${LESSON_NOISE})`),
      sbRunSql(`
        SELECT value::jsonb->>'symbol' AS symbol,
               coalesce(value::jsonb->>'detail', value::jsonb->>'kind', value) AS text,
               created_at::text AS at
        FROM global_memory WHERE ${BASE} AND split_part(key,':',3)='mistake' ${JSON_ONLY}
        ORDER BY created_at DESC LIMIT 40`),
    ]);

    const kinds: KindCount[] = (kindRows as Record<string, unknown>[])
      .map(r => ({
        kind: String(r.kind) as TradingKind,
        count: num(r.n),
        firstAt: str(r.first_at),
        lastAt: str(r.last_at),
      }))
      .filter(k => (TRADING_KINDS as readonly string[]).includes(k.kind));

    const symbols: SymbolRow[] = (symRows as Record<string, unknown>[]).map(r => ({
      symbol: String(r.symbol ?? '?'),
      decisions: num(r.decisions),
      cycles: num(r.cycles),
      wins: num(r.wins),
      losses: num(r.losses),
      mistakes: num(r.mistakes),
      confidence: r.confidence == null ? null : num(r.confidence),
    }));

    const toNote = (kind: TradingKind) => (r: Record<string, unknown>): MemoryNote => ({
      kind,
      symbol: str(r.symbol),
      text: String(r.text ?? '').slice(0, 400),
      at: String(r.at ?? ''),
    });

    return {
      kinds,
      symbols,
      lessons: (lessonRows as Record<string, unknown>[]).map(toNote('lesson')),
      mistakes: (mistakeRows as Record<string, unknown>[]).map(toNote('mistake')),
      lessonNoise: num((noiseRows as Record<string, unknown>[])[0]?.n),
      total: kinds.reduce((n, k) => n + k.count, 0),
      degraded: false,
    };
  } catch (err) {
    // Loudly, not silently. Six separate failures in this app were invisible
    // because an error came back looking like an empty but valid answer.
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tradingMemory] aggregate failed:', msg);
    return { ...empty, error: msg };
  }
}

/** Wins over decided trades. Null when nothing has settled yet. */
export function winRate(rows: Pick<SymbolRow, 'wins' | 'losses'>[]): number | null {
  const w = rows.reduce((n, r) => n + r.wins, 0);
  const l = rows.reduce((n, r) => n + r.losses, 0);
  return w + l === 0 ? null : w / (w + l);
}
