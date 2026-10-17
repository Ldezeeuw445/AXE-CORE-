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
import { StatusKaart, SectieKop, geleden, duur, kort, type Stand } from '@/presentation/components/settings/StatusKaart';
import {
  HOOFD_AGENTS, AGENT_LABEL, MOTOR_LABEL, kiesbaar,
  type HoofdAgent, type HoofdMotor, type MotorToewijzing,
} from '@/domain/agentMotoren';
import { leesToewijzing, kiesMotor } from '@/infrastructure/persistence/agentMotorenOpslag';
import {
  claudeRepos, plannerStatus, plannerZetAan, abonnementVerbruik,
  ledgerList, codingSeatsHeartbeat,
  type PlannerStatus, type AgentSubscriptionUsage, type LedgerEntry,
  type CodingSeatStatus,
} from '@/infrastructure/gateways/axeCoreApiService';
import { motorNaam, type MotorStatus } from '@/domain/motorNaam';
import { abonnementKaartStand, stoelSleutel, winnendeStoel } from '@/domain/codingSeats';
import { type AbonnementVerbruik } from '@/domain/abonnementVerbruik';
import { useCoreStatusStore } from '@/presentation/store/coreStatusStore';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { PROVIDERS, type ProviderId } from '@/domain/providers';
import { isActief, leesVerbindingen } from '@/domain/chatModelKeuzes';
import { agentsByTier, type AxeAgent } from '@/domain/agents/roster';
import { keuzesVoorAgent } from '@/domain/agents/motorScope';
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
  const [motorAccounts, setMotorAccounts] = useState<Record<string, MotorStatus>>({});
  const [planner, setPlanner] = useState<PlannerStatus | null>(null);
  const [abonnementGebruik, setAbonnementGebruik] = useState<Record<string, AgentSubscriptionUsage>>({});
  const [verbruik, setVerbruik] = useState<Record<string, AbonnementVerbruik>>({});
  const [stoelen, setStoelen] = useState<Record<string, CodingSeatStatus> | null>(null);
  const [overrides, setOverrides] = useState<OverrideMap>(() => leesOverrides());
  /* De vierde en laatste plek die dit zelf vroeg. `null` betekent hier nog
     steeds "nog niets gemeten" -- precies wat de eigen lus ook deed -- dus de
     `== null ? 'Checking'`-regels hieronder blijven kloppen. Verschil: een
     mislukte ronde zet dit niet meer hard op offline, want dat is geen meting.
     Zie coreStatusStore.ts. */
  const coreRuntime = useCoreStatusStore((st) => st.status);
  const verbindingen = useMemo(() => leesVerbindingen(), [toewijzing, overrides]);
  /* Welke motoren een agent in zijn menu krijgt, komt uit zijn `dropdownScope`
     in roster.ts -- niet uit een lijst die hier per sectie is uitgekozen.
     Hiervoor stonden `workerKeuzes` en `paidApiKeuzes` hard aan de tier-2- en
     tier-3-sectie geplakt, en dat is precies waarom een nieuwe agent in de
     roster hier niets kreeg: de secties wisten van hem af, de lijsten niet.
     Zie domain/agents/motorScope.ts. */
  const keuzesVoor = useMemo(
    () => (agent: AxeAgent) => keuzesVoorAgent(agent, verbindingen, PROVIDERS.map(p => p.id)) ?? [],
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
    () => keuzesVoorAgent('axe', leesVerbindingen(), PROVIDERS.map(p => p.id)) ?? [],
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
          setAbonnementGebruik(r.usage ?? {});
        })
        .catch(() => { /* host onbereikbaar: usage blijft leeg */ });
      void codingSeatsHeartbeat()
        .then(r => {
          if (!alive) return;
          const map: Record<string, CodingSeatStatus> = {};
          for (const s of r.seats ?? []) {
            const id = stoelSleutel(s);
            if (!id) continue;
            const rij = { ...s, id, seat_id: id };
            map[id] = winnendeStoel([map[id], rij].filter(Boolean) as CodingSeatStatus[]) ?? rij;
          }
          setStoelen(map);
          setMotorAccounts(Object.fromEntries(Object.entries(map).map(([k, v]) => [k, {
            account: v.logged_in === true ? v.email : null,
            ingelogd: v.logged_in,
            nietGebruikt: k === 'claude' && v.logged_in === false && v.config_exists !== false,
          }])));
        })
        .catch(() => { if (alive) setStoelen(null); });
    };
    // Gemeten bij Anthropic/OpenAI zelf; de host onthoudt het twee minuten,
    // dus elke minuut vragen kost de aanbieder hooguit één check per twee.
    const laadVerbruik = () => {
      void abonnementVerbruik()
        .then(r => { if (alive) setVerbruik(Object.fromEntries((r.accounts ?? []).map(a => [a.motor, a]))); })
        .catch(() => { /* host onbereikbaar: kaarten blijven op Checking */ });
    };
    laadHost();
    laadVerbruik();
    const timer = window.setInterval(() => { laadHost(); laadVerbruik(); }, 60_000);

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

  const motorStatus = (motor: HoofdMotor): Stand => {
    // Top-right status is capability truth only. "API keys", "CLI present" and
    // similar implementation details belong in stats, never in the status slot.
    if (motor === 'sleutels') {
      if (coreRuntime == null) return { toon: 'muted', tekst: 'Checking' };
      return coreRuntime.online
        ? { toon: 'ok', tekst: 'Online' }
        : { toon: 'bad', tekst: 'Offline' };
    }
    const stoel = stoelen?.[motor];
    if (stoelen == null) return { toon: 'muted', tekst: 'Checking' };
    const kaart = abonnementKaartStand({
      stoel: stoel ? {
        id: motor,
        logged_in: stoel.logged_in ?? null,
        rate_limited: Boolean(stoel.rate_limited),
        current_task: stoel.current_task ?? null,
        last_seen_at: stoel.last_seen_at,
        config_exists: stoel.config_exists,
      } : null,
      heartbeatOk: true,
      verbruikStatus: verbruik[motor]?.status,
      lastRunFout: verbruik[motor]?.reden ?? null,
    });
    if (kaart.stand.tekst === 'Online' || kaart.stand.tekst === 'Running') {
      const koeltHb = planner?.koeling[motor];
      if (koeltHb) return { toon: 'bad', tekst: 'Cooling down' };
    }
    return kaart.stand;
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
        <StatusKaart
          naam="AXE Core"
          accent="var(--accent-cyan)"
          rol="The answer in the chat. Never a subscription, never Ollama."
          stand={coreRuntime == null
            ? { toon: 'muted', tekst: 'Checking' }
            : coreRuntime.online
              ? { toon: 'ok', tekst: 'Online' }
              : { toon: 'bad', tekst: 'Offline' }}
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
            <StatusKaart
              key={agent}
              naam={AGENT_LABEL[agent]}
              accent={ACCENT[agent]}
              rol={WAARVOOR[agent]}
              stand={motorStatus(motor)}
              keuze={
                <select value={motor} onChange={e => kies(agent, e.target.value as HoofdMotor)} aria-label={`Engine for ${AGENT_LABEL[agent]}`}>
                  {opties.map(m => <option key={m} value={m}>{motorNaam(MOTOR_LABEL[m], motorAccounts[m])}</option>)}
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
            <StatusKaart
              key={agent.id}
              naam={agent.name}
              accent={agent.accent}
              rol={agent.handles}
              stand={ov ? sleutelStatus(ov.provider) : { toon: 'warn', tekst: 'No model' }}
              keuze={
                <select value={ov ? `${ov.provider}:${ov.model}` : ''} onChange={e => kiesOverride(agent.id, e.target.value)} aria-label={`Model for ${agent.name}`}>
                  <option value="">choose a model (min. gpt-4o-mini)</option>
                  {keuzesVoor(agent).map(k => <option key={`${k.provider}:${k.model}`} value={`${k.provider}:${k.model}`}>{k.provider} · {k.label}</option>)}
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
        <StatusKaart
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
            <StatusKaart
              key={agent.id}
              klein
              naam={agent.name}
              accent={agent.accent}
              rol={agent.handles}
              stand={sleutelStatus(ov?.provider)}
              keuze={
                <select value={ov ? `${ov.provider}:${ov.model}` : ''} onChange={e => kiesOverride(agent.id, e.target.value)} aria-label={`Engine for ${agent.name}`}>
                  <option value="">Auto (races)</option>
                  {keuzesVoor(agent).map(k => <option key={`${k.provider}:${k.model}`} value={`${k.provider}:${k.model}`}>{k.provider} · {k.label}</option>)}
                </select>
              }
            />
          );
        })}
      </div>
      <p className="text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>
        Live seat status and usage live under Settings → Subscriptions. Assignment stays here so two agents never share a limit.
      </p>
    </div>
  );
}


const ACCENT: Record<HoofdAgent, string> = {
  wingman: '#a78bfa', northsea: '#22d3ee', trading: '#34d399', developer: '#60a5fa', thinktank: '#fbbf24',
};
