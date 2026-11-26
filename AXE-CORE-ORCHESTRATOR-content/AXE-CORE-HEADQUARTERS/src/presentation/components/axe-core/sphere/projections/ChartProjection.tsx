/**
 * Grafiek in het 3D-vak (26 nov, opnieuw: Luka "het moet 100% kloppen").
 *
 * Koers (Binance-candles): echte candlesticks, as van laag tot hoog, prijs- en
 * tijdlabels, laatste koers en verandering groot. Verdeling (inkomen per bron):
 * horizontale balken vanaf 0 met bedragen. Geen nep, geen sample: zonder echte
 * reeks zet de resolver niets neer (chartResolver.ts).
 */
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { leesCandles, prijsAs, prijsTekst, verandering, type Candle } from '@/domain/sphere/grafiek';

const OP = '#34D399';
const NEER = '#F87171';
const LIJN = 'rgba(255,255,255,0.06)';
const LABEL = 'rgba(255,255,255,0.42)';

function uurLabel(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}

function Kop({ titel, waarde, sub, toon }: { titel: string; waarde?: string; sub?: string; toon?: 'op' | 'neer' }) {
  return (
    <div className="flex-shrink-0 px-5 pt-4 pb-2 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted, #71717a)' }}>{titel}</div>
        {waarde && <div className="mt-1 text-[26px] font-semibold leading-none tabular-nums" style={{ color: 'var(--text-primary, #f4f4f5)' }}>{waarde}</div>}
      </div>
      {sub && (
        <div className="text-[13px] font-semibold tabular-nums" style={{ color: toon === 'op' ? OP : toon === 'neer' ? NEER : 'var(--text-secondary)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Candles({ candles, symbool }: { candles: Candle[]; symbool: string }) {
  const v = verandering(candles)!;
  const as = prijsAs(v.laag, v.hoog, 4);
  const w = 720, h = 300, padL = 64, padR = 16, padT = 10, padB = 28;
  const iw = w - padL - padR, ih = h - padT - padB;
  const y = (p: number) => padT + ih - ((p - as.min) / (as.max - as.min)) * ih;
  const stap = iw / candles.length;
  const breed = Math.max(2, Math.min(14, stap * 0.62));
  const elke = Math.max(1, Math.round(candles.length / 6));
  const op = v.pct >= 0;
  return (
    <div className="h-full flex flex-col min-h-0" data-axe-grafiek="candles">
      <Kop titel={`${symbool} · 1h candles · 24h`} waarde={prijsTekst(v.laatste)}
        sub={`${op ? '+' : ''}${v.pct.toFixed(2)}%`} toon={op ? 'op' : 'neer'} />
      <div className="flex-1 min-h-0 px-3 pb-2">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full" role="img"
          aria-label={`${symbool} last 24 hours, ${prijsTekst(v.laatste)}, ${v.pct.toFixed(2)}%`}>
          {as.ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={LIJN} />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={LABEL} style={{ fontVariantNumeric: 'tabular-nums' }}>{prijsTekst(t)}</text>
            </g>
          ))}
          {candles.map((c, i) => {
            const x = padL + i * stap + stap / 2;
            const kleur = c.c >= c.o ? OP : NEER;
            const top = y(Math.max(c.o, c.c));
            const bodem = y(Math.min(c.o, c.c));
            return (
              <g key={c.t}>
                <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={kleur} strokeWidth={1.2} />
                <rect x={x - breed / 2} y={top} width={breed} height={Math.max(1, bodem - top)} fill={kleur} rx={1} />
                {i % elke === 0 && (
                  <text x={x} y={h - 8} textAnchor="middle" fontSize={11} fill={LABEL}>{uurLabel(c.t)}</text>
                )}
              </g>
            );
          })}
          {/* Laatste koers als stippellijn met label rechts. */}
          <line x1={padL} x2={w - padR} y1={y(v.laatste)} y2={y(v.laatste)} stroke={op ? OP : NEER} strokeDasharray="3 4" strokeWidth={1} opacity={0.7} />
        </svg>
      </div>
      <div className="flex-shrink-0 px-5 pb-3 flex gap-5 text-[11px] tabular-nums" style={{ color: LABEL }}>
        <span>High <b style={{ color: 'var(--text-primary)' }}>{prijsTekst(v.hoog)}</b></span>
        <span>Low <b style={{ color: 'var(--text-primary)' }}>{prijsTekst(v.laag)}</b></span>
        <span className="ml-auto">Source: Binance, live</span>
      </div>
    </div>
  );
}

function Verdeling({ payload }: { payload: ProjectionPayload }) {
  const raw = Array.isArray(payload.data?.series) ? (payload.data!.series as Record<string, unknown>[]) : [];
  const rijen = raw.map((r) => ({ label: String(r.label ?? ''), value: Number(r.value ?? 0) })).filter((r) => Number.isFinite(r.value));
  const max = Math.max(...rijen.map((r) => r.value), 0) || 1;
  const valuta = payload.data?.currency != null ? `${String(payload.data.currency)} ` : '';
  return (
    <div className="h-full flex flex-col min-h-0" data-axe-grafiek="verdeling">
      <Kop titel={payload.title} sub={payload.subtitle} />
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 flex flex-col gap-2.5">
        {rijen.map((r) => (
          <div key={r.label} className="flex items-center gap-3 text-[12px]">
            <span className="w-28 flex-shrink-0 truncate" style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
            <span className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <span className="block h-full rounded-full" style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, background: 'var(--accent-cyan, #22d3ee)' }} />
            </span>
            <span className="w-24 flex-shrink-0 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {valuta}{r.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartProjection({ payload }: { payload: ProjectionPayload }) {
  const candles = leesCandles(payload.data?.series);
  if (candles.length >= 2) {
    return <Candles candles={candles} symbool={String(payload.data?.symbol ?? payload.title).replace('USDT', '/USDT')} />;
  }
  const heeftReeks = Array.isArray(payload.data?.series) && (payload.data!.series as unknown[]).length > 0;
  if (heeftReeks) return <Verdeling payload={payload} />;
  return (
    <div className="h-full flex items-center justify-center text-[12px] px-6" style={{ color: 'var(--text-muted)' }}>
      No live data for this question.
    </div>
  );
}
