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
import { FunnelTab } from '@/presentation/pages/tradingIntel/FunnelTab';
import { TradingMemoryPanel } from '@/presentation/pages/tradingIntel/TradingMemoryPanel';
import { StrategiesBacktestTab } from './tradingIntel/StrategiesBacktestTab';
import { DemoBookTab } from './tradingIntel/DemoBookTab';
import { FrameworksTab } from './tradingIntel/FrameworksTab';
import { AccountsTab } from './tradingIntel/AccountsTab';

type TabId = 'chart' | 'research' | 'brain' | 'scorecard' | 'funnel' | 'memory' | 'strategies' | 'frameworks' | 'accounts' | 'demo';

/**
 * The tabs are the pipeline, in the order the work actually happens.
 *
 * Research finds candidates, Brain has the agents argue about them, Memory
 * holds what the desk has learned so far, Frameworks and Strategies are where
 * that learning turns into a choice, Funnel narrows the choice to trades,
 * Scorecard grades them, and the last two are the accounts those trades landed
 * on.
 *
 * They were previously ordered by when each one happened to be built, which
 * put Scorecard — a grade on work that had not been shown yet — third. Reading
 * left to right now follows one decision from idea to fill to verdict, and
 * every tab is itself a narrowing, so the row reads as a funnel of funnels.
 *
 * Chart stays first and outside that sequence: it is the live view, not a
 * stage. You look at it to see what is happening, not to move work along.
 */
const TABS: { id: TabId; label: string }[] = [
  { id: 'chart', label: 'Chart' },
  { id: 'research', label: 'Research' },
  { id: 'brain', label: 'Brain' },
  { id: 'memory', label: 'Memory' },
  { id: 'frameworks', label: 'Frameworks' },
  { id: 'strategies', label: 'Strategies & Backtest' },
  { id: 'funnel', label: 'Funnel' },
  { id: 'scorecard', label: 'Scorecard' },
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
      // flex-wrap, because this strip carries the autopilot toggle, the broker,
      // the equity and the kill switch — and a kill switch you have to scroll
      // sideways to reach on a phone is not a kill switch.
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0 flex-wrap" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <LineChart size={16} style={{ color: '#a78bfa' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Trading</span>
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
              color: tab === t.id ? 'var(--text-primary)' : 'rgba(255,255,255,0.4)',
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
        {tab === 'funnel' && <FunnelTab desk={desk} />}
        {tab === 'memory' && <TradingMemoryPanel />}
        {tab === 'strategies' && <StrategiesBacktestTab desk={desk} />}
        {tab === 'frameworks' && <FrameworksTab />}
        {tab === 'accounts' && <AccountsTab />}
        {/* orchestrator's DemoBookTab takes the desk state; the branch this file
            came from had a leaner version that did not. Passing it rather than
            reverting the tab, which is the richer of the two. */}
        {tab === 'demo' && <DemoBookTab desk={desk} />}
      </div>

      {settingsOpen && <SettingsDrawer desk={desk} onClose={() => setSettingsOpen(false)} />}
    </motion.div>
  );
}
