import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Activity, Bot, BrainCircuit, ChevronRight, Code2, GitBranch,
  Play, RefreshCw, Send, Server, Settings, ShieldCheck, Square,
  Users, Wifi,
} from 'lucide-react';
import { useTradingDeskState } from './tradingIntel/useTradingDeskState';
import { crewRun } from '@/infrastructure/gateways/axeCoreApiService';
import { checkAllServices, getSystemState, type ServiceState } from '@/application/system/systemService';
import { SPECIALISTS } from '@/domain/catalogs/specialists';
import { LIST_GRID } from '@/presentation/components/surface/Page';

type Tab = 'trade' | 'crew' | 'code' | 'settings';

const TRADE_CREW = ['axe_core', 'dollar_bill', 'intel'];

function StatusDot({ status }: { status: ServiceState['status'] | 'unknown' }) {
  const color = status === 'online' ? 'var(--success)' : status === 'degraded' ? 'var(--warning)' : '#64748b';
  return <span className="inline-block size-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />;
}

function MobileCard({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-[20px] p-4" style={{
      background: '#080a0b',
      border: `1px solid ${accent ?? 'rgba(255,255,255,0.07)'}`,
    }}>
      {children}
    </div>
  );
}

export default function MobileSystem() {
  const navigate = useNavigate();
  const desk = useTradingDeskState();
  const [tab, setTab] = useState<Tab>('trade');
  const [services, setServices] = useState<ServiceState[]>([]);
  const [checking, setChecking] = useState(false);
  const [crewPrompt, setCrewPrompt] = useState('');
  const [crewState, setCrewState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [crewResult, setCrewResult] = useState('');

  const loadServices = async (probe = false) => {
    setChecking(true);
    try {
      const next = probe ? await checkAllServices() : await getSystemState();
      setServices(next);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { void loadServices(false); }, []);

  const coreServices = useMemo(() => {
    const keys = ['axe_core_api', 'supabase', 'github', 'crewai', 'terminal', 'metaapi'];
    return keys.map(key => services.find(s => s.service === key)).filter(Boolean) as ServiceState[];
  }, [services]);

  const runTradeCrew = async () => {
    if (!crewPrompt.trim()) return;
    setCrewState('running');
    setCrewResult('');
    try {
      const result = await crewRun({
        task: crewPrompt.trim(),
        specialists: TRADE_CREW,
        context: `Mobile Trading Desk · symbol ${desk.chartSymbol} · strategy ${desk.activeStrategy}. Research and risk analysis only; do not claim an order was placed unless broker execution evidence is returned.`,
      });
      if (result.status === 'ok' && result.result) {
        setCrewResult(result.result);
        setCrewState('done');
      } else {
        setCrewResult(result.error ?? 'Crew returned no result.');
        setCrewState('error');
      }
    } catch (error) {
      setCrewResult(error instanceof Error ? error.message : String(error));
      setCrewState('error');
    }
  };

  const tabs: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
    { id: 'trade', label: 'Trade', icon: Activity },
    { id: 'crew', label: 'Crew', icon: Users },
    { id: 'code', label: 'Code', icon: Code2 },
    { id: 'settings', label: 'System', icon: Settings },
  ];

  return (
    <div className="h-full overflow-hidden flex flex-col" style={{ background: '#000', color: '#f8fafc' }}>
      <header className="px-4 pt-3 pb-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[9px] font-mono tracking-[0.18em]" style={{ color: 'var(--accent-cyan)' }}>AXE DEVICE</div>
            <h1 className="text-xl font-semibold tracking-[-0.03em]">Mobile command system</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full px-2.5 py-1.5 text-[9px] font-mono"
            style={{ background: '#090b0c', border: '1px solid rgba(255,255,255,0.08)' }}>
            <StatusDot status={services.some(s => s.status === 'online') ? 'online' : 'unknown'} />
            SHARED RUNTIME
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto px-3 py-3 pb-24">
        {tab === 'trade' && (
          <div className="space-y-3">
            <MobileCard accent="rgba(245,158,11,0.18)">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'var(--warning)' }}>AXE ALGO · {desk.chartSymbol}</div>
                  <div className="mt-1 text-3xl font-medium tracking-[-0.05em]">
                    {desk.snapshot?.last?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'}
                  </div>
                </div>
                <button onClick={() => void desk.reload()} className="p-2 rounded-xl" style={{ background: '#101314' }}>
                  <RefreshCw size={15} className={desk.loading ? 'animate-spin' : ''} />
                </button>
              </div>
              <div className="mt-5 h-24 relative overflow-hidden rounded-xl" style={{
                background: 'linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)',
                backgroundSize: '100% 24px,44px 100%',
              }}>
                <svg viewBox="0 0 320 90" className="absolute inset-0 size-full" preserveAspectRatio="none">
                  <path d="M0 70 L25 62 L45 68 L70 40 L96 50 L120 30 L147 42 L175 18 L199 36 L222 29 L245 58 L270 44 L294 50 L320 34"
                    fill="none" stroke="#22d3ee" strokeWidth="2" />
                </svg>
              </div>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))] mt-3">
                <div><div className="text-[8px] font-mono opacity-40">STRATEGY</div><div className="text-xs mt-1">{desk.activeStrategy}</div></div>
                <div><div className="text-[8px] font-mono opacity-40">BROKER</div><div className="text-xs mt-1">{desk.broker?.connected ? 'Connected' : 'Not connected'}</div></div>
                <div><div className="text-[8px] font-mono opacity-40">RISK</div><div className="text-xs mt-1">{desk.risk?.mode ?? '—'}</div></div>
              </div>
            </MobileCard>

            <MobileCard accent={desk.autopilot?.enabled ? 'rgba(16,185,129,0.25)' : undefined}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl grid place-items-center" style={{ background: desk.autopilot?.enabled ? 'rgba(16,185,129,.12)' : '#101314' }}>
                    <Bot size={18} style={{ color: desk.autopilot?.enabled ? 'var(--success)' : '#94a3b8' }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium">AXE Algo 24/7</div>
                    <div className="text-[10px] opacity-45">
                      {desk.autopilot?.running ? 'Cycle running' : desk.autopilot?.enabled ? `Armed · every ${desk.autopilot.intervalMin} min` : 'Disarmed'}
                    </div>
                  </div>
                </div>
                <button
                  disabled={!desk.autopilot || desk.autopilotBusy}
                  onClick={() => {
                    if (!desk.autopilot?.enabled && !window.confirm('Arm AXE Algo 24/7? Existing broker and risk limits will control real execution.')) return;
                    void desk.toggleAutopilot();
                  }}
                  className="px-3 py-2 rounded-xl text-[10px] font-mono"
                  style={{ background: desk.autopilot?.enabled ? 'rgba(239,68,68,.1)' : 'var(--accent-cyan)', color: desk.autopilot?.enabled ? 'var(--error)' : '#001216' }}
                >
                  {desk.autopilot?.enabled ? <span className="flex gap-1.5 items-center"><Square size={10} /> STOP</span> : <span className="flex gap-1.5 items-center"><Play size={10} /> ARM</span>}
                </button>
              </div>
              {desk.autopilot?.lastResult && <div className="mt-3 text-[10px] leading-relaxed opacity-55 line-clamp-3">{desk.autopilot.lastResult}</div>}
            </MobileCard>

            <div className={LIST_GRID}>
              <button onClick={() => void desk.runDeepResearch()} className="text-left">
                <MobileCard><BrainCircuit size={17} style={{ color: '#a78bfa' }} /><div className="text-sm mt-4">Crew research</div><div className="text-[10px] opacity-40 mt-1">{desk.deepRunning ? 'Running…' : 'Core · Intel · Trading'}</div></MobileCard>
              </button>
              <button onClick={() => void desk.runAgent()} className="text-left">
                <MobileCard><Play size={17} style={{ color: 'var(--accent-cyan)' }} /><div className="text-sm mt-4">Run cycle now</div><div className="text-[10px] opacity-40 mt-1">{desk.agentRunning ? 'Running…' : 'Uses broker risk gates'}</div></MobileCard>
              </button>
            </div>
          </div>
        )}

        {tab === 'crew' && (
          <div className="space-y-3">
            <MobileCard>
              <div className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'var(--accent-cyan)' }}>TRADING CREW</div>
              <h2 className="text-2xl mt-2 tracking-[-0.04em]">One team. One decision.</h2>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))] mt-5">
                {TRADE_CREW.map(id => {
                  const s = SPECIALISTS.find(x => x.id === id)!;
                  return <div key={id} className="rounded-xl p-2.5" style={{ background: '#0c0f10' }}><div className="text-[10px] font-medium">{s.name}</div><div className="text-[8px] opacity-40 mt-1">{s.role}</div></div>;
                })}
              </div>
              <div className="rounded-xl p-2.5 mt-2" style={{ background: '#0c0f10' }}>
                <div className="text-[10px] font-medium">AXE Companion</div>
                <div className="text-[8px] opacity-40 mt-1">Conversation, context and mobile approval layer</div>
              </div>
            </MobileCard>
            <MobileCard>
              <textarea value={crewPrompt} onChange={e => setCrewPrompt(e.target.value)} rows={5}
                placeholder="Ask the crew to analyse XAUUSD, check risk and build a trade plan…"
                className="w-full resize-none bg-transparent outline-none text-sm leading-relaxed" />
              <button onClick={() => void runTradeCrew()} disabled={!crewPrompt.trim() || crewState === 'running'}
                className="w-full mt-3 rounded-xl py-3 flex justify-center items-center gap-2 text-sm font-medium"
                style={{ background: 'var(--accent-cyan)', color: '#001216', opacity: !crewPrompt.trim() ? .45 : 1 }}>
                {crewState === 'running' ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                {crewState === 'running' ? 'Crew is working…' : 'Run trading crew'}
              </button>
            </MobileCard>
            {crewResult && <MobileCard accent={crewState === 'error' ? 'rgba(239,68,68,.25)' : 'rgba(34,211,238,.2)'}><div className="text-[9px] font-mono opacity-45 mb-3">CREW RESULT</div><div className="text-xs leading-relaxed whitespace-pre-wrap">{crewResult}</div></MobileCard>}
          </div>
        )}

        {tab === 'code' && (
          <div className="space-y-3">
            <MobileCard accent="rgba(34,211,238,.18)">
              <Code2 size={24} style={{ color: 'var(--accent-cyan)' }} />
              <h2 className="text-2xl mt-5 tracking-[-0.04em]">Code Studio on mobile</h2>
              <p className="text-sm opacity-50 leading-relaxed mt-2">Open files, ask the code agent, review diffs, approve patches and run allowlisted tests on the trusted Mac or VPS.</p>
              <button onClick={() => navigate('/code-editor')} className="w-full mt-6 rounded-xl py-3 flex justify-center items-center gap-2 text-sm" style={{ background: 'var(--accent-cyan)', color: '#001216' }}>
                Open Code Studio <ChevronRight size={16} />
              </button>
            </MobileCard>
            <MobileCard>
              <div className="flex items-center gap-3"><GitBranch size={17} /><div><div className="text-sm">AXE-CORE-</div><div className="text-[10px] opacity-40">orchestrator · Git connected</div></div></div>
              <div className="mt-4 flex items-center gap-3"><Server size={17} /><div><div className="text-sm">Trusted execution</div><div className="text-[10px] opacity-40">Mac bridge + VPS runners</div></div></div>
              <div className="mt-4 flex items-center gap-3"><ShieldCheck size={17} /><div><div className="text-sm">Approval gates</div><div className="text-[10px] opacity-40">Review every write and command</div></div></div>
            </MobileCard>
          </div>
        )}

        {tab === 'settings' && (
          <div className="space-y-3">
            <MobileCard>
              <div className="flex items-center justify-between">
                <div><div className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'var(--accent-cyan)' }}>CONNECTIONS</div><h2 className="text-2xl mt-2">AXE infrastructure</h2></div>
                <button onClick={() => void loadServices(true)} className="p-2 rounded-xl" style={{ background: '#101314' }}><RefreshCw size={15} className={checking ? 'animate-spin' : ''} /></button>
              </div>
              <div className="mt-5">
                {coreServices.length ? coreServices.map(service => (
                  <div key={service.service} className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                    <StatusDot status={service.status} />
                    <div className="flex-1"><div className="text-sm">{service.display}</div><div className="text-[9px] opacity-40">{service.latency_ms ? `${service.latency_ms} ms` : 'No latency sample'}</div></div>
                    <span className="text-[9px] font-mono opacity-45">{service.status.toUpperCase()}</span>
                  </div>
                )) : <div className="text-sm opacity-45">Run a live check to verify Supabase, Git, VPS, CrewAI, terminal and MetaAPI.</div>}
              </div>
            </MobileCard>
            <button onClick={() => navigate('/settings')} className="w-full text-left">
              <MobileCard><div className="flex items-center gap-3"><Settings size={18} /><div className="flex-1"><div className="text-sm">All AXE settings</div><div className="text-[10px] opacity-40">Providers, VPS, Git repos, voice, security</div></div><ChevronRight size={16} /></div></MobileCard>
            </button>
            <button onClick={() => navigate('/memory')} className="w-full text-left">
              <MobileCard accent="rgba(245,185,66,.18)"><div className="flex items-center gap-3"><BrainCircuit size={18} style={{ color: '#f5b942' }} /><div className="flex-1"><div className="text-sm">3D Memory Terrain</div><div className="text-[10px] opacity-40">Canonical AXON mobile memory view</div></div><ChevronRight size={16} /></div></MobileCard>
            </button>
          </div>
        )}
      </main>

      <nav className="absolute bottom-0 left-0 right-0 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))] z-40"
        style={{ background: 'linear-gradient(180deg,transparent,#000 22%)' }}>
        {tabs.map(item => {
          const Icon = item.icon;
          const active = tab === item.id;
          return <button key={item.id} onClick={() => setTab(item.id)} className="h-14 rounded-2xl flex flex-col items-center justify-center gap-1"
            style={{ background: active ? '#0d1517' : '#080909', border: `1px solid ${active ? 'var(--tint-line)' : 'rgba(255,255,255,.05)'}`, color: active ? 'var(--accent-cyan)' : 'rgba(255,255,255,.42)' }}>
            <Icon size={16} /><span className="text-[8px] font-mono">{item.label.toUpperCase()}</span>
          </button>;
        })}
      </nav>
    </div>
  );
}
