/**
 * StatusStrip — always-visible header across every Trading Intel sub-tab.
 * The one thing you should never have to click into a tab to check:
 * is autopilot alive, when does it fire next, what's the account worth.
 */
import { useEffect, useState } from 'react';
import { Settings, OctagonAlert, ShieldAlert } from 'lucide-react';
import type { TradingDeskState } from './useTradingDeskState';

export function StatusStrip({ desk, onOpenSettings }: { desk: TradingDeskState; onOpenSettings: () => void }) {
  const {
    autopilot, autopilotBusy, toggleAutopilot, mt5Balance, eq, upnl, broker,
    circuitBreaker, killSwitchBusy, triggerKillSwitch, resetBreaker, liveStrategies,
  } = desk;

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
    <>
      {circuitBreaker?.tripped && (
        <div
          className="flex items-center gap-2 px-4 py-1.5 shrink-0"
          /* Wet 10: kleur in de letters, niet in het vlak. De rode wasem is
             weg; de rand eronder en de rode woorden blijven, en die lees je.
             Een omgeslagen circuit breaker is hiermee niet minder opvallend:
             het is de enige rode tekst op de hele balk. */
          style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(248,113,113,0.45)' }}
        >
          <ShieldAlert size={14} style={{ color: '#fca5a5' }} />
          <span className="text-[11px]" style={{ color: '#fca5a5' }}>
            Circuit breaker tripped — every cycle is forced to HOLD. {circuitBreaker.trippedReason}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void resetBreaker()}
            className="text-[11px] px-2 py-0.5 rounded"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#fca5a5', border: '1px solid rgba(248,113,113,0.45)' }}
          >
            Reset breaker
          </button>
        </div>
      )}
      <div
        className="flex items-center gap-x-3 gap-y-1 flex-wrap px-4 py-2 border-b shrink-0 text-[11px]"
        /* Het violette verloop is eruit. Het droeg geen toestand — het was een
           gekleurd vlak achter woorden die hun eigen kleur al hebben, precies
           het geval dat wet 10 beschrijft. */
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <button
          type="button"
          disabled={autopilotBusy || !autopilot}
          onClick={() => void toggleAutopilot()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0"
          /* Aan of uit wordt al drie keer gezegd: door het woord ON/OFF, door
             de kleur van dat woord, en door de stip ernaast die oplicht. De
             groene vulling was de vierde en de enige die wet 10 breekt.
             Vetter bij "aan", want kleur alleen is te zwak voor een toestand. */
          style={{
            background: 'rgba(255,255,255,0.06)',
            color: autopilot?.enabled ? '#6ee7b7' : 'rgba(255,255,255,0.5)',
            fontWeight: autopilot?.enabled ? 700 : 500,
            border: `1px solid ${autopilot?.enabled ? 'rgba(52,211,153,0.45)' : 'rgba(255,255,255,0.12)'}`,
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: autopilot?.enabled ? 'var(--success)' : 'rgba(255,255,255,0.3)',
              boxShadow: autopilot?.enabled ? '0 0 6px #34d399' : 'none',
            }}
          />
          Autopilot {autopilot?.enabled ? 'ON' : 'OFF'}
        </button>

        {nextCycleText && (
          <span className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.4)' }}>{nextCycleText}</span>
        )}

        <span
          className="text-[10px] px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.03)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.18)' }}
          title="Autopilot ignores the manual/backtest card selection. It ranks strategies independently per pair from the live/self-test ledger."
        >
          AUTO STRATEGY · per-pair ledger{liveStrategies.size ? ` · open: ${[...liveStrategies].join(', ')}` : ''}
        </span>

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
          disabled={killSwitchBusy}
          onClick={() => {
            if (!window.confirm('Flatten every open position and stop autopilot? This cannot be undone.')) return;
            void triggerKillSwitch();
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium disabled:opacity-50"
          /* De kill switch moet eruit springen, en dat doet hij: rood woord,
             rood icoon, rode rand. Een rood vlak erachter voegt niets toe dat
             je léést — en wet 8 houdt de enige vullende knop per weergave bij
             PrimaryButton, niet hier. */
          style={{ background: 'rgba(255,255,255,0.06)', color: '#fca5a5', border: '1px solid rgba(248,113,113,0.45)' }}
          title="Flatten every open position and stop autopilot immediately"
        >
          <OctagonAlert size={13} />
          {killSwitchBusy ? 'Flattening…' : 'Kill switch'}
        </button>

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
    </>
  );
}
