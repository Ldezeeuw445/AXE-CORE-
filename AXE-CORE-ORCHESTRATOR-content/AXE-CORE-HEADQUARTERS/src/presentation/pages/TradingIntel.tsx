/**
 * Trading Intel — the premium trading tab shell: persistent status strip,
 * then Chart / Research / Brain / Scorecard / Strategies / Demo book as
 * separate rooms instead of one crowded page. Broker/risk config lives
 * behind the gear icon, not competing with the chart for space.
 *
 * All state lives in useTradingDeskState(); this file is just layout.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, RefreshCw } from 'lucide-react';
import { AGENT_NAME, useTradingDeskState } from './tradingIntel/useTradingDeskState';
import { StatusStrip } from './tradingIntel/StatusStrip';
import { SettingsDrawer } from './tradingIntel/SettingsDrawer';
import { ChartTab } from './tradingIntel/ChartTab';
import { ResearchTab } from './tradingIntel/ResearchTab';
import { BrainTab } from './tradingIntel/BrainTab';
import { ScorecardTab } from './tradingIntel/ScorecardTab';
import { TradingFunnelGraph } from '@/presentation/components/trading/TradingFunnelGraph';
import { StrategiesBacktestTab } from './tradingIntel/StrategiesBacktestTab';
import { DemoBookTab } from './tradingIntel/DemoBookTab';
import { FrameworksTab } from './tradingIntel/FrameworksTab';
import { AccountsTab } from './tradingIntel/AccountsTab';

type TabId = 'chart' | 'research' | 'brain' | 'scorecard' | 'funnel' | 'strategies' | 'frameworks' | 'accounts' | 'demo';

const TABS: { id: TabId; label: string }[] = [
  { id: 'chart', label: 'Chart' },
  { id: 'research', label: 'Research' },
  { id: 'brain', label: 'Brain' },
  { id: 'scorecard', label: 'Scorecard' },
  { id: 'funnel', label: 'Funnel' },
  { id: 'strategies', label: 'Strategies & Backtest' },
  { id: 'frameworks', label: 'Frameworks' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'demo', label: 'Accounts book' },
];

export default function TradingIntel() {
  const desk = useTradingDeskState();
  // The Android shell opens this desk from two different tabs: CHART wants the
  // chart, ALGO wants Brain. Without this both landed on the chart and the
  // phone showed the same screen twice.
  const initialTab = ((): TabId => {
    if (typeof window === 'undefined') return 'chart';
    const q = window.location.hash.split('?')[1] ?? '';
    const want = new URLSearchParams(q).get('tab');
    return (TABS.some(t => t.id === want) ? want : 'chart') as TabId;
  })();
  // ALGO hides the Chart tab.
  //
  // The phone has its own CHART tab in the bottom bar, pointing at this same
  // desk with tab=chart. Leaving Chart in this row as well meant the identical
  // screen was reachable two ways, one tap apart, which is what made it feel
  // like the app had two charts. It never did — there is one CompanionChart.
  //
  // Desktop is untouched: it has no separate chart tab, so it keeps the full
  // row. Only the shell that already provides a chart asks for it to be hidden.
  const hideChartTab = (() => {
    if (typeof window === 'undefined') return false;
    const q = window.location.hash.split('?')[1] ?? '';
    return new URLSearchParams(q).get('nochart') === '1';
  })();
  const visibleTabs = hideChartTab ? TABS.filter(t => t.id !== 'chart') : TABS;

  const [tab, setTab] = useState<TabId>(
    hideChartTab && initialTab === 'chart' ? 'brain' : initialTab,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  // The phone's CHART tab asks for a bare desk: no title row, no status strip,
  // no tab bar. Everything those carry lives one tap away under ALGO, and on a
  // 716px screen each band cost the candles more than it was worth.
  const bare = (() => {
    if (typeof window === 'undefined') return false;
    const q = window.location.hash.split('?')[1] ?? '';
    return new URLSearchParams(q).get('bare') === '1';
  })();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col overflow-hidden"
      style={{ background: '#050505' }}
    >
      {!bare && (
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <LineChart size={16} style={{ color: '#a78bfa' }} />
        <span className="text-sm font-semibold" style={{ color: '#F5F0E6' }}>Trading</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(167,139,250,0.12)', color: '#c4b5fd' }}>{AGENT_NAME}</span>
        <div className="flex-1" />
        <button type="button" onClick={() => void desk.reload()} className="p-1.5 rounded" style={{ color: 'rgba(255,255,255,0.45)' }}>
          <RefreshCw size={14} className={desk.loading ? 'animate-spin' : ''} />
        </button>
      </div>
      )}

      {!bare && <StatusStrip desk={desk} onOpenSettings={() => setSettingsOpen(true)} />}

      {!bare && (
      <div className="flex gap-1 px-3 pt-2 border-b shrink-0 overflow-x-auto whitespace-nowrap" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {visibleTabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 text-[12px] shrink-0"
            style={{
              color: tab === t.id ? '#F5F0E6' : 'rgba(255,255,255,0.4)',
              borderBottom: tab === t.id ? '2px solid #a78bfa' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      )}

      <div className={`flex-1 overflow-x-hidden min-h-0 ${bare ? 'p-0 overflow-hidden' : 'p-3 overflow-y-auto'}`}>
        {tab === 'chart' && <ChartTab desk={desk} />}
        {tab === 'research' && <ResearchTab desk={desk} />}
        {tab === 'brain' && <BrainTab desk={desk} />}
        {tab === 'scorecard' && <ScorecardTab desk={desk} />}
        {tab === 'funnel' && <TradingFunnelGraph />}
        {tab === 'strategies' && <StrategiesBacktestTab desk={desk} />}
        {tab === 'frameworks' && <FrameworksTab />}
        {tab === 'accounts' && <AccountsTab />}
        {tab === 'demo' && <DemoBookTab desk={desk} />}
      </div>

      {settingsOpen && <SettingsDrawer desk={desk} onClose={() => setSettingsOpen(false)} />}
    </motion.div>
  );
}
