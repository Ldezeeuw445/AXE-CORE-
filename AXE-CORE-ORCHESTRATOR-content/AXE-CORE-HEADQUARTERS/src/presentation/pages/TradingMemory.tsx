/**
 * Trading Memory — what the trading agent actually knows, shown as itself.
 *
 * The ask was "I want to be able to see the whole trading memory clearly",
 * and the reason it could not be seen is in tradingMemoryService: the agent's
 * 14,873 rows live in `global_memory` under the category `system_event`, so
 * every view of memory showed them as undifferentiated system noise.
 *
 * Nothing here is new data. This is the same rows, read by the structure they
 * always had, laid out in the order the agent actually works in:
 *
 *     intel -> cycle -> decision -> trade -> win / loss / mistake -> lesson
 *
 * Built on Page/Block so the blocks are equal by construction and long lists
 * scroll inside their own block instead of stretching the page.
 *
 * Layout (TradingMemory.css): one grid of eight equal tracks over the full
 * .axe-tabruimte width. The eight funnel tiles take one track each, the four
 * columns two -- so every column has exactly two tiles above it, on the same
 * column lines. The columns take the rest of the height and scroll inside.
 */
import { useCallback, useEffect, useState } from 'react';
import './TradingMemory.css';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Page, Block, Stat } from '@/presentation/components/surface/Page';
import {
  loadTradingMemory, winRate,
  type TradingMemoryOverview, type MemoryNote, type SymbolRow,
} from '@/infrastructure/persistence/tradingMemoryService';

/** The funnel, in the order the agent runs it. Labels are the agent's own. */
const FUNNEL: { kind: string; label: string; what: string }[] = [
  { kind: 'intel',    label: 'Intel',    what: 'what it saw' },
  { kind: 'cycle',    label: 'Cycle',    what: 'when it looked' },
  { kind: 'decision', label: 'Decision', what: 'what it chose' },
  { kind: 'trade',    label: 'Trade',    what: 'what it did' },
  { kind: 'win',      label: 'Win',      what: 'what paid off' },
  { kind: 'loss',     label: 'Loss',     what: 'what went wrong' },
  { kind: 'mistake',  label: 'Mistake',  what: 'what it blames itself for' },
  { kind: 'lesson',   label: 'Lesson',   what: 'what it kept' },
  // 'what' above is only used for the lesson tile when the noise count is
  // unavailable; when it is known the label says "real · N score lines apart"
  // instead.
];

const TONE: Record<string, 'default' | 'ok' | 'warn' | 'err' | 'accent'> = {
  win: 'ok', loss: 'err', mistake: 'warn', lesson: 'accent',
};

function shortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

/** One symbol's row. Bars are relative to the busiest symbol, not absolute. */
function SymbolLine({ row, max }: { row: SymbolRow; max: number }) {
  const activity = row.decisions + row.cycles;
  const settled = row.wins + row.losses;
  return (
    <div className="flex items-center gap-2.5 rounded-card px-2 py-1.5">
      <code className="w-[68px] flex-none font-mono text-[12px]" style={{ color: 'var(--text-primary)' }}>
        {row.symbol}
      </code>
      <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${max ? (activity / max) * 100 : 0}%`, background: 'var(--accent-cyan)' }}
        />
      </div>
      <span className="w-[52px] flex-none text-right font-mono text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {activity}
      </span>
      {settled > 0 ? (
        <span className="w-[54px] flex-none text-right font-mono text-[11px] tabular-nums">
          <span style={{ color: 'var(--success)' }}>{row.wins}</span>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span style={{ color: 'var(--error)' }}>{row.losses}</span>
        </span>
      ) : (
        // Not the same as 0/0: nothing has settled, so there is no rate to read.
        <span className="w-[54px] flex-none text-right font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
          —
        </span>
      )}
      <span className="w-[38px] flex-none text-right font-mono text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {row.confidence == null ? '—' : row.confidence.toFixed(2)}
      </span>
    </div>
  );
}

function NoteLine({ n }: { n: MemoryNote }) {
  return (
    <div className="flex gap-2.5 rounded-card px-2 py-1.5">
      <span className="w-[58px] flex-none font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {n.symbol || '—'}
      </span>
      <p className="min-w-0 flex-1 break-words text-[12px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
        {n.text || <span style={{ color: 'var(--text-muted)' }}>(empty)</span>}
      </p>
      <span className="w-[42px] flex-none text-right font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
        {shortDate(n.at)}
      </span>
    </div>
  );
}

export default function TradingMemory() {
  const [data, setData] = useState<TradingMemoryOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await loadTradingMemory()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const kinds = data?.kinds ?? [];
  const byKind = Object.fromEntries(kinds.map(k => [k.kind, k]));
  const symbols = data?.symbols ?? [];
  const maxActivity = symbols.reduce((m, r) => Math.max(m, r.decisions + r.cycles), 0);
  const rate = winRate(symbols);
  const lastAt = kinds.reduce<string | null>(
    (a, k) => (k.lastAt && (!a || k.lastAt > a) ? k.lastAt : a), null,
  );

  return (
    <Page
      className="axe-tabruimte axe-tm"
      title="Trading Memory"
      subtitle={
        data?.error
          ? 'Could not read the memory — see the block below'
          : lastAt
            ? `${data?.total.toLocaleString('en-US')} memories · last written ${shortDate(lastAt)}`
            : 'The trading agent, separate from the rest of the memory'
      }
      actions={
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-button px-3 py-1.5 text-[12px] font-medium"
          style={{
            background: 'var(--tint)', border: '1px solid var(--tint-line)',
            color: 'var(--accent-cyan)', opacity: loading ? 0.6 : 1,
          }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} />
          {loading ? 'Reading…' : 'Refresh'}
        </button>
      }
    >
      {data?.error && (
        <div
          className="mb-3 flex items-start gap-2 rounded-card p-3 text-[12px]"
          style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.28)', color: 'var(--text-secondary)' }}
        >
          <AlertTriangle size={14} style={{ color: 'var(--error)', flex: 'none', marginTop: 1 }} />
          <span>
            The memory could not be read, so this is <b>not</b> an empty result but a
            failed one. <code className="font-mono text-[11px]">{data.error}</code>
          </span>
        </div>
      )}

      {/* Eén raster: de trechter (acht tegels, één spoor elk) en daaronder de
          vier kolommen (twee sporen elk). Zo staan er per kolom precies twee
          tegels boven, op dezelfde kolomlijnen. */}
      <div className="axe-tm-raster">
        {FUNNEL.map(f => {
          // The lesson block is the one place a raw row count lies. The agent
          // writes 3,537 rows it calls lessons; 3,059 of them are the string
          // `HOLD score=0.081`. Printing 3,537 under "what it remembered"
          // would be the same inflated number this page exists to retire --
          // and it was the biggest type on the screen. Show the real count,
          // and say what the rest is instead of dropping it.
          const isLesson = f.kind === 'lesson';
          const raw = byKind[f.kind]?.count ?? 0;
          const value = isLesson ? (data?.lessonsRealTotal ?? 0) : raw;
          return (
            <Block key={f.kind} title={f.label} className="axe-tm-tegel">
              <Stat
                value={loading ? '·' : value.toLocaleString('en-US')}
                tone={TONE[f.kind] ?? 'default'}
                label={
                  isLesson && data && data.lessonNoise > 0
                    ? `real · ${data.lessonNoise.toLocaleString('en-US')} score lines apart`
                    : f.what
                }
              />
            </Block>
          );
        })}

        <Block
          span={2}
          className="axe-tm-kolom"
          title="Per symbol"
          action={
            <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              activity · W/L · confidence
            </span>
          }
        >
          {symbols.length === 0 ? (
            <p className="pt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {loading ? 'Reading…' : 'Nothing found.'}
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {symbols.map(r => <SymbolLine key={r.symbol} row={r} max={maxActivity} />)}
            </div>
          )}
        </Block>

        <Block
          span={2}
          className="axe-tm-kolom"
          title="Lessons"
          action={
            // Het aantal dat weggefilterd is staat er expliciet bij. Ruis
            // verbergen is prima; verbergen dát er ruis is niet.
            <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {data
                ? `${data.lessonsRealTotal.toLocaleString('en-US')} real · ${data.lessonNoise.toLocaleString('en-US')} score lines`
                : ''}
            </span>
          }
        >
          {data?.lessons.length ? (
            <div className="flex flex-col gap-0.5">
              {data.lessons.map((n, i) => <NoteLine key={`${n.at}-${i}`} n={n} />)}
            </div>
          ) : (
            <p className="pt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {loading ? 'Reading…' : 'No lessons yet.'}
            </p>
          )}
        </Block>

        <Block
          span={2}
          className="axe-tm-kolom"
          title="Mistakes"
          action={
            <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {(byKind.mistake?.count ?? 0).toLocaleString('en-US')} total
            </span>
          }
        >
          {data?.mistakes.length ? (
            <div className="flex flex-col gap-0.5">
              {data.mistakes.map((n, i) => <NoteLine key={`${n.at}-${i}`} n={n} />)}
            </div>
          ) : (
            <p className="pt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {loading ? 'Reading…' : 'No mistakes recorded.'}
            </p>
          )}
        </Block>

        <Block span={2} className="axe-tm-kolom" title="Where this lives">
          <div className="space-y-3 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            <p>
              Everything above lives in <code className="font-mono text-[11px]">global_memory</code>,
              under the category <code className="font-mono text-[11px]">system_event</code>, with
              keys shaped like{' '}
              <code className="font-mono text-[11px]">ta:axe_trading_agent:&lt;kind&gt;:&lt;id&gt;</code>.
            </p>
            <p>
              That is <b>95%</b> of that table — the entire brain of the trading agent, written
              away under a label that means "other". That is why the memory looked like one heap:
              it was not unsorted, it sat in a box with the wrong name.
            </p>
            {rate != null && (
              <p>
                Of the closed trades, <b>{Math.round(rate * 100)}%</b> is booked as a win
                ({symbols.reduce((n, r) => n + r.wins, 0)} against{' '}
                {symbols.reduce((n, r) => n + r.losses, 0)}). That is what the agent noted itself,
                not a recalculation from the broker.
              </p>
            )}
            {data && data.lessonNoise > 0 && (
              <p>
                Of the {(byKind.lesson?.count ?? 0).toLocaleString('en-US')} rows the agent writes
                as a <i>lesson</i>,{' '}
                <b>{data.lessonNoise.toLocaleString('en-US')}</b> are a bare score line
                (<code className="font-mono text-[11px]">HOLD score=0.081</code>), every cycle
                again. Those are not among the lessons above — the{' '}
                <b>{data.lessonsRealTotal.toLocaleString('en-US')}</b> real lessons had
                disappeared into them. The Lessons column shows the {data.lessons.length} newest of those.
              </p>
            )}
            <p style={{ color: 'var(--text-muted)' }}>
              This page writes nothing. The agent keeps writing through its own path.
            </p>
          </div>
        </Block>
      </div>
    </Page>
  );
}
