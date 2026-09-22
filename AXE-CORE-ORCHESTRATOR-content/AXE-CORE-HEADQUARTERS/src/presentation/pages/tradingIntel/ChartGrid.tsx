/**
 * ChartGrid — één, twee of vier grafieken naast elkaar.
 *
 * Elke cel is een eigen CompanionChart: symbool en timeframe zijn props, met de
 * paar- en timeframekiezer in de kop van elke grafiek zelf. Er is geen gedeelde
 * grafiekstaat; alleen MetaAPI's candle-limiet (hooguit twee aanvragen tegelijk,
 * zie metaApiMarketData) wordt gedeeld — vier grafieken laden daardoor na elkaar,
 * niet kapot (multiChartLoads.test).
 *
 * Cel 1 blijft de hoofdgrafiek van het bureau: die levert de indicatoren aan
 * "Run agent". De andere cellen zijn om naar te kijken.
 */
import type { ChartLayout } from './useChartLayout';
import { CompanionChart } from '@/presentation/components/trading/companion/CompanionChart';
import type { IndicatorSnapshot } from '@/presentation/components/trading/CompanionStyleChart';

const EXTRA_DEFAULTS: Array<{ symbol: string; timeframe: string }> = [
  { symbol: 'EURUSD', timeframe: 'h1' },
  { symbol: 'XAUUSD', timeframe: 'h4' },
  { symbol: 'GBPUSD', timeframe: 'h1' },
];

export function ChartLayoutToggle({ layout, onChange }: { layout: ChartLayout; onChange: (l: ChartLayout) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Chart layout">
      {([1, 2, 4] as const).map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={layout === n}
          className="px-2 py-1 rounded text-[11px] font-mono-data"
          style={{
            border: `1px solid ${layout === n ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: layout === n ? '#c4b5fd' : 'rgba(255,255,255,0.5)',
          }}
          title={`${n} chart${n > 1 ? 's' : ''}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function ChartGrid({ layout, symbol, onIndicators }: {
  layout: ChartLayout;
  symbol: string;
  onIndicators?: (snap: IndicatorSnapshot) => void;
}) {
  const cols = layout === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2';
  const rows = layout === 4 ? 'md:grid-rows-2' : 'grid-rows-1';
  return (
    <div className={`grid ${cols} ${rows} gap-2 w-full h-full min-h-0`}>
      <div className="min-h-[320px] h-full rounded-xl overflow-hidden">
        <CompanionChart symbol={symbol} timeframe="h1" onIndicators={onIndicators} />
      </div>
      {EXTRA_DEFAULTS.slice(0, layout - 1).map((c, i) => (
        <div key={i} className="min-h-[320px] h-full rounded-xl overflow-hidden">
          <CompanionChart symbol={c.symbol} timeframe={c.timeframe} />
        </div>
      ))}
    </div>
  );
}
