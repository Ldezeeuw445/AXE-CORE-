/**
 * Instellingen → Motoren per agent.
 *
 * Vier agents, vier abonnementen, en elk abonnement bij hooguit één agent. Het
 * menu van een agent toont geen abonnement dat al van een ander is; kies je er
 * toch een via een andere weg, dan zet normaliseer() het recht. Subtaken staan
 * hier bewust niet: die draaien altijd op je API-sleutels.
 * Zie domain/agentMotoren.ts.
 */
import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import {
  HOOFD_AGENTS, AGENT_LABEL, MOTOR_LABEL, TOEGESTAAN, kiesbaar,
  type HoofdAgent, type HoofdMotor, type MotorToewijzing,
} from '@/domain/agentMotoren';
import { leesToewijzing, kiesMotor } from '@/infrastructure/persistence/agentMotorenOpslag';
import { claudeRepos, plannerStatus, plannerZetAan, type PlannerStatus } from '@/infrastructure/gateways/axeCoreApiService';

const WAARVOOR: Record<HoofdAgent, string> = {
  'axe-core': 'Het antwoord in de chat. Alleen-lezen in je repo.',
  'code-agent': 'Runs in de Code Editor. Mag bestanden bewerken.',
  'axe-algo': 'Alleen de eindbeslissing per cyclus. De elf desk-rollen blijven op sleutels.',
  'maps-agent': 'Northsea Commodity: bouwt en runt de desk op de 3D Maps-tab. Schrijftaken pas na jouw akkoord.',
};

export function AgentMotorenSection() {
  const [toewijzing, setToewijzing] = useState<MotorToewijzing>(() => leesToewijzing());
  const [aanwezig, setAanwezig] = useState<Record<string, boolean> | null>(null);
  const [planner, setPlanner] = useState<PlannerStatus | null>(null);
  useEffect(() => { plannerStatus().then(setPlanner).catch(() => setPlanner(null)); }, []);
  const zetPlanner = async (aan: boolean) => {
    try { await plannerZetAan(aan); setPlanner(await plannerStatus()); } catch { /* host onbereikbaar */ }
  };

  useEffect(() => {
    const bij = () => setToewijzing(leesToewijzing());
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
        Elk abonnement hoort bij één agent, zodat ze niet om hetzelfde limiet vechten. Subtaken
        draaien altijd op je API-sleutels hieronder.
      </p>
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
      {/* De planner: dezelfde abonnementen, maar dan zonder dat je iets vraagt.
          Met een dagbudget per abonnement, zodat hij het niet opmaakt. */}
      <div className="mt-3 pt-3 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="min-w-0">
          <div className="text-xs-custom font-medium" style={{ color: 'var(--text-primary)' }}>Planner</div>
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {!planner ? 'Agent-host niet bereikbaar.'
              : !planner.host_kan ? 'Draait niet op deze host (AXE_PLANNER staat niet aan).'
              : `Elke ${Math.round(planner.interval_s / 3600)} uur · max ${planner.dagbudget} runs per abonnement per dag · vandaag: ${
                  Object.entries(planner.gebruik_vandaag).map(([m, n]) => `${m} ${n}`).join(', ') || 'nog niets'}${
                  Object.keys(planner.koeling).length ? ` · koelt: ${Object.entries(planner.koeling).map(([m, t]) => `${m} tot ${new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`).join(', ')}` : ''}`}
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs-custom shrink-0" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={!!planner?.aan} disabled={!planner?.host_kan} onChange={e => { void zetPlanner(e.target.checked); }} />
          aan
        </label>
      </div>
    </div>
  );
}
