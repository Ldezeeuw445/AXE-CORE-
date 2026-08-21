/**
 * The funnel: pair → strategy → timeframe → side → outcome.
 *
 * Reads the (pair × strategy × timeframe) ledger, which is the same record the
 * algo ranks strategies from — so what this draws and what AXE actually trades
 * cannot disagree. Colours come from domain/tradingIntel/strategyColors.ts, the
 * one registry that also paints the dots and triangles elsewhere in the app;
 * a second palette here would drift within a week.
 *
 * Ribbon WIDTH is trade count and ribbon COLOUR is the strategy, so a thick
 * band running into "loss" is a strategy losing you money at a glance, and a
 * thin one is a sample too small to mean anything yet. That is the whole point
 * of the shape: what works and what does not, per pair, without reading a table.
 *
 * HONEST ABOUT THE SIDE COLUMN. The ledger has never stored buy/sell — it
 * aggregates by pair, strategy and timeframe only. Per-trade notes carry the
 * side from 2026-08-21 onward, so historical trades land in an explicit
 * "unknown" band rather than being split 50/50 or quietly assumed to be buys.
 * An invented direction would make the funnel look complete while teaching the
 * wrong lesson, which is worse than a visible gap.
 */
import { useEffect, useMemo, useState } from 'react';
import { getLedger, type LedgerStats } from '@/infrastructure/persistence/tradingLedgerService';
import {
  strategyColor, frameworkColor, timeframeColor, frameworkOf, FRAMEWORK_LABELS,
} from '@/domain/tradingIntel/strategyColors';

const WIN = '#34d399';
const LOSS = '#f87171';
const UNKNOWN = 'rgba(255,255,255,0.28)';
const TEXT = '#F5F0E6';

interface Flow {
  pair: string;
  strategy: string;
  timeframe: string;
  trades: number;
  wins: number;
  losses: number;
  net: number;
}

/** A column of stacked bands, each sized by how many trades ran through it. */
interface Band {
  key: string;
  label: string;
  color: string;
  trades: number;
  y: number;
  h: number;
  /** Triangle marker for framework columns, dot for strategies. */
  shape?: 'dot' | 'triangle';
}

function buildBands(
  flows: Flow[],
  keyOf: (f: Flow) => string,
  labelOf: (k: string) => string,
  colorOf: (k: string) => string,
  totalTrades: number,
  height: number,
  gap: number,
  shape?: 'dot' | 'triangle',
): Band[] {
  const grouped = new Map<string, number>();
  for (const f of flows) grouped.set(keyOf(f), (grouped.get(keyOf(f)) ?? 0) + f.trades);
  const entries = [...grouped.entries()].sort((a, b) => b[1] - a[1]);
  const totalGap = gap * Math.max(0, entries.length - 1);
  const usable = Math.max(10, height - totalGap);
  let y = 0;
  return entries.map(([k, trades]) => {
    const h = totalTrades > 0 ? Math.max(3, (trades / totalTrades) * usable) : usable / entries.length;
    const band: Band = { key: k, label: labelOf(k), color: colorOf(k), trades, y, h, shape };
    y += h + gap;
    return band;
  });
}

function Ribbon({ x1, y1, h1, x2, y2, h2, color, opacity }: {
  x1: number; y1: number; h1: number; x2: number; y2: number; h2: number; color: string; opacity: number;
}) {
  const cx = (x1 + x2) / 2;
  const d = [
    `M ${x1} ${y1}`,
    `C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`,
    `L ${x2} ${y2 + h2}`,
    `C ${cx} ${y2 + h2}, ${cx} ${y1 + h1}, ${x1} ${y1 + h1}`,
    'Z',
  ].join(' ');
  return <path d={d} fill={color} opacity={opacity} />;
}

export function TradingFunnelGraph({ pair }: { pair?: string }) {
  const [rows, setRows] = useState<LedgerStats[] | null>(null);
  const [selected, setSelected] = useState<string | 'all'>(pair ?? 'all');

  useEffect(() => {
    let alive = true;
    getLedger()
      .then(r => { if (alive) setRows(r); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, []);

  const pairs = useMemo(
    () => [...new Set((rows ?? []).filter(r => r.trades > 0).map(r => r.pair))].sort(),
    [rows],
  );

  const flows: Flow[] = useMemo(() => {
    const live = (rows ?? []).filter(r => r.trades > 0);
    const scoped = selected === 'all' ? live : live.filter(r => r.pair === selected);
    return scoped.map(r => ({
      pair: r.pair,
      strategy: r.strategy,
      timeframe: r.timeframe || 'h1',
      trades: r.trades,
      wins: r.wins,
      losses: r.losses,
      net: r.netReturnPct,
    }));
  }, [rows, selected]);

  const total = flows.reduce((n, f) => n + f.trades, 0);

  const H = 340;
  const GAP = 6;
  const COL_W = 13;
  const XS = [0, 150, 300, 450, 600];

  const pairBands = useMemo(
    () => buildBands(flows, f => f.pair, k => k, () => 'rgba(255,255,255,0.5)', total, H, GAP),
    [flows, total],
  );
  const stratBands = useMemo(
    () => buildBands(flows, f => f.strategy, k => k, k => strategyColor(k), total, H, GAP, 'dot'),
    [flows, total],
  );
  const tfBands = useMemo(
    () => buildBands(flows, f => f.timeframe, k => k, k => timeframeColor(k), total, H, GAP),
    [flows, total],
  );

  // Side is not in the ledger. Until per-trade notes accumulate it is one
  // honest band rather than a guess — see the module comment.
  const sideBands: Band[] = useMemo(
    () => [{ key: 'unknown', label: 'richting nog niet vastgelegd', color: UNKNOWN, trades: total, y: 0, h: H, shape: undefined }],
    [total],
  );

  const outcomeBands: Band[] = useMemo(() => {
    const wins = flows.reduce((n, f) => n + f.wins, 0);
    const losses = flows.reduce((n, f) => n + f.losses, 0);
    const t = wins + losses;
    if (!t) return [];
    const usable = H - GAP;
    const wh = Math.max(3, (wins / t) * usable);
    return [
      { key: 'win', label: `win · ${wins}`, color: WIN, trades: wins, y: 0, h: wh },
      { key: 'loss', label: `loss · ${losses}`, color: LOSS, trades: losses, y: wh + GAP, h: Math.max(3, usable - wh) },
    ];
  }, [flows]);

  if (rows === null) {
    return <div className="text-xs opacity-60 p-4">Grootboek laden…</div>;
  }

  if (!total) {
    return (
      <div className="p-4 text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
        Nog geen <strong>gesloten</strong> trades in het grootboek. De funnel tekent alleen
        wat echt is afgelopen — backtest-priors tellen hier niet mee, want die
        hebben niets geriskeerd.
      </div>
    );
  }

  const columns: { title: string; bands: Band[]; x: number }[] = [
    { title: 'PAIR', bands: pairBands, x: XS[0] },
    { title: 'STRATEGIE', bands: stratBands, x: XS[1] },
    { title: 'TIMEFRAME', bands: tfBands, x: XS[2] },
    { title: 'RICHTING', bands: sideBands, x: XS[3] },
    { title: 'UITKOMST', bands: outcomeBands, x: XS[4] },
  ];

  const bandOf = (bands: Band[], key: string) => bands.find(b => b.key === key);

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setSelected('all')}
          className="text-[11px] px-2 py-1 rounded"
          style={{
            background: selected === 'all' ? 'rgba(255,255,255,0.14)' : 'transparent',
            color: TEXT, border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          alle pairs
        </button>
        {pairs.map(p => (
          <button
            key={p}
            onClick={() => setSelected(p)}
            className="text-[11px] px-2 py-1 rounded font-mono-data"
            style={{
              background: selected === p ? 'rgba(255,255,255,0.14)' : 'transparent',
              color: TEXT, border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`-8 -28 ${XS[4] + COL_W + 190} ${H + 48}`} style={{ width: '100%', minWidth: 720 }}>
          {columns.map(col => (
            <text
              key={col.title}
              x={col.x}
              y={-12}
              style={{ fontSize: 9, letterSpacing: 1.2, fill: 'rgba(255,255,255,0.45)' }}
            >
              {col.title}
            </text>
          ))}

          {/* Ribbons, drawn per flow so a strategy's colour carries all the way
              across into the outcome it produced. */}
          {flows.map((f, i) => {
            const p = bandOf(pairBands, f.pair);
            const s = bandOf(stratBands, f.strategy);
            const t = bandOf(tfBands, f.timeframe);
            if (!p || !s || !t) return null;
            const share = total ? f.trades / total : 0;
            const col = strategyColor(f.strategy);
            const hh = Math.max(2, share * (H - GAP * 3));
            return (
              <g key={`${f.pair}-${f.strategy}-${f.timeframe}-${i}`}>
                <Ribbon x1={XS[0] + COL_W} y1={p.y} h1={hh} x2={XS[1]} y2={s.y} h2={hh} color={col} opacity={0.28} />
                <Ribbon x1={XS[1] + COL_W} y1={s.y} h1={hh} x2={XS[2]} y2={t.y} h2={hh} color={col} opacity={0.28} />
                <Ribbon x1={XS[2] + COL_W} y1={t.y} h1={hh} x2={XS[3]} y2={0} h2={hh} color={col} opacity={0.16} />
              </g>
            );
          })}

          {/* Side → outcome, split by the real win/loss counts. */}
          {outcomeBands.map(o => (
            <Ribbon
              key={o.key}
              x1={XS[3] + COL_W} y1={0} h1={H}
              x2={XS[4]} y2={o.y} h2={o.h}
              color={o.color} opacity={0.22}
            />
          ))}

          {columns.map(col => (
            <g key={`bands-${col.title}`}>
              {col.bands.map(b => {
                const fw = col.title === 'STRATEGIE' ? frameworkOf(b.key) : null;
                return (
                  <g key={b.key}>
                    <rect x={col.x} y={b.y} width={COL_W} height={b.h} rx={2} fill={b.color} />
                    <text
                      x={col.x + COL_W + 6}
                      y={b.y + Math.min(b.h / 2 + 3, b.h - 1)}
                      style={{ fontSize: 10, fill: TEXT }}
                    >
                      {b.label}
                      {b.trades > 0 && col.title !== 'UITKOMST' ? (
                        <tspan style={{ fill: 'rgba(255,255,255,0.4)' }}> · {b.trades}</tspan>
                      ) : null}
                    </text>
                    {/* Framework triangle, same rule as everywhere else in the
                        app: derived from the strategy prefix, never passed in. */}
                    {fw && b.h > 9 ? (
                      <polygon
                        points={`${col.x - 9},${b.y + b.h / 2 + 4} ${col.x - 4},${b.y + b.h / 2 - 4} ${col.x + 1},${b.y + b.h / 2 + 4}`}
                        fill={frameworkColor(b.key)}
                      >
                        <title>{FRAMEWORK_LABELS[fw]}</title>
                      </polygon>
                    ) : null}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>

      <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Bandbreedte = aantal gesloten trades. Kleur = strategie (zelfde palet als de stippen),
        driehoek = framework. De kolom RICHTING vult zich zodra er trades sluiten die
        buy/sell hebben vastgelegd — oude trades hebben dat nooit opgeslagen en worden
        daarom niet gegokt.
      </p>
    </div>
  );
}
