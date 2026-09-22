/**
 * HistoryPanel — hoe ver de bewaarde geschiedenis werkelijk teruggaat, per
 * symbool × timeframe × provider, en een backfill voor het huidige paar.
 * Geen belofte van "10 jaar": wat hier staat, is wat er is.
 */
import { useCallback, useEffect, useState } from 'react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { getHistory, historyCoverage } from '@/application/tradingIntel/historyService';
import type { SeriesCoverage } from '@/domain/tradingIntel/candleCache';

const INPUT_STYLE = { background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' } as const;

export function HistoryPanel({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const [rows, setRows] = useState<SeriesCoverage[]>([]);
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const reload = useCallback(() => { void historyCoverage().then(setRows).catch(() => undefined); }, []);
  useEffect(() => { reload(); }, [reload]);

  const backfill = async () => {
    setBusy(true); setStatus(null);
    try {
      const res = await getHistory({
        symbol, timeframe,
        from: from ? new Date(`${from}T00:00:00Z`).toISOString() : null,
        minBars: 1000,
        onProgress: m => setStatus(m),
      });
      setStatus(res.ok
        ? `${res.coverage.count} bars · ${res.coverage.from?.slice(0, 10)} → ${res.coverage.to?.slice(0, 10)}${res.coverage.exhaustedBefore ? ' · that is all MetaAPI has' : ''} · ${res.pagesFetched} page(s) fetched`
        : res.error);
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <WidgetCard title="History cache">
      <div className="flex flex-wrap items-end gap-2 mb-2">
        <label className="grid gap-1">
          <span className="text-[10px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>Backfill {symbol} {timeframe} from</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="rounded px-2 py-1.5 text-[12px]" style={INPUT_STYLE} />
        </label>
        <button type="button" disabled={busy} onClick={() => void backfill()}
          className="px-3 py-1.5 rounded text-[11px] disabled:opacity-40" style={{ border: '1px solid rgba(167,139,250,0.3)', color: '#c4b5fd' }}>
          {busy ? 'Fetching…' : 'Fetch missing bars'}
        </button>
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Only bars not already cached are downloaded, one MetaAPI page at a time at background priority.
        </span>
      </div>
      {status && <p className="text-[10px] font-mono-data mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>{status}</p>}
      {rows.length === 0
        ? <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Nothing cached yet. The Strategy Lab fills this as it runs.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10.5px] font-mono-data">
              <thead>
                <tr style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {['Symbol', 'TF', 'Provider', 'From', 'To', 'Bars', 'Days', ''].map(hd => <th key={hd} className="text-left font-normal pb-1 pr-3">{hd}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={`${r.provider}:${r.symbol}:${r.timeframe}`} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td className="py-1 pr-3" style={{ color: '#F5F0E6' }}>{r.symbol}</td>
                    <td className="py-1 pr-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{r.timeframe}</td>
                    <td className="py-1 pr-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{r.provider}</td>
                    <td className="py-1 pr-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{r.from?.slice(0, 10) ?? '—'}</td>
                    <td className="py-1 pr-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{r.to?.slice(0, 10) ?? '—'}</td>
                    <td className="py-1 pr-3" style={{ color: '#F5F0E6' }}>{r.count.toLocaleString()}</td>
                    <td className="py-1 pr-3" style={{ color: '#F5F0E6' }}>{r.days}</td>
                    <td className="py-1 pr-3" style={{ color: 'rgba(255,255,255,0.4)' }}>{r.exhaustedBefore ? 'provider limit reached' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </WidgetCard>
  );
}
