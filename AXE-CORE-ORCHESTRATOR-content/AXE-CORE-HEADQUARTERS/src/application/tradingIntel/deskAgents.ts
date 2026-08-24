/**
 * AXE CORE's own Intel and Companion, built on the other apps' data.
 *
 * AXE Intel and AXE Companion are separate applications that happen to share
 * this Supabase project. AXE CORE must be able to use what they know without
 * changing anything inside them — so this reads their tables and writes its
 * OWN conclusion into its own namespace. Nothing here writes to an intel_* or
 * axe_* table; those belong to the apps that own them.
 *
 * That separation is what makes the Brain pipeline honest. The lane shows what
 * AXE CORE concluded from their data, dated by AXE CORE's run — not the other
 * app's last sync wearing this app's badge.
 *
 * ## The freshness problem is real and must stay visible
 *
 * Measured 2026-08-24: intel_* last wrote on the 14th, the Companion tables
 * around the 10th. Both apps have stopped syncing. Reading them is still worth
 * doing — 8 009 option rows and 1 467 tide rows are not nothing — but a
 * conclusion drawn from ten-day-old flow that presents itself as current would
 * be worse than no lane at all. Every summary carries the age of its newest
 * input, and the agent is told to say so.
 */
import { sbGetRows } from '@/infrastructure/gateways/axeCoreApiService';
import { remember, type MemoryNamespace } from '@/infrastructure/persistence/agentMemoryService';

/**
 * What the previous lanes concluded, passed forward.
 *
 * The pipeline is cumulative on purpose: Intel reads Research, Companion reads
 * both, Algo receives the filtered result. An agent reasoning in isolation and
 * then being drawn with an arrow into the next one is a diagram, not a chain —
 * the arrow has to carry something or the layout is decoration.
 *
 * Passed explicitly rather than fetched from memory inside each agent. A lane
 * must be able to show that THIS run used THAT input; a shared read would make
 * "Intel saw the research" unprovable from the screen.
 */
export interface UpstreamContext {
  research?: string | null;
  intel?: string | null;
  companion?: string | null;
}

/** Render upstream conclusions for a prompt, or say plainly that there are none. */
export function upstreamBlock(up: UpstreamContext | undefined): string {
  const parts: string[] = [];
  if (up?.research) parts.push(`WHAT RESEARCH FOUND:\n${up.research.slice(0, 1500)}`);
  if (up?.intel) parts.push(`WHAT INTEL ADDED:\n${up.intel.slice(0, 1500)}`);
  if (up?.companion) parts.push(`WHAT COMPANION SAID:\n${up.companion.slice(0, 1500)}`);
  if (!parts.length) {
    // Named, not omitted. An agent that cannot tell "nothing upstream" from
    // "upstream said nothing useful" will invent the difference.
    return 'UPSTREAM: nothing has run before you this cycle. Say so rather than implying you built on someone.';
  }
  return parts.join('\n\n');
}

export interface DeskAgentResult {
  ok: boolean;
  headline: string;
  detail: string;
  /** Age of the freshest row the agent actually saw. */
  sourceAge: string;
  rowsSeen: number;
}

type CallLlm = (system: string, user: string) => Promise<string>;

function ageOf(iso: string | null | undefined): string {
  if (!iso) return 'unknown age';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'unknown age';
  const d = Math.floor(ms / 86_400_000);
  if (d >= 1) return `${d}d old`;
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h}h old` : 'fresh';
}

function newest(rows: Array<Record<string, unknown>>, col: string): string | null {
  let best: string | null = null;
  for (const r of rows) {
    const v = r[col];
    if (typeof v === 'string' && (!best || v > best)) best = v;
  }
  return best;
}

/** Fetch a table, tolerating one that is empty or gone rather than failing the run. */
async function safeRows(table: string, limit: number): Promise<Array<Record<string, unknown>>> {
  try {
    return await sbGetRows<Record<string, unknown>>(table, {
      limit, orderBy: 'created_at', orderDir: 'desc',
    });
  } catch {
    return [];
  }
}

/**
 * AXE CORE's Intel read.
 *
 * Sources are the feeds the AXE Intel app fills: options flow, market tide,
 * insider activity. Summarised for one symbol, because "what is the flow
 * saying about XAUUSD" is the question the next lane can act on — a digest of
 * everything is a newsletter, not a handoff.
 */
export async function runDeskIntel(
  symbol: string,
  callLlm?: CallLlm,
  upstream?: UpstreamContext,
): Promise<DeskAgentResult> {
  const [options, tide, insiders] = await Promise.all([
    safeRows('intel_unusual_options', 40),
    safeRows('intel_market_tide', 20),
    safeRows('intel_insider_trades', 20),
  ]);

  const rowsSeen = options.length + tide.length + insiders.length;
  const sourceAge = ageOf(
    [newest(options, 'created_at'), newest(tide, 'created_at'), newest(insiders, 'created_at')]
      .filter(Boolean).sort().pop() as string | undefined,
  );

  if (rowsSeen === 0) {
    return {
      ok: false, rowsSeen: 0, sourceAge,
      headline: 'No intel in the database',
      detail: 'The AXE Intel app has written nothing readable here. Nothing to conclude from.',
    };
  }

  const facts = [
    `Unusual options rows: ${options.length}`,
    `Market tide rows: ${tide.length}`,
    `Insider trade rows: ${insiders.length}`,
    `Freshest input: ${sourceAge}`,
    '',
    'TIDE SAMPLE:',
    ...tide.slice(0, 5).map(r => `- ${JSON.stringify(r).slice(0, 220)}`),
    '',
    'OPTIONS SAMPLE:',
    ...options.slice(0, 6).map(r => `- ${JSON.stringify(r).slice(0, 220)}`),
  ].join('\n');

  if (!callLlm) {
    return {
      ok: true, rowsSeen, sourceAge,
      headline: `${rowsSeen} intel rows · ${sourceAge}`,
      detail: 'No model configured, so this lane is counting rows rather than reading them. Pick a model in Settings to get a written read.',
    };
  }

  const system = [
    'You are AXE Intel inside AXE CORE. You read flow and positioning data and say what it implies.',
    'You did NOT gather this data — another application did, and it may be old. State the age plainly in your first sentence when it is over a day.',
    'Two short paragraphs maximum. No preamble. Never invent a number that is not in the data.',
    'If research ran before you, say explicitly whether your data supports or contradicts it — that agreement is the point of the chain.',
    'End with one line: HANDOFF: <what the next agent should take from this>',
  ].join(' ');

  const text = await callLlm(
    system,
    `Symbol of interest: ${symbol}\n\n${upstreamBlock(upstream)}\n\nYOUR DATA:\n${facts}`,
  );
  const handoffLine = text.split('\n').find(l => l.trim().toUpperCase().startsWith('HANDOFF:'));

  await remember({
    agent: 'axe_intel',
    kind: 'fact',
    symbol,
    content: text.slice(0, 4000),
    category: 'intel-read',
    confidence: 0.6,
    source: `desk-intel:${sourceAge}`,
  });

  return {
    ok: true, rowsSeen, sourceAge,
    headline: handoffLine?.replace(/^\s*HANDOFF:\s*/i, '').slice(0, 120) ?? `Intel read · ${sourceAge}`,
    detail: text,
  };
}

/**
 * AXE CORE's Companion read.
 *
 * Companion's contribution is a second opinion with indicators behind it, so
 * this reads the chart snapshots and briefings its app leaves in Supabase
 * rather than requiring its desktop app to be running — which is what made
 * this lane say "not reachable" for most of a day.
 */
export async function runDeskCompanion(
  symbol: string,
  callLlm?: CallLlm,
  upstream?: UpstreamContext,
): Promise<DeskAgentResult> {
  const [snaps, briefings] = await Promise.all([
    (async () => {
      try {
        return await sbGetRows<Record<string, unknown>>('chart_live_snapshots', {
          limit: 20, orderBy: 'updated_at', orderDir: 'desc',
        });
      } catch { return []; }
    })(),
    safeRows('axe_daily_briefings', 10),
  ]);

  const rowsSeen = snaps.length + briefings.length;
  const sourceAge = ageOf(
    [newest(snaps, 'updated_at'), newest(briefings, 'created_at')]
      .filter(Boolean).sort().pop() as string | undefined,
  );

  if (rowsSeen === 0) {
    return {
      ok: false, rowsSeen: 0, sourceAge,
      headline: 'No Companion data in the database',
      detail: 'The AXE Companion app has written nothing readable here. Nothing to weigh.',
    };
  }

  if (!callLlm) {
    return {
      ok: true, rowsSeen, sourceAge,
      headline: `${rowsSeen} Companion rows · ${sourceAge}`,
      detail: 'No model configured, so this lane is counting rows rather than reading them.',
    };
  }

  const facts = [
    `Chart snapshots: ${snaps.length}`,
    `Daily briefings: ${briefings.length}`,
    `Freshest input: ${sourceAge}`,
    '',
    'SNAPSHOTS:',
    ...snaps.slice(0, 6).map(r => `- ${JSON.stringify(r).slice(0, 240)}`),
    '',
    'BRIEFINGS:',
    ...briefings.slice(0, 4).map(r => `- ${JSON.stringify(r).slice(0, 240)}`),
  ].join('\n');

  const system = [
    'You are AXE Companion inside AXE CORE: the second opinion, with indicators and chart context behind you.',
    'Your job is to agree or disagree with the case so far and say why — a second opinion that always agrees is not one.',
    'You did NOT capture this data; another application did, and it may be old. Say the age plainly when it is over a day.',
    'Two short paragraphs maximum. Never invent a level that is not in the data.',
    'Weigh what research and intel concluded before you and say where you differ. Agreeing with both without adding a level or a caveat means you added nothing.',
    'When the data supports it, name the levels the trading agent should watch — Fibonacci retracements, volumetric order blocks, prior highs and lows — because those are what it sizes and stops against.',
    'End with one line: HANDOFF: <the levels and the stance the trading agent should act on>',
  ].join(' ');

  const text = await callLlm(
    system,
    `Symbol of interest: ${symbol}\n\n${upstreamBlock(upstream)}\n\nYOUR DATA:\n${facts}`,
  );
  const handoffLine = text.split('\n').find(l => l.trim().toUpperCase().startsWith('HANDOFF:'));

  await remember({
    agent: 'axe_companion',
    kind: 'fact',
    symbol,
    content: text.slice(0, 4000),
    category: 'companion-read',
    confidence: 0.6,
    source: `desk-companion:${sourceAge}`,
  });

  return {
    ok: true, rowsSeen, sourceAge,
    headline: handoffLine?.replace(/^\s*HANDOFF:\s*/i, '').slice(0, 120) ?? `Companion read · ${sourceAge}`,
    detail: text,
  };
}

/** Which namespace each desk agent writes. Exported so the Brain tab and the
 *  agent registry cannot drift apart on the spelling. */
export const DESK_AGENT_NAMESPACES: Record<'intel' | 'companion', MemoryNamespace> = {
  intel: 'axe_intel',
  companion: 'axe_companion',
};
