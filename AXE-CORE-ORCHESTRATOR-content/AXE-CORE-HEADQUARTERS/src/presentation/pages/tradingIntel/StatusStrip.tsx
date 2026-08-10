/**
 * StatusStrip — always-visible header across every Trading Intel sub-tab.
 * The one thing you should never have to click into a tab to check:
 * is autopilot alive, when does it fire next, what's the account worth.
 */
import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import type { TradingDeskState } from './useTradingDeskState';

export function StatusStrip({ desk, onOpenSettings }: { desk: TradingDeskState; onOpenSettings: () => void }) {
  const { autopilot, autopilotBusy, toggleAutopilot, mt5Balance, eq, upnl, broker } = desk;

  // "next in ~Nm" needs a live clock, but reading Date.now() directly during
  // render is an impure read (unstable across re-renders/Strict Mode double
  // invoke) — tick a state value instead, same idiom as any countdown timer.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const nextCycleText = (() => {
    if (!autopilot?.enabled) return null;
    if (autopilot.running) return 'running…';
    if (!autopilot.lastRunAt) return 'due now';
    const nextAt = new Date(autopilot.lastRunAt).getTime() + autopilot.intervalMin * 60_000;
    const mins = Math.max(0, Math.round((nextAt - now) / 60_000));
    return mins <= 0 ? 'due now' : `next in ~${mins}m`;
  })();

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-b shrink-0"
      style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'linear-gradient(180deg, rgba(167,139,250,0.04), transparent)' }}
    >
      <button
        type="button"
        disabled={autopilotBusy || !autopilot}
        onClick={() => void toggleAutopilot()}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0"
        style={{
          background: autopilot?.enabled ? 'rgba(52,211,153,0.16)' : 'rgba(255,255,255,0.06)',
          color: autopilot?.enabled ? '#6ee7b7' : 'rgba(255,255,255,0.5)',
          border: `1px solid ${autopilot?.enabled ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.12)'}`,
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: autopilot?.enabled ? '#34d399' : 'rgba(255,255,255,0.3)',
            boxShadow: autopilot?.enabled ? '0 0 6px #34d399' : 'none',
          }}
        />
        Autopilot {autopilot?.enabled ? 'ON' : 'OFF'}
      </button>

      {nextCycleText && (
        <span className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.4)' }}>{nextCycleText}</span>
      )}

      <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.08)' }} />

      <span className="text-[11px] font-mono-data" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {broker?.label || 'No broker'} · {broker?.connected ? <span style={{ color: '#6ee7b7' }}>connected</span> : <span style={{ color: '#fca5a5' }}>offline</span>}
      </span>

      <div className="flex-1" />

      {mt5Balance ? (
        <span className="text-[12px] font-mono-data" style={{ color: '#6ee7b7' }}>
          MT5 equity {mt5Balance.equity != null ? `${mt5Balance.equity.toFixed(2)} ${mt5Balance.currency || ''}` : '—'}
        </span>
      ) : (
        <span className="text-[12px] font-mono-data" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Paper equity ${eq.toFixed(0)} · uPnL {upnl >= 0 ? '+' : ''}{upnl.toFixed(2)}
        </span>
      )}

      <button
        type="button"
        onClick={onOpenSettings}
        className="p-1.5 rounded"
        style={{ color: 'rgba(255,255,255,0.45)' }}
        title="Broker & risk settings"
      >
        <Settings size={15} />
      </button>
    </div>
  );
}
