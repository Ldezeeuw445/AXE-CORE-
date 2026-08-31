/**
 * The account tab. Shows CONNECTED BROKER ACCOUNTS AND NOTHING ELSE —
 * balance, open positions and closed history, all of it read from MetaAPI.
 *
 * It no longer falls back to AXE's internal paper mirror. That fallback put a
 * simulated $100k book where a real account belongs, and once the pacing layer
 * started refusing reads it did so while an account WAS connected: Luka saw
 * $21,592,099 in cash and fills at NAS100 @ 38.58 under a header that read
 * "no MT5 connected".
 *
 * The rule this tab now keeps: if a number is on this page, a broker returned
 * it. Not connected says not connected; an unreadable history says so and why.
 */
import { TradeBadge } from '@/presentation/components/trading/TradeBadge';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import type { TradingDeskState } from './useTradingDeskState';

function rawSide(type: unknown): string {
  const t = String(type ?? '').toUpperCase();
  return t.includes('SELL') ? 'sell' : 'buy';
}

/** The strategy tag on an order comment ("AXE <strategy>"). Same rule as the
 *  reconciler: a bare side+confidence stamp ("AXE b72") is not a strategy. */
const TF_RE = /^(.*?)\s+(m5|m15|m30|h1|h4|d1)$/i;
/** Het timeframe uit de tag, als de trade er een draagt. */
function tfOf(comment: unknown): string | null {
  const t = tagOf(comment);
  return t?.match(TF_RE)?.[2]?.toLowerCase() ?? null;
}
/** De strategie zonder het timeframe-achtervoegsel — anders zou het bolletje
 *  voor "volumetric-ob h4" een andere kleur krijgen dan voor "volumetric-ob". */
function stratOf(comment: unknown): string | null {
  const t = tagOf(comment);
  if (!t) return null;
  return t.match(TF_RE)?.[1]?.trim() ?? t;
}

function tagOf(comment: unknown): string | null {
  const m = typeof comment === 'string' ? comment.trim().match(/^AXE\s+(.+)$/i) : null;
  const tag = m?.[1]?.trim();
  return tag && !/^[bs]\d+$/i.test(tag) ? tag : null;
}

export function DemoBookTab({ desk }: { desk: TradingDeskState }) {
  const { ownBookSource, ownBookLoading, ownBookTrades, ownBookHistoryError, metaPositions, mt5Balance } = desk;

  if (ownBookSource === 'metaapi') {
    return (
      <div className="max-w-[900px]">
        <WidgetCard title="Account — real MT5 via MetaAPI">
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))] mb-3 text-sm font-mono-data">
            <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Balance</div><div style={{ color: '#F5F0E6' }}>{mt5Balance?.balance != null ? `${mt5Balance.balance.toFixed(2)} ${mt5Balance.currency || ''}` : '—'}</div></div>
            <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Equity</div><div style={{ color: '#a78bfa' }}>{mt5Balance?.equity != null ? `${mt5Balance.equity.toFixed(2)} ${mt5Balance.currency || ''}` : '—'}</div></div>
            <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Free margin</div><div style={{ color: '#F5F0E6' }}>{mt5Balance?.freeMargin != null ? `${mt5Balance.freeMargin.toFixed(2)} ${mt5Balance.currency || ''}` : '—'}</div></div>
          </div>

          <div className="text-[10px] uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Open positions</div>
          {ownBookLoading && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Loading…</p>}
          {!ownBookLoading && !metaPositions?.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Flat</p>}
          {metaPositions?.map((p, i) => {
            const profit = Number(p.profit ?? 0);
            return (
              <div key={String(p.id ?? i)} className="flex justify-between text-[12px] font-mono-data mb-1" style={{ color: '#F5F0E6' }}>
                <span className="flex items-center gap-1.5">
                  {/* Which strategy opened this, and out of which framework —
                      read off the order comment the position carries. */}
                  <TradeBadge
                    strategies={[stratOf(p.comment)]}
                    timeframe={tfOf(p.comment)}
                    side={rawSide(p.type)}
                    pair={String(p.symbol ?? '')}
                    detail={`${Number(p.volume ?? 0)} @ ${Number(p.openPrice ?? 0).toFixed(2)}`}
                  />
                </span>
                <span style={{ color: profit >= 0 ? 'var(--success)' : 'var(--error)' }}>{profit >= 0 ? '+' : ''}{profit.toFixed(2)}</span>
              </div>
            );
          })}

          <div className="text-[10px] uppercase mt-3 mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Closed trades (last 180 days)</div>
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {ownBookTrades.slice(0, 100).map((t, i) => (
              <div key={i} className="text-[11px] flex justify-between" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <span className="flex items-center gap-1.5" style={{ color: (t.side ?? 'buy') === 'buy' ? 'var(--success)' : 'var(--error)' }}>
                  {/* metaApiDealsToJournalTrades already lifted the strategy tag
                      off the OPENING deal into `comment`, so this is the same
                      attribution the ledger learns from — the dot and the
                      learning cannot disagree. */}
                  <TradeBadge
                    strategies={[stratOf(`AXE ${t.comment ?? ''}`)]}
                    timeframe={tfOf(`AXE ${t.comment ?? ''}`)}
                    side={t.side}
                    pair={String(t.symbol ?? '')}
                    detail={`${t.volume ?? '—'} @ ${t.closePrice?.toFixed(2) ?? '—'}`}
                  />
                </span>
                <span style={{ color: t.profit >= 0 ? 'var(--success)' : 'var(--error)' }}>{t.profit >= 0 ? '+' : ''}{t.profit.toFixed(2)}</span>
                <span>{t.closeTime?.slice(0, 19) ?? '—'}</span>
              </div>
            ))}
            {/* An unreadable history says so. It does NOT become a simulated
                book: this tab used to swap a real 48k EUR account for one
                showing $21,592,099 the moment a single history call was
                refused — often refused by AXE's own pacing, not the broker. */}
            {!ownBookTrades.length && !ownBookLoading && ownBookHistoryError && (
              <p className="text-[11px]" style={{ color: 'var(--error)' }}>
                History unavailable — {ownBookHistoryError}. Balance and open positions above are live;
                only the closed-trade list is missing, and it will fill on the next successful read.
              </p>
            )}
            {!ownBookTrades.length && !ownBookLoading && !ownBookHistoryError && (
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>No closed trades in this window.</p>
            )}
          </div>
        </WidgetCard>
      </div>
    );
  }

  // THE SIMULATED BOOK IS NOT REACHABLE FROM THIS TAB. AT ALL.
  //
  // It used to render a $100k paper account here whenever MetaAPI was not
  // connected — and, until today, also whenever a single history call was
  // refused. Luka saw $21,592,099 in cash and fills at NAS100 @ 38.58 sitting
  // where his 48k EUR account should be, and asked three times for it to go.
  //
  // He is right, and the reason is not cosmetic. This tab is where you check
  // what the algo actually did with real money. A number that is merely
  // plausible is worse here than no number: it is indistinguishable from the
  // real one at a glance, and every wrong decision made from it is made
  // confidently. An account that is not connected says so and offers the one
  // action that fixes it.
  //
  // The paper account still exists in the engine (markPositions and the
  // trades-today count read it), it simply has no window into the trading tab.
  return (
    <div className="max-w-[900px]">
      <WidgetCard title="No account connected">
        <p className="text-[12px] mb-2" style={{ color: '#F5F0E6' }}>
          This tab only ever shows accounts you have actually connected.
        </p>
        <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Connect MetaAPI in Settings, or add an account under the Accounts tab, and the real
          balance, open positions and closed history appear here. Nothing is simulated in
          this view — if a number is on this page, a broker returned it.
        </p>
      </WidgetCard>
    </div>
  );
}
