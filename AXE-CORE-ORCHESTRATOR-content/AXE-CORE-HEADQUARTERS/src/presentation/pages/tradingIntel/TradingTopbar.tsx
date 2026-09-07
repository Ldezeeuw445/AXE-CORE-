/**
 * Wat trading in de topbalk hangt.
 *
 * ## Waarom dit naar boven ging
 *
 * Dit stond in twee stroken bovenop de pagina: een kopbalk met "Trading" en
 * een agentnaam, en daaronder een statusstrook met de autopilot, de broker,
 * het vermogen en de kill switch. Samen twee regels die op elke sub-tab
 * opnieuw verschenen -- terwijl ze zeiden waar je BENT en wat er LOOPT, en dat
 * is precies wat een topbalk doet.
 *
 * De kopbalk zelf is helemaal weg: welke tab open is staat al in de nav
 * onderin, en een tweede plek die hetzelfde zegt is een tweede plek die kan
 * gaan afwijken.
 *
 * ## Waarom een portal en geen prop door de schil
 *
 * De schil hoeft niet te weten wat trading is. Hij toont een leeg vakje; de
 * pagina hangt erin wat zij daar wil hebben. Elke andere tab kan hetzelfde
 * doen zonder dat TopNav verandert.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Power, RefreshCw, Settings } from 'lucide-react';
import { meaningVar } from '@/domain/meaning';
import type { TradingDeskState } from './useTradingDeskState';

/** Wanneer de autopilot weer draait, in woorden. */
function volgende(autopilot: TradingDeskState['autopilot']): string | null {
  if (!autopilot?.enabled) return null;
  if (autopilot.running) return 'loopt…';
  if (!autopilot.lastRunAt) return 'nu';
  const nextAt = new Date(autopilot.lastRunAt).getTime() + autopilot.intervalMin * 60_000;
  const mins = Math.round((nextAt - Date.now()) / 60_000);
  return mins <= 0 ? 'nu' : `over ~${mins}m`;
}

export function TradingTopbar({
  desk, onOpenSettings,
}: { desk: TradingDeskState; onOpenSettings: () => void }) {
  /* Lui geïnitialiseerd in plaats van in het effect gezet: een setState die
     synchroon in een effect draait, veroorzaakt een tweede render voordat de
     eerste geverfd is. Staat het vakje er al -- het gewone geval, want de
     schil rendert eerder -- dan is dit meteen raak zonder extra ronde. */
  const [gastheer, setGastheer] = useState<HTMLElement | null>(
    () => (typeof document === 'undefined' ? null : document.getElementById('axe-slot-topbalk')),
  );
  const { autopilot, autopilotBusy, toggleAutopilot, eq, killSwitchBusy, triggerKillSwitch } = desk;

  /* De schil rendert eerder dan de pagina, maar niet gegarandeerd: bij een
     harde verversing op /trading-intel kan dit vakje er nog niet zijn. Even
     wachten tot het er is, dan stoppen -- net als useSlotGastheer doet. */
  useEffect(() => {
    if (gastheer) return;
    const obs = new MutationObserver(() => {
      const el = document.getElementById('axe-slot-topbalk');
      if (el) { setGastheer(el); obs.disconnect(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [gastheer]);

  if (!gastheer) return null;
  const next = volgende(autopilot);

  return createPortal(
    <>
      <button
        type="button"
        onClick={() => void toggleAutopilot()}
        disabled={autopilotBusy || !autopilot}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-mono-data disabled:opacity-50"
        title={autopilot?.enabled ? 'Autopilot staat aan' : 'Autopilot staat uit'}
      >
        <Power size={11} style={{ color: meaningVar(autopilot?.enabled ? 'happened' : 'idle') }} />
        <span style={{ color: meaningVar(autopilot?.enabled ? 'happened' : 'idle') }}>
          {autopilot?.enabled ? 'AUTOPILOT' : 'autopilot uit'}
        </span>
        {next && <span style={{ color: 'var(--text-muted)' }}>{next}</span>}
      </button>

      {eq != null && (
        <span className="text-[10px] font-mono-data tabular-nums whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
          {eq.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}
        </span>
      )}

      {/* De kill switch hoort waar je hem ziet zonder te zoeken. */}
      <button
        type="button"
        onClick={() => void triggerKillSwitch()}
        disabled={killSwitchBusy}
        className="px-2 py-1 rounded-full text-[10px] font-mono-data disabled:opacity-50"
        style={{ color: meaningVar('broken') }}
        title="Sluit alles en zet de autopilot uit"
      >
        {killSwitchBusy ? 'sluiten…' : 'KILL'}
      </button>

      <button type="button" onClick={() => void desk.reload()} className="p-1 rounded" style={{ color: 'var(--text-muted)' }} title="Verversen">
        <RefreshCw size={12} className={desk.loading ? 'animate-spin' : ''} />
      </button>
      <button type="button" onClick={onOpenSettings} className="p-1 rounded" style={{ color: 'var(--text-muted)' }} title="Instellingen">
        <Settings size={12} />
      </button>
    </>,
    gastheer,
  );
}
