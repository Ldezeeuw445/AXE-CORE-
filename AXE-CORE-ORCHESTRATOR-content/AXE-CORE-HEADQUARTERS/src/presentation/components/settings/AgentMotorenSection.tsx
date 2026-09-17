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
import { Cpu } from 'lucide-react';
import {
  HOOFD_AGENTS, AGENT_LABEL, MOTOR_LABEL, TOEGESTAAN, kiesbaar,
  type HoofdAgent, type HoofdMotor, type MotorToewijzing,
} from '@/domain/agentMotoren';
import { leesToewijzing, kiesMotor } from '@/infrastructure/persistence/agentMotorenOpslag';
import { leesModellen, zetModel } from '@/infrastructure/persistence/motorModellenOpslag';
import { MODEL_SUGGESTIES, MODEL_VLAG, type MotorModellen } from '@/domain/motorModellen';
import { ALLE_MOTOREN, type AgentEngine } from '@/domain/abonnementChat';
import { claudeRepos, plannerStatus, plannerZetAan, type PlannerStatus } from '@/infrastructure/gateways/axeCoreApiService';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { PROVIDERS, type ProviderId } from '@/domain/providers';
import { chatModelKeuzes, workerKeuzes, paidApiKeuzes, isActief, leesVerbindingen, type Verbinding } from '@/domain/chatModelKeuzes';
import { agentsByTier } from '@/domain/agents/roster';
import { leesOverrides, zetOverride, type OverrideMap } from '@/infrastructure/persistence/agentEngineOverrides';

/** Een klein bolletje: heeft de provider die hier gekozen staat een sleutel,
 *  en werkte hij de laatste keer dat hij getest is? Dezelfde `lastTest` die de
 *  Provider Keys-kaarten verderop op dit scherm ook tonen — geen tweede
 *  waarheid, alleen een kleinere weergave ervan naast de agent die hem
 *  gebruikt. */
function VerbindingBadge({ provider, verbindingen }: { provider?: ProviderId; verbindingen: Record<string, Verbinding> }) {
  if (!provider) return null;
  const v = verbindingen[provider];
  if (!v?.key) return <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>geen sleutel</span>;
  const kleur = v.lastTest === 'ok' ? 'var(--success)' : v.lastTest === 'fail' ? 'var(--error)' : 'var(--text-muted)';
  const tekst = v.lastTest === 'ok' ? 'werkt' : v.lastTest === 'fail' ? 'faalt' : 'nog niet getest';
  return (
    <span className="flex items-center gap-1 text-[9px]" style={{ color: kleur }} title={v.lastTestAt ? `Laatst getest ${new Date(v.lastTestAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : undefined}>
      <span className="rounded-full" style={{ width: 5, height: 5, background: kleur, display: 'inline-block' }} />
      {tekst}
    </span>
  );
}

/** Een 0-100% balkje voor hoeveel van het dagbudget van deze motor al op is
 *  (planner.gebruik_vandaag / planner.dagbudget) — de enige echte "usage"-
 *  telling die dit apparaat heeft: Claude/Codex/Cursor geven zelf geen
 *  quotum terug, dit is puur hoe vaak de PLANNER dit abonnement vandaag al
 *  inzette. Handmatige runs (chat, code-editor) tellen hier niet in mee. */
function GebruikBalk({ gebruik, budget }: { gebruik: number; budget: number }) {
  if (!budget) return null;
  const pct = Math.min(100, Math.round((gebruik / budget) * 100));
  const kleur = pct >= 100 ? 'var(--error)' : pct >= 70 ? 'var(--warning)' : 'var(--success)';
  return (
    <div className="flex items-center gap-1.5 shrink-0" title={`Planner: ${gebruik} van ${budget} vandaag`}>
      <div className="rounded-full overflow-hidden" style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: kleur }} />
      </div>
      <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>{pct}%</span>
    </div>
  );
}

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
    // Welke CLI's staan op de host waar de agents draaien. Aanwezig, niet of je
    // ingelogd bent -- dat laatste zie je pas bij de eerste run.
    claudeRepos()
      .then(r => setAanwezig(Object.fromEntries(Object.entries(r.engines ?? {}).map(([k, v]) => [k, v.aanwezig]))))
      .catch(() => setAanwezig(null));
    return () => { window.removeEventListener('axe:agent-motoren', bij); window.removeEventListener('storage', bij); };
  }, []);

  const kies = (agent: HoofdAgent, motor: HoofdMotor) => setToewijzing(kiesMotor(agent, motor));

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <h2 className="text-body font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <Cpu size={15} style={{ color: 'var(--accent-cyan)' }} /> Motoren per agent
      </h2>
      <p className="text-xs-custom mb-3" style={{ color: 'var(--text-muted)' }}>
        Elk abonnement hoort bij één tier-1 manager, zodat ze niet om hetzelfde limiet vechten.
        Subtaken draaien altijd op je API-sleutels hieronder.
      </p>

      {/* Rij 1 — AXE Core. Los van de rijen eronder: nooit een abonnement, nooit
          Ollama, alleen snelle/slimme chat-modellen. Zelfde opgeslagen keuze als
          de ChatModelKiezer boven de composer. */}
      <div
        className="flex items-center justify-between gap-3 pb-2 mb-2"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="min-w-0">
          <div className="text-xs-custom font-medium" style={{ color: 'var(--accent-cyan)' }}>AXE Core</div>
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Het antwoord in de chat. Nooit een abonnement, nooit Ollama.
          </div>
        </div>
        <select
          value={axeHuidig ? `${axeHuidig.provider}:${axeHuidig.model}` : ''}
          onChange={e => kiesAxe(e.target.value)}
          className="rounded-lg px-2 py-1 text-xs-custom"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          aria-label="Model voor AXE Core"
        >
          <option value="">AXE Native (kiest zelf)</option>
          {axeKeuzes.map(k => (
            <option key={`${k.provider}:${k.model}`} value={`${k.provider}:${k.model}`}>
              {k.provider} · {k.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {HOOFD_AGENTS.map(agent => {
          const huidig = toewijzing[agent];
          const opties = kiesbaar(toewijzing, agent);
          const bezetDoorAnder = TOEGESTAAN[agent].filter(m => !opties.includes(m));
          const cliOntbreekt = huidig !== 'sleutels' && aanwezig !== null && aanwezig[huidig] === false;
          return (
            <div key={agent} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs-custom font-medium" style={{ color: 'var(--text-primary)' }}>{AGENT_LABEL[agent]}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {WAARVOOR[agent]}
                  {bezetDoorAnder.length > 0 && ` · al verdeeld: ${bezetDoorAnder.map(m => MOTOR_LABEL[m]).join(', ')}`}
                </div>
                {cliOntbreekt && (
                  <div className="text-[10px]" style={{ color: 'var(--error)' }}>
                    Deze CLI staat niet op de agent-host — installeer en log in via Terminals → Mac · agents.
                  </div>
                )}
              </div>
              <select
                value={huidig}
                onChange={e => kies(agent, e.target.value as HoofdMotor)}
                className="rounded-lg px-2 py-1 text-xs-custom"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                aria-label={`Motor voor ${AGENT_LABEL[agent]}`}
              >
                {opties.map(m => <option key={m} value={m}>{MOTOR_LABEL[m]}</option>)}
              </select>
            </div>
          );
        })}
      </div>

      {/* Tier 2 — Agents-tab workers. Geen abonnement-uitsluiting nodig: dit
          zijn gewone API-modellen, en twee agents die dezelfde Gemini-sleutel
          gebruiken botsen niet zoals twee agents op één ingelogde CLI-sessie
          dat wel doen. Standaard "Auto"; vastzetten is optioneel. Mag, anders
          dan AXE's eigen rij hierboven, wél Ollama -- routinewerk (cron-tik,
          task-check) hoeft niet het slimste model te zijn, en dat is precies
          waar "local models first" voor bedoeld is (workerKeuzes). */}
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="text-xs-custom font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Agents-tab workers</div>
        <div className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
          Auto-routeert tussen capabele engines, Ollama inbegrepen. Vastzetten kan, maar hoeft niet.
        </div>
        <div className="space-y-2">
          {agentsByTier('tier2').map(agent => {
            const ov = overrides[agent.id];
            return (
              <div key={agent.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs-custom font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    {agent.name}
                    <VerbindingBadge provider={ov?.provider} verbindingen={verbindingen} />
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{agent.handles}</div>
                </div>
                <select
                  value={ov ? `${ov.provider}:${ov.model}` : ''}
                  onChange={e => kiesOverride(agent.id, e.target.value)}
                  className="rounded-lg px-2 py-1 text-xs-custom"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  aria-label={`Motor voor ${agent.name}`}
                >
                  <option value="">Auto (races)</option>
                  {tier2Keuzes.map(k => (
                    <option key={`${k.provider}:${k.model}`} value={`${k.provider}:${k.model}`}>{k.provider} · {k.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tier 3 — cross-app assistants. Dezelfde agent als in Companion/
          Trading OS, hier alleen zichtbaar en instelbaar. Alleen betaalde
          Anthropic/OpenAI (nooit lager dan gpt-4o-mini) — geen abonnement,
          geen Ollama, geen "auto": Luka's eigen regel voor deze twee. */}
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="text-xs-custom font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Cross-app assistants</div>
        <div className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
          Dezelfde agent als in je andere apps. Alleen betaalde Anthropic/OpenAI, minimaal gpt-4o-mini.
        </div>
        <div className="space-y-2">
          {agentsByTier('tier3').map(agent => {
            const ov = overrides[agent.id];
            return (
              <div key={agent.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs-custom font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    {agent.name}
                    <VerbindingBadge provider={ov?.provider} verbindingen={verbindingen} />
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{agent.handles}</div>
                </div>
                <select
                  value={ov ? `${ov.provider}:${ov.model}` : ''}
                  onChange={e => kiesOverride(agent.id, e.target.value)}
                  className="rounded-lg px-2 py-1 text-xs-custom"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  aria-label={`Model voor ${agent.name}`}
                >
                  <option value="">kies een model (min. gpt-4o-mini)</option>
                  {tier3Keuzes.map(k => (
                    <option key={`${k.provider}:${k.model}`} value={`${k.provider}:${k.model}`}>{k.provider} · {k.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Het model per abonnement.
          Hoort bij de MOTOR en niet bij de agent: Claude Code draait een
          Claude-model, Codex een OpenAI-model. Per agent instellen zou je een
          model laten kiezen dat zijn motor niet kent, en dat merk je pas als de
          run faalt. Leeg laten = de CLI houdt zijn eigen standaard, die met een
          update meebeweegt. */}
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="text-xs-custom font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Model per abonnement</div>
        <div className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
          Leeg = de CLI kiest zelf. Een naam of alias mag allebei.
        </div>
        <div className="space-y-2">
          {ALLE_MOTOREN.map((motor: AgentEngine) => (
            <div key={motor} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs-custom flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  {MOTOR_LABEL[motor]}
                  {planner?.host_kan && (
                    <GebruikBalk gebruik={planner.gebruik_vandaag[motor] ?? 0} budget={planner.dagbudget} />
                  )}
                </div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {MODEL_VLAG[motor]} · suggesties: {MODEL_SUGGESTIES[motor].join(', ')}
                </div>
              </div>
              <input
                value={modellen[motor] ?? ''}
                onChange={e => setModellen(zetModel(motor, e.target.value))}
                list={`modellen-${motor}`}
                placeholder="CLI-standaard"
                spellCheck={false}
                className="w-[170px] rounded-lg px-2 py-1 text-xs-custom"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                aria-label={`Model voor ${MOTOR_LABEL[motor]}`}
              />
              <datalist id={`modellen-${motor}`}>
                {MODEL_SUGGESTIES[motor].map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
          ))}
        </div>
      </div>

      {/* De planner: dezelfde abonnementen, maar dan zonder dat je iets vraagt.
          Met een dagbudget per abonnement, zodat hij het niet opmaakt. */}
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs-custom font-medium" style={{ color: 'var(--text-primary)' }}>Planner</div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {!planner ? 'Agent-host niet bereikbaar.'
                : !planner.host_kan ? 'Draait niet op deze host (AXE_PLANNER staat niet aan).'
                : `Elke ${Math.round(planner.interval_s / 3600)} uur · max ${planner.dagbudget} runs per abonnement per dag`}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs-custom shrink-0" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={!!planner?.aan} disabled={!planner?.host_kan} onChange={e => { void zetPlanner(e.target.checked); }} />
            aan
          </label>
        </div>
        {/* Per abonnement hoeveel de planner er vandaag al mee deed — dezelfde
            balk als hierboven, zodat "hoeveel is er al gebruikt" in dit ene
            scherm op precies twee plekken hetzelfde antwoord geeft. Alleen
            motoren die vandaag iets deden of aan het koelen zijn — een rij
            "0%" voor elk van de acht abonnementen is ruis, geen informatie. */}
        {planner?.host_kan && (Object.keys(planner.gebruik_vandaag).length > 0 || Object.keys(planner.koeling).length > 0) && (
          <div className="mt-2 space-y-1">
            {ALLE_MOTOREN.filter(m => (planner.gebruik_vandaag[m] ?? 0) > 0 || planner.koeling[m]).map(motor => (
              <div key={motor} className="flex items-center justify-between gap-3">
                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{MOTOR_LABEL[motor]}</span>
                <div className="flex items-center gap-2">
                  {planner.koeling[motor] && (
                    <span className="text-[9px]" style={{ color: 'var(--warning)' }}>
                      koelt tot {new Date(planner.koeling[motor]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  <GebruikBalk gebruik={planner.gebruik_vandaag[motor] ?? 0} budget={planner.dagbudget} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
