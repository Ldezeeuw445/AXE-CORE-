/**
 * BrainTab — the desk as a pipeline, left to right.
 *
 * Was one agent's head (AXE ALGO) with a chat beside it. That answered "what
 * did the trader decide" and nothing about how it got there, so the four
 * agents read as four unrelated panels.
 *
 * Now the work is shown in the order it flows: Research finds it, Intel adds
 * what the feeds know, Companion weighs it with its indicators, Algo places
 * the trade. Reading across shows the handoff — what each one did with what
 * the previous one found — which is the point: a decision you can follow is a
 * decision you can correct.
 *
 * Every lane is fed from a different real source, and says so when it has
 * nothing. A lane filled with a neighbour's rows would make the pipeline look
 * joined up while proving nothing.
 */
import { useCallback, useEffect, useState } from 'react';
import { BrainPipeline, type LaneSpec } from './BrainPipeline';
import { TradingChatPanel } from './TradingChatPanel';
import {
  isCompanionReachable, getLatestCompanionCorrelation, getIntelFeedHealth,
  type CompanionCorrelation, type IntelFeedHealth,
} from '@/infrastructure/gateways/companionToolsService';
import { AGENT_NAME, type TradingDeskState } from './useTradingDeskState';
import {
  runDeskIntel, runDeskCompanion,
  type DeskAgentResult, type UpstreamContext,
} from '@/application/tradingIntel/deskAgents';
import { DESK_AGENT_MODELS, slotsPreferring, modelLabel, loadConfiguredSlots } from '@/application/tradingIntel/deskAgentModels';
import { buildCallLlmFromSlots } from '@/application/tradingIntel/runTradingResearch';
import { callProvider } from '@/infrastructure/gateways/llmGateway';

export function BrainTab({ desk }: { desk: TradingDeskState }) {
  const {
    reports, lastTrace, running, agentRunning,
    // runDeepResearch is deliberately not wired here: the 18-agent CrewAI flow
    // has timed out at thirty minutes since 3 August and nothing has triggered
    // it since. A lane button that hangs would break the one thing this view
    // is for — showing where the chain stops. It stays on the Research tab.
    runResearch, runAgent, symbol,
  } = desk;

  const [intelRun, setIntelRun] = useState<DeskAgentResult | null>(null);
  const [companionRun, setCompanionRun] = useState<DeskAgentResult | null>(null);
  const [intelBusy, setIntelBusy] = useState(false);
  const [companionBusy, setCompanionBusy] = useState(false);
  const [companionUp, setCompanionUp] = useState<boolean | null>(null);
  const [correlation, setCorrelation] = useState<CompanionCorrelation | null>(null);
  const [feeds, setFeeds] = useState<IntelFeedHealth[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [up, corr, health] = await Promise.all([
        isCompanionReachable().catch(() => false),
        getLatestCompanionCorrelation().catch(() => null),
        getIntelFeedHealth().catch(() => [] as IntelFeedHealth[]),
      ]);
      if (cancelled) return;
      setCompanionUp(up);
      setCorrelation(corr);
      setFeeds(health);
    };
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Each agent gets its own model, tried first and falling back through every
  // other configured provider. See deskAgentModels for why the families differ.
  const callFor = useCallback((which: 'intel' | 'companion') => {
    const slots = slotsPreferring(loadConfiguredSlots(), DESK_AGENT_MODELS[which]);
    return buildCallLlmFromSlots(slots, (slot, msgs) =>
      callProvider(slot, msgs as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>));
  }, []);

  // Each lane is handed what the ones before it concluded THIS session, so a
  // run can be shown to have used a specific upstream answer. Reading it from
  // shared memory instead would make "Intel saw the research" unprovable from
  // the screen, which is the one thing this layout exists to demonstrate.
  const doIntel = useCallback(async () => {
    setIntelBusy(true);
    try {
      const up: UpstreamContext = { research: reports[0]?.thesis ?? null };
      setIntelRun(await runDeskIntel(symbol, callFor('intel'), up));
    } finally { setIntelBusy(false); }
  }, [symbol, callFor, reports]);

  const doCompanion = useCallback(async () => {
    setCompanionBusy(true);
    try {
      const up: UpstreamContext = {
        research: reports[0]?.thesis ?? null,
        intel: intelRun?.detail ?? null,
      };
      setCompanionRun(await runDeskCompanion(symbol, callFor('companion'), up));
    } finally { setCompanionBusy(false); }
  }, [symbol, callFor, reports, intelRun]);

  const latest = reports[0];
  const healthy = feeds.filter(f => f.healthy).length;

  const lanes: LaneSpec[] = [
    {
      id: 'axe_research',
      title: 'AXE Research',
      color: '#6ee7b7',
      headline: latest ? `${latest.ticker} · ${latest.signal.toUpperCase()}` : null,
      detail: latest?.thesis ?? null,
      at: latest?.createdAt ?? null,
      // The arrow's label is what actually crosses it, not a description of
      // the next box — so an empty arrow is visible as a broken handoff.
      handoff: latest ? `${latest.ticker} thesis · ${(latest.confidence * 100).toFixed(0)}%` : null,
      running,
      onRun: () => void runResearch(),
      runLabel: 'Run research',
    },
    {
      id: 'axe_intel',
      title: `AXE Intel · ${modelLabel(DESK_AGENT_MODELS.intel)}`,
      color: '#60a5fa',
      // AXE CORE's own read, not the other app's row. When it has not been run
      // this session it falls back to the shared correlation, clearly dated.
      headline: intelRun?.headline ?? correlation?.title ?? null,
      detail: intelRun?.detail ?? correlation?.summary ?? null,
      at: intelRun ? new Date().toISOString() : correlation?.created_at ?? null,
      handoff: intelRun
        ? `${intelRun.rowsSeen} rows · ${intelRun.sourceAge}`
        : (feeds.length ? `${healthy}/${feeds.length} feeds fresh` : null),
      running: intelBusy,
      onRun: () => void doIntel(),
      runLabel: 'Run intel read',
    },
    {
      id: 'axe_companion',
      title: `AXE Companion · ${modelLabel(DESK_AGENT_MODELS.companion)}`,
      color: '#f4c26e',
      // Reads Companion's tables out of Supabase rather than needing its
      // desktop app open — which is why this lane used to say "not reachable"
      // while 226 chart snapshots sat in the database, readable the whole time.
      headline: companionRun?.headline ?? (companionUp === false ? 'App closed — reading its data from Supabase' : null),
      detail: companionRun?.detail ?? null,
      at: companionRun ? new Date().toISOString() : null,
      handoff: companionRun ? `${companionRun.rowsSeen} rows · ${companionRun.sourceAge}` : null,
      running: companionBusy,
      onRun: () => void doCompanion(),
      runLabel: 'Run companion read',
    },
    {
      id: 'axe_trader',
      title: AGENT_NAME,
      color: '#a78bfa',
      headline: lastTrace ? `${lastTrace.symbol} · ${lastTrace.finalAction.toUpperCase()} ${(lastTrace.confidence * 100).toFixed(0)}%` : null,
      detail: lastTrace
        ? (lastTrace.blockedByRisk ?? lastTrace.steps.map(s => `[${s.phase}] ${s.detail}`).join('\n'))
        : null,
      at: null,
      handoff: null,
      running: agentRunning,
      onRun: () => void runAgent(),
      runLabel: `Run ${AGENT_NAME} cycle`,
    },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-3 h-full min-h-0">
      <div className="flex-1 min-w-0 min-h-0">
        <BrainPipeline lanes={lanes} />
      </div>
      <div className="w-full lg:w-[320px] shrink-0 min-h-0 h-[60vh] lg:h-auto">
        <TradingChatPanel desk={desk} />
      </div>
    </div>
  );
}
