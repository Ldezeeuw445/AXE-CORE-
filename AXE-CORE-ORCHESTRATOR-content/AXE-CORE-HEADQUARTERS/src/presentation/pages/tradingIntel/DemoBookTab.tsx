/**
 * DemoBookTab — the account. Shows the REAL connected MT5 account (balance,
 * open positions, closed history) when MetaAPI is connected — not just
 * AXE's internal $100k paper mirror, which only ever reflects trades AXE
 * itself placed. Falls back to the paper book only when nothing's connected.
 */
import { StrategyDots, FrameworkMark, TimeframeMark } from '@/presentation/components/trading/StrategyDot';
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
  const { account, eq, upnl, resetDemoAccount, ownBookSource, ownBookLoading, ownBookTrades, metaPositions, mt5Balance } = desk;

  if (ownBookSource === 'metaapi') {
    return (
      <div className="max-w-[900px]">
        <WidgetCard title="Account — real MT5 via MetaAPI">
          <div className="grid grid-cols-3 gap-2 mb-3 text-sm font-mono-data">
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
                  <FrameworkMark strategy={tagOf(p.comment)} size={7} />
                  <StrategyDots strategies={[stratOf(p.comment)]} />
                  <TimeframeMark timeframe={tfOf(p.comment)} size={9} />
                  {String(p.symbol ?? '')} · {rawSide(p.type).toUpperCase()} {Number(p.volume ?? 0)} @ {Number(p.openPrice ?? 0).toFixed(2)}
                </span>
                <span style={{ color: profit >= 0 ? '#34d399' : '#f87171' }}>{profit >= 0 ? '+' : ''}{profit.toFixed(2)}</span>
              </div>
            );
          })}

          <div className="text-[10px] uppercase mt-3 mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Closed trades (last 180 days)</div>
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {ownBookTrades.slice(0, 100).map((t, i) => (
              <div key={i} className="text-[11px] flex justify-between" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <span className="flex items-center gap-1.5" style={{ color: (t.side ?? 'buy') === 'buy' ? '#34d399' : '#f87171' }}>
                  {/* metaApiDealsToJournalTrades already lifted the strategy tag
                      off the OPENING deal into `comment`, so this is the same
                      attribution the ledger learns from — the dot and the
                      learning cannot disagree. */}
                  <FrameworkMark strategy={t.comment} size={7} />
                  <StrategyDots strategies={[stratOf(`AXE ${t.comment ?? ''}`)]} />
                  <TimeframeMark timeframe={tfOf(`AXE ${t.comment ?? ''}`)} size={9} />
                  {(t.side ?? '—').toUpperCase()} {t.volume ?? '—'} {t.symbol} @ {t.closePrice?.toFixed(2) ?? '—'}
                </span>
                <span style={{ color: t.profit >= 0 ? '#34d399' : '#f87171' }}>{t.profit >= 0 ? '+' : ''}{t.profit.toFixed(2)}</span>
                <span>{t.closeTime?.slice(0, 19) ?? '—'}</span>
              </div>
            ))}
            {!ownBookTrades.length && !ownBookLoading && (
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>No closed trades in this window.</p>
            )}
          </div>
        </WidgetCard>
      </div>
    );
  }

  if (!account) return null;

  return (
    <div className="max-w-[900px]">
      <WidgetCard title="Demo book (internal paper mirror — no MT5 connected)" headerAction={
        <button type="button" className="text-[10px]" style={{ color: '#f87171' }} onClick={() => void resetDemoAccount()}>Reset $100k</button>
      }>
        <p className="text-[10px] mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Connect MetaAPI in Settings to see the real MT5 account here instead of this simulated book.
        </p>
        <div className="grid grid-cols-3 gap-2 mb-3 text-sm font-mono-data">
          <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Cash</div><div style={{ color: '#F5F0E6' }}>${account.cash.toFixed(2)}</div></div>
          <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Equity</div><div style={{ color: '#a78bfa' }}>${eq.toFixed(2)}</div></div>
          <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>uPnL</div><div style={{ color: upnl >= 0 ? '#34d399' : '#f87171' }}>${upnl.toFixed(2)}</div></div>
        </div>
        <div className="text-[10px] uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Open positions</div>
        {!account.positions.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Flat</p>}
        {account.positions.map(p => {
          const mark = p.markPrice ?? p.avgPrice;
          const pnl = (mark - p.avgPrice) * p.qty;
          return (
            <div key={p.symbol} className="flex justify-between text-[12px] font-mono-data mb-1" style={{ color: '#F5F0E6' }}>
              <span>{p.symbol} · {p.qty} @ {p.avgPrice.toFixed(2)}</span>
              <span style={{ color: pnl >= 0 ? '#34d399' : '#f87171' }}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}</span>
            </div>
          );
        })}
        <div className="text-[10px] uppercase mt-3 mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Fills / closed</div>
        <div className="max-h-[400px] overflow-y-auto space-y-1">
          {account.trades.slice(0, 60).map(t => (
            <div key={t.id} className="text-[11px] flex justify-between" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <span style={{ color: t.side === 'buy' ? '#34d399' : '#f87171' }}>{t.side.toUpperCase()} {t.qty} {t.symbol} @ {t.price}</span>
              <span>{t.createdAt.slice(11, 19)}</span>
            </div>
          ))}
        </div>
      </WidgetCard>
    </div>
  );
}
