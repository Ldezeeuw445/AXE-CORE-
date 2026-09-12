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
import { useTradingDeskState } from './tradingIntel/useTradingDeskState';
import { TradingTopbar } from './tradingIntel/TradingTopbar';
import { TradingRail } from './tradingIntel/TradingRail';
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
import { CorrelatieTab } from '@/presentation/pages/tradingIntel/CorrelatieTab';
import { KalenderTab } from '@/presentation/pages/tradingIntel/KalenderTab';
import { AccountsTab } from './tradingIntel/AccountsTab';

type TabId = 'chart' | 'research' | 'brain' | 'scorecard' | 'funnel' | 'memory' | 'strategies' | 'frameworks' | 'accounts' | 'demo' | 'correlatie' | 'kalender';

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
  // Naast Strategies, want het is dezelfde vraag van de andere kant: die tab
  // zoekt wat werkt per paar, deze laat zien welke paren hetzelfde doen.
  { id: 'correlatie', label: 'Correlatie' },
  { id: 'kalender', label: 'Kalender' },
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
      {/* De eigen kopbalk en de statusstrook zijn weg. Ze stonden bovenop de
          pagina en zeiden wat er in de topbalk hoort: waar je bent, of de
          autopilot loopt, en de kill switch. Nu staat dat in de topbalk zelf --
          één balk in plaats van drie boven elkaar. */}
      {!bare && (
        <TradingTopbar desk={desk} onOpenSettings={() => setSettingsOpen(true)} />
      )}

      {/* De sub-tabs staan nu in het linker schuifpaneel (TradingRail).
          Een strook van tien knoppen over de volle breedte, waarvan er negen
          op elk moment niet zijn waar je naar kijkt, is de duurste regel van
          de pagina. */}
      {!bare && (
        <TradingRail
          tabs={visibleTabs}
          actief={tab}
          kies={(id) => setTab(id as TabId)}
          instellingen={<SettingsDrawer desk={desk} onClose={() => setSettingsOpen(false)} inline />}
          /* De kill switch zit in het gat van de rechter ring. De desk-hook
             heeft hem al; hier wordt hij alleen doorgegeven. */
          opKillSwitch={() => { void desk.triggerKillSwitch(); }}
          killBezig={desk.killSwitchBusy}
        />
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
        {tab === 'correlatie' && <CorrelatieTab />}
        {tab === 'kalender' && <KalenderTab />}
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
