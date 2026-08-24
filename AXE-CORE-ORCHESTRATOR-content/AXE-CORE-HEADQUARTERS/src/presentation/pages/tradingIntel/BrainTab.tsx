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
import { useEffect, useState } from 'react';
import { BrainPipeline, type LaneSpec } from './BrainPipeline';
import { TradingChatPanel } from './TradingChatPanel';
import {
  isCompanionReachable, getLatestCompanionCorrelation, getIntelFeedHealth,
  type CompanionCorrelation, type IntelFeedHealth,
} from '@/infrastructure/gateways/companionToolsService';
import { AGENT_NAME, type TradingDeskState } from './useTradingDeskState';

export function BrainTab({ desk }: { desk: TradingDeskState }) {
  const {
    reports, lastTrace, running, deepRunning, agentRunning,
    runResearch, runDeepResearch, runAgent,
  } = desk;

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
      title: 'AXE Intel',
      color: '#60a5fa',
      headline: correlation?.title ?? null,
      detail: correlation?.summary ?? null,
      at: correlation?.created_at ?? null,
      handoff: correlation
        ? `${correlation.feeds_used.length} feeds · ${correlation.confidence}`
        : (feeds.length ? `${healthy}/${feeds.length} feeds fresh` : null),
      running: deepRunning,
      onRun: () => void runDeepResearch(),
      runLabel: 'Run intel cycle',
    },
    {
      id: 'axe_companion',
      title: 'AXE Companion',
      color: '#f4c26e',
      // Reachability is the honest headline here: when the Tauri app is shut,
      // anything else this lane showed would be the last thing it saved, not
      // what it thinks now.
      headline: companionUp === false ? 'Not reachable' : correlation?.signal ?? null,
      detail: companionUp === false
        ? 'Companion’s app is not open, so nothing here is live. Its indicators and second opinion are unavailable until it is.'
        : correlation?.summary ?? null,
      at: companionUp ? correlation?.created_at ?? null : null,
      handoff: companionUp && correlation?.signal ? `signal: ${correlation.signal}` : null,
      runLabel: 'Open Companion',
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
