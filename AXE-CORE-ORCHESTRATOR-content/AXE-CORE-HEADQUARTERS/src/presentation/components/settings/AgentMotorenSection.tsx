/**
 * Instellingen → Motoren per agent.
 *
 * Vier agents, vier abonnementen, en elk abonnement bij hooguit één agent. Het
 * menu van een agent toont geen abonnement dat al van een ander is; kies je er
 * toch een via een andere weg, dan zet normaliseer() het recht. Subtaken staan
 * hier bewust niet: die draaien altijd op je API-sleutels.
 * Zie domain/agentMotoren.ts.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  HOOFD_AGENTS, AGENT_LABEL, MOTOR_LABEL, TOEGESTAAN, kiesbaar,
  type HoofdAgent, type HoofdMotor, type MotorToewijzing,
} from '@/domain/agentMotoren';
import { leesToewijzing, kiesMotor } from '@/infrastructure/persistence/agentMotorenOpslag';
import { leesModellen, zetModel } from '@/infrastructure/persistence/motorModellenOpslag';
import { MODEL_SUGGESTIES, MODEL_VLAG, type MotorModellen } from '@/domain/motorModellen';
import { ALLE_MOTOREN, type AgentEngine } from '@/domain/abonnementChat';
import {
  claudeRepos, plannerStatus, plannerZetAan,
  ledgerList,
  type PlannerStatus, type AgentSubscriptionUsage, type LedgerEntry,
} from '@/infrastructure/gateways/axeCoreApiService';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { PROVIDERS, type ProviderId } from '@/domain/providers';
import { chatModelKeuzes, workerKeuzes, paidApiKeuzes, isActief, leesVerbindingen, type Verbinding } from '@/domain/chatModelKeuzes';
import { agentsByTier } from '@/domain/agents/roster';
import { leesOverrides, zetOverride, type OverrideMap } from '@/infrastructure/persistence/agentEngineOverrides';




const WAARVOOR: Record<HoofdAgent, string> = {
  wingman: 'Draait de gratis CrewAI-crew namens AXE, en helpt overal waar dat past.',
  northsea: 'Bouwt en runt de NorthSea-desk, beweegt deals. Schrijftaken pas na jouw akkoord.',
  trading: 'Alleen de eindbeslissing per cyclus. De elf desk-rollen blijven op sleutels.',
  developer: 'Leest, schrijft, bouwt en deployt de codebase. Mag bestanden bewerken.',
  thinktank: 'Score/rank ideeën → bouwplan → Build → bibliotheek → integratieplan.',
};

export function AgentMotorenSection() {
  const [toewijzing, setToewijzing] = useState<MotorToewijzing>(() => leesToewijzing());
  const [aanwezig, setAanwezig] = useState<Record<string, boolean> | null>(null);
  const [modellen, setModellen] = useState<MotorModellen>(() => leesModellen());
  const [planner, setPlanner] = useState<PlannerStatus | null>(null);
  const [abonnementGebruik, setAbonnementGebruik] = useState<Record<string, AgentSubscriptionUsage>>({});
  const [overrides, setOverrides] = useState<OverrideMap>(() => leesOverrides());
  const verbindingen = useMemo(() => leesVerbindingen(), [toewijzing, overrides]);
  const tier2Keuzes = useMemo(
    () => workerKeuzes(verbindingen, PROVIDERS.map(p => p.id)),
    [verbindingen],
  );
  const tier3Keuzes = useMemo(
    () => paidApiKeuzes(verbindingen, PROVIDERS.map(p => p.id)),
    [verbindingen],
  );
  const kiesOverride = (agentId: string, waarde: string) => {
    if (!waarde) { setOverrides(zetOverride(agentId, null)); return; }
    const [provider, ...rest] = waarde.split(':');
    setOverrides(zetOverride(agentId, { provider: provider as ProviderId, model: rest.join(':') }));
  };

  // Rij 1: AXE Core. Zelfde opslag (voiceStore.primarySlot) als de
  // ChatModelKiezer boven de composer -- één bron van waarheid, geen tweede
  // instelling die het ooit oneens kan zijn met de eerste. De lijst zelf sluit
  // abonnementen en Ollama al uit (domain/chatModelKeuzes.ts) — dat is de regel
  // uit de CONFIRMED ARCHITECTURE: AXE's brein is nooit een abonnement, nooit
  // Ollama.
  const primair = useVoiceStore(s => s.primarySlot);
  const setPrimair = useVoiceStore(s => s.setPrimarySlot);
  const axeKeuzes = useMemo(
    () => chatModelKeuzes(leesVerbindingen(), PROVIDERS.map(p => p.id)),
    // Herleest bij elke render van deze sectie (Settings blijft open terwijl je
    // sleutels invult) — een lijst van hooguit enkele tientallen regels, geen
    // kostbare berekening.
    [toewijzing],
  );
  const kiesAxe = (waarde: string) => {
    if (!waarde) { setPrimair(null); return; }
    const k = axeKeuzes.find(x => `${x.provider}:${x.model}` === waarde);
    if (!k) return;
    const conns = leesVerbindingen();
    setPrimair({ provider: k.provider, key: conns[k.provider]?.key ?? '', model: k.model });
  };
  const axeHuidig = primair ? axeKeuzes.find(k => isActief(k, primair)) : undefined;
  useEffect(() => { plannerStatus().then(setPlanner).catch(() => setPlanner(null)); }, []);
  const zetPlanner = async (aan: boolean) => {
    try { await plannerZetAan(aan); setPlanner(await plannerStatus()); } catch { /* host onbereikbaar */ }
  };

  useEffect(() => {
    const bij = () => { setToewijzing(leesToewijzing()); setOverrides(leesOverrides()); };
    window.addEventListener('axe:agent-motoren', bij);
    window.addEventListener('storage', bij);

    let alive = true;
    const laadHost = () => {
      void claudeRepos()
        .then(r => {
          if (!alive) return;
          setAanwezig(Object.fromEntries(Object.entries(r.engines ?? {}).map(([k, v]) => [k, v.aanwezig])));
          setAbonnementGebruik(r.usage ?? {});
        })
        .catch(() => { if (alive) setAanwezig(null); });
    };
    laadHost();
    const timer = window.setInterval(laadHost, 60_000);

    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('axe:agent-motoren', bij);
      window.removeEventListener('storage', bij);
    };
  }, []);

  const kies = (agent: HoofdAgent, motor: HoofdMotor) => setToewijzing(kiesMotor(agent, motor));

  // Latency = echte meting, anders een streepje. AXE Core: first-token van de
  // laatste beurten. Agents: gemiddelde duur van hun planner-runs (grootboek).
  const routingLog = useVoiceStore(s => s.routingLog);
  const axeLatency = useMemo(() => {
    const ms = routingLog.map(e => e.firstTokenMs).filter((x): x is number => typeof x === 'number').slice(0, 20);
    return ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null;
  }, [routingLog]);
  const [runs, setRuns] = useState<LedgerEntry[]>([]);
  useEffect(() => {
    void ledgerList({ source: 'planner', hours: 168, limit: 500 }).then(setRuns).catch(() => setRuns([]));
  }, []);
  const agentLatency = (id: string): number | null => {
    const d = runs.filter(r => r.name.toLowerCase().includes(id) && typeof r.duration_ms === 'number').map(r => r.duration_ms as number);
    return d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null;
  };
  const gebruiktDoor = (motor: string) => HOOFD_AGENTS.filter(a => toewijzing[a] === motor).map(a => AGENT_LABEL[a]);

  const motorStatus = (motor: HoofdMotor): Stand => {
    if (motor === 'sleutels') return { toon: 'info', tekst: 'API keys' };
    if (aanwezig === null) return { toon: 'muted', tekst: 'Host offline' };
    if (aanwezig[motor] === false) return { toon: 'bad', tekst: 'CLI missing' };
    const koelt = planner?.koeling[motor];
    if (koelt) return { toon: 'warn', tekst: `Cooling · ${new Date(koelt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` };
    return { toon: 'ok', tekst: 'Online' };
  };
  const sleutelStatus = (provider?: ProviderId): Stand => {
    if (!provider) return { toon: 'muted', tekst: 'Auto' };
    const v = verbindingen[provider];
    if (!v?.key) return { toon: 'bad', tekst: 'No key' };
    if (v.lastTest === 'ok') return { toon: 'ok', tekst: 'Online' };
    if (v.lastTest === 'fail') return { toon: 'bad', tekst: 'Failing' };
    return { toon: 'muted', tekst: 'Not tested' };
  };

  return (
    <div className="axe-motoren">
      <SectieKop titel="Main agents" uitleg="Each subscription belongs to one manager, so they never fight over the same limit. Subtasks always run on API keys." />
      <div className="axe-agent-raster">
        <AgentKaart
          naam="AXE Core"
          accent="var(--accent-cyan)"
          rol="The answer in the chat. Never a subscription, never Ollama."
          stand={primair ? { toon: 'ok', tekst: 'Online' } : { toon: 'info', tekst: 'Native' }}
          keuze={
            <select value={axeHuidig ? `${axeHuidig.provider}:${axeHuidig.model}` : ''} onChange={e => kiesAxe(e.target.value)} aria-label="Model for AXE Core">
              <option value="">AXE Native (chooses itself)</option>
              {axeKeuzes.map(k => <option key={`${k.provider}:${k.model}`} value={`${k.provider}:${k.model}`}>{k.provider} · {k.label}</option>)}
            </select>
          }
          stats={[
            { label: 'Latency', waarde: axeLatency != null ? `${axeLatency} ms` : '—' },
            { label: 'Turns', waarde: String(routingLog.length) },
            { label: 'Model', waarde: axeHuidig ? axeHuidig.label : 'auto' },
            { label: 'Last', waarde: routingLog[0] ? geleden(routingLog[0].ts) : '—' },
          ]}
        />
        {HOOFD_AGENTS.map(agent => {
          const motor = toewijzing[agent];
          const opties = kiesbaar(toewijzing, agent);
          const g = motor !== 'sleutels' ? abonnementGebruik[motor] : undefined;
          const lat = agentLatency(agent);
          const tokens = g ? g.input_tokens_7d + g.output_tokens_7d : 0;
          const vandaag = motor !== 'sleutels' ? planner?.gebruik_vandaag[motor] ?? 0 : 0;
          return (
            <AgentKaart
              key={agent}
              naam={AGENT_LABEL[agent]}
              accent={ACCENT[agent]}
              rol={WAARVOOR[agent]}
              stand={motorStatus(motor)}
              keuze={
                <select value={motor} onChange={e => kies(agent, e.target.value as HoofdMotor)} aria-label={`Engine for ${AGENT_LABEL[agent]}`}>
                  {opties.map(m => <option key={m} value={m}>{MOTOR_LABEL[m]}</option>)}
                </select>
              }
              stats={[
                { label: 'Runs 24h', waarde: g ? String(g.runs_24h) : '—' },
                { label: 'Latency', waarde: lat != null ? duur(lat) : '—' },
                { label: 'Tokens 7d', waarde: tokens ? kort(tokens) : '—' },
                { label: 'Last run', waarde: g?.last_run_at ? geleden(g.last_run_at * 1000) : '—' },
              ]}
              balken={[
                ...(planner?.dagbudget && motor !== 'sleutels' ? [{ label: 'Planner today', waarde: `${vandaag}/${planner.dagbudget}`, pct: (vandaag / planner.dagbudget) * 100 }] : []),
                ...(g && g.ok_7d + g.failed_7d > 0 ? [{ label: 'Success 7d', waarde: `${g.ok_7d}/${g.ok_7d + g.failed_7d}`, pct: (g.ok_7d / (g.ok_7d + g.failed_7d)) * 100, goed: true }] : []),
              ]}
              melding={g?.last_limit_message ?? undefined}
            />
          );
        })}
      </div>

      <SectieKop titel="App agents · Planner" uitleg="The same agent as in your other apps, on paid Anthropic/OpenAI only (min. gpt-4o-mini). The planner runs the main agents on their own." />
      <div className="axe-agent-raster">
        {agentsByTier('tier3').map(agent => {
          const ov = overrides[agent.id];
          const v = ov ? verbindingen[ov.provider] : undefined;
          return (
            <AgentKaart
              key={agent.id}
              naam={agent.name}
              accent={agent.accent}
              rol={agent.handles}
              stand={ov ? sleutelStatus(ov.provider) : { toon: 'warn', tekst: 'No model' }}
              keuze={
                <select value={ov ? `${ov.provider}:${ov.model}` : ''} onChange={e => kiesOverride(agent.id, e.target.value)} aria-label={`Model for ${agent.name}`}>
                  <option value="">choose a model (min. gpt-4o-mini)</option>
                  {tier3Keuzes.map(k => <option key={`${k.provider}:${k.model}`} value={`${k.provider}:${k.model}`}>{k.provider} · {k.label}</option>)}
                </select>
              }
              stats={[
                { label: 'Provider', waarde: ov?.provider ?? '—' },
                { label: 'Model', waarde: ov?.model ?? '—' },
                { label: 'Last test', waarde: v?.lastTestAt ? geleden(Date.parse(v.lastTestAt)) : '—' },
                { label: 'Runs in', waarde: agent.runtime },
              ]}
            />
          );
        })}
        <AgentKaart
          naam="Planner"
          accent="var(--accent-cyan)"
          rol={!planner ? 'Agent host not reachable.' : !planner.host_kan ? 'Does not run on this host (AXE_PLANNER off).' : `Every ${Math.round(planner.interval_s / 3600)}h · max ${planner.dagbudget} runs per subscription per day`}
          stand={!planner?.host_kan ? { toon: 'muted', tekst: 'Off host' } : planner.bezig ? { toon: 'info', tekst: 'Running' } : planner.aan ? { toon: 'ok', tekst: 'On' } : { toon: 'muted', tekst: 'Off' }}
          keuze={
            <label className="axe-agentkaart-schakel">
              <input type="checkbox" checked={!!planner?.aan} disabled={!planner?.host_kan} onChange={e => { void zetPlanner(e.target.checked); }} />
              Planner {planner?.aan ? 'on' : 'off'}
            </label>
          }
          stats={[
            { label: 'Interval', waarde: planner ? `${Math.round(planner.interval_s / 3600)}h` : '—' },
            { label: 'Budget', waarde: planner ? `${planner.dagbudget}/day` : '—' },
            { label: 'Today', waarde: planner ? String(Object.values(planner.gebruik_vandaag).reduce((a, b) => a + b, 0)) : '—' },
            { label: 'Last round', waarde: planner?.laatste_ronde?.begon ? geleden(Date.parse(planner.laatste_ronde.begon)) : '—' },
          ]}
        />
      </div>

      <SectieKop titel="Agents-tab workers" uitleg="Auto-routes between capable engines, Ollama included. Pinning is optional." />
      <div className="axe-agent-raster axe-agent-raster--klein">
        {agentsByTier('tier2').map(agent => {
          const ov = overrides[agent.id];
          return (
            <AgentKaart
              key={agent.id}
              klein
              naam={agent.name}
              accent={agent.accent}
              rol={agent.handles}
              stand={sleutelStatus(ov?.provider)}
              keuze={
                <select value={ov ? `${ov.provider}:${ov.model}` : ''} onChange={e => kiesOverride(agent.id, e.target.value)} aria-label={`Engine for ${agent.name}`}>
                  <option value="">Auto (races)</option>
                  {tier2Keuzes.map(k => <option key={`${k.provider}:${k.model}`} value={`${k.provider}:${k.model}`}>{k.provider} · {k.label}</option>)}
                </select>
              }
            />
          );
        })}
      </div>

      <SectieKop titel="Subscriptions" uitleg="What each subscription did, as observed by AXE. Remaining plan quota is not readable from these CLIs." />
      <div className="axe-agent-raster axe-agent-raster--ruim">
        {ALLE_MOTOREN.map((motor: AgentEngine) => {
          const g = abonnementGebruik[motor];
          const tokens = g ? g.input_tokens_7d + g.output_tokens_7d : 0;
          const vandaag = planner?.gebruik_vandaag[motor] ?? 0;
          const door = gebruiktDoor(motor);
          return (
            <AgentKaart
              key={motor}
              naam={MOTOR_LABEL[motor]}
              accent="var(--text-secondary)"
              rol={door.length ? `Used by ${door.join(', ')}` : 'Not assigned to a main agent'}
              stand={motorStatus(motor)}
              keuze={
                <>
                  <input value={modellen[motor] ?? ''} onChange={e => setModellen(zetModel(motor, e.target.value))} list={`modellen-${motor}`} placeholder={`CLI default · ${MODEL_VLAG[motor]}`} spellCheck={false} aria-label={`Model for ${MOTOR_LABEL[motor]}`} />
                  <datalist id={`modellen-${motor}`}>{MODEL_SUGGESTIES[motor].map(m => <option key={m} value={m} />)}</datalist>
                </>
              }
              stats={[
                { label: 'Runs 24h', waarde: g ? String(g.runs_24h) : '—' },
                { label: 'Runs 7d', waarde: g ? String(g.runs_7d) : '—' },
                { label: 'Tokens 7d', waarde: tokens ? kort(tokens) : '—' },
                { label: 'Last run', waarde: g?.last_run_at ? geleden(g.last_run_at * 1000) : '—' },
              ]}
              balken={[
                ...(planner?.dagbudget ? [{ label: 'Planner today', waarde: `${vandaag}/${planner.dagbudget}`, pct: (vandaag / planner.dagbudget) * 100 }] : []),
                ...(g && g.ok_7d + g.failed_7d > 0 ? [{ label: 'Success 7d', waarde: `${g.ok_7d}/${g.ok_7d + g.failed_7d}`, pct: (g.ok_7d / (g.ok_7d + g.failed_7d)) * 100, goed: true }] : []),
              ]}
              melding={g?.last_limit_message ?? undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ── De kaart ─────────────────────────────────────────────────────────── */

type Toon = 'ok' | 'bad' | 'warn' | 'info' | 'muted';
type Stand = { toon: Toon; tekst: string };
const TOON_KLEUR: Record<Toon, string> = {
  ok: 'var(--success)', bad: 'var(--error)', warn: 'var(--warning)', info: 'var(--accent-cyan)', muted: 'var(--text-muted)',
};
const ACCENT: Record<HoofdAgent, string> = {
  wingman: '#a78bfa', northsea: '#22d3ee', trading: '#34d399', developer: '#60a5fa', thinktank: '#fbbf24',
};

function geleden(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function duur(ms: number): string {
  return ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`;
}
function kort(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

function SectieKop({ titel, uitleg }: { titel: string; uitleg: string }) {
  return (
    <div className="axe-agent-sectiekop">
      <h3>{titel}</h3>
      <p>{uitleg}</p>
    </div>
  );
}

function AgentKaart({ naam, accent, rol, stand, keuze, stats, balken, melding, klein }: {
  naam: string;
  accent: string;
  rol: string;
  stand: Stand;
  keuze: ReactNode;
  stats?: { label: string; waarde: string }[];
  balken?: { label: string; waarde: string; pct: number; goed?: boolean }[];
  melding?: string;
  klein?: boolean;
}) {
  return (
    <div className={`axe-kaart axe-agentkaart${klein ? ' axe-agentkaart--klein' : ''}`}>
      <div className="axe-agentkaart-kop">
        <span className="axe-agentkaart-stip" style={{ background: accent }} />
        <b>{naam}</b>
        <span className="axe-agentkaart-stand" style={{ color: TOON_KLEUR[stand.toon] }}>
          <span style={{ background: TOON_KLEUR[stand.toon] }} />{stand.tekst}
        </span>
      </div>
      <p className="axe-agentkaart-rol" title={rol}>{rol}</p>
      <div className="axe-agentkaart-keuze">{keuze}</div>
      {stats && stats.length > 0 && (
        <div className="axe-agentkaart-stats">
          {stats.map(st => (
            <div key={st.label}>
              <span>{st.label}</span>
              <b title={st.waarde}>{st.waarde}</b>
            </div>
          ))}
        </div>
      )}
      {balken && balken.length > 0 && (
        <div className="axe-agentkaart-balken">
          {balken.map(b => {
            const pct = Math.max(0, Math.min(100, Math.round(b.pct)));
            const kleur = b.goed
              ? (pct >= 90 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--error)')
              : (pct >= 100 ? 'var(--error)' : pct >= 70 ? 'var(--warning)' : 'var(--success)');
            return (
              <div key={b.label} className="axe-agentkaart-balk">
                <div><span>{b.label}</span><b>{b.waarde}</b></div>
                <i><em style={{ width: `${pct}%`, background: kleur }} /></i>
              </div>
            );
          })}
        </div>
      )}
      {melding && <p className="axe-agentkaart-melding" title={melding}>Limit seen · {melding}</p>}
    </div>
  );
}
