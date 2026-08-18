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
import { StrategiesBacktestTab } from './tradingIntel/StrategiesBacktestTab';
import { DemoBookTab } from './tradingIntel/DemoBookTab';

type TabId = 'chart' | 'research' | 'brain' | 'scorecard' | 'strategies' | 'demo';

const TABS: { id: TabId; label: string }[] = [
  { id: 'chart', label: 'Chart' },
  { id: 'research', label: 'Research' },
  { id: 'brain', label: 'Brain' },
  { id: 'scorecard', label: 'Scorecard' },
  { id: 'strategies', label: 'Strategies & Backtest' },
  { id: 'demo', label: 'Demo book' },
];

export default function TradingIntel() {
  const desk = useTradingDeskState();
  const [tab, setTab] = useState<TabId>('chart');
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col overflow-hidden"
      style={{ background: '#050505' }}
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <LineChart size={16} style={{ color: '#a78bfa' }} />
        <span className="text-sm font-semibold" style={{ color: '#F5F0E6' }}>Trading</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(167,139,250,0.12)', color: '#c4b5fd' }}>{AGENT_NAME}</span>
        <div className="flex-1" />
        <button type="button" onClick={() => void desk.reload()} className="p-1.5 rounded" style={{ color: 'rgba(255,255,255,0.45)' }}>
          <RefreshCw size={14} className={desk.loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <StatusStrip desk={desk} onOpenSettings={() => setSettingsOpen(true)} />

      <div className="flex gap-1 px-3 pt-2 border-b shrink-0 overflow-x-auto whitespace-nowrap" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {TABS.map(t => (
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

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 min-h-0">
        {tab === 'chart' && <ChartTab desk={desk} />}
        {tab === 'research' && <ResearchTab desk={desk} />}
        {tab === 'brain' && <BrainTab desk={desk} />}
        {tab === 'scorecard' && <ScorecardTab desk={desk} />}
        {tab === 'strategies' && <StrategiesBacktestTab desk={desk} />}
        {tab === 'demo' && <DemoBookTab desk={desk} />}
      </div>

      {settingsOpen && <SettingsDrawer desk={desk} onClose={() => setSettingsOpen(false)} />}
    </motion.div>
  );
}
