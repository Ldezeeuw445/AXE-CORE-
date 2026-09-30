/**
 * De roster in drie kolommen: tier 1 links, tier 2 in het midden, tier 3
 * rechts, en Wingman's crew over de volle breedte eronder.
 *
 * Waarom kolommen en geen platte lijst: de lijst had dertien kaarten in één
 * raster, en daarmee was niet te zien dat er een architectuur onder zit.
 * Naast elkaar leest de kolomkop de motorregel mee — je ziet dus meteen
 * waarom de één op een abonnement draait en de ander op een betaalde sleutel.
 *
 * De crew staat eronder en niet in een kolom, want het is geen vierde tier:
 * het zijn negen personas die Wingman namens AXE draait. Ze hebben geen eigen
 * motorkeuze en geen eigen tab.
 *
 * Eén kaartmateriaal (UI-MAATSTAF regel 3): `.axe-kaart`, met de accentkleur
 * alleen in de letters en in het driehoekje. Actief = een dunne outline, geen
 * gloed.
 *
 * Op een smal scherm (telefoon, iPad in Split View) vallen de drie kolommen
 * onder elkaar — `auto-fill` en geen media query, zodat hij de plek meet die
 * er echt is in plaats van de vensterbreedte te raden.
 */
import { SectieBlok } from '@/presentation/components/layout/tabMaatstaf';
import { ManagerAvatar } from '@/presentation/components/axe-core/ManagerAvatar';
import { tierKolommen, tellersVoor } from '@/domain/agents/agentsTab';
import { relativeTime, type AgentPulse, type SchedulePlan, type AgentQueue } from '@/domain/agents/activity';
import { agentsByKind } from '@/domain/agents/catalog';
import { AXE_AGENTS, type AxeAgent, type AxeAgentId } from '@/domain/agents/roster';
import { useVoiceStore, type RoutingEvent } from '@/presentation/store/voiceStore';
import type { NamespaceCount } from '@/infrastructure/persistence/agentActivityService';

const CREW_ACCENT = '#38BDF8';

const AXE = AXE_AGENTS.find((a) => a.id === 'axe')!;

export interface TierRoosterProps {
  pulses: Partial<Record<AxeAgentId, AgentPulse>>;
  plans: readonly SchedulePlan[];
  queues: readonly AgentQueue[];
  counts: Record<string, NamespaceCount>;
  episodes: Readonly<Partial<Record<AxeAgentId, number>>>;
  now: number;
  gekozen: AxeAgentId | null;
  gekozenCrew: string | null;
  onKies: (id: AxeAgentId) => void;
  onKiesCrew: (id: string) => void;
}

function Teller({ n, woord, kleur }: { n: number; woord: string; kleur?: string }) {
  if (n <= 0) return null;
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono tabular-nums" style={{ color: kleur ?? 'var(--text-secondary)' }}>{n}</span>
      {' '}{woord}
    </span>
  );
}

/**
 * Wat er als laatste regel op de kaart komt: de nieuwste van twee bronnen.
 *
 * De War Room las de routing-log (wie AXE de laatste chatbeurt gaf), de
 * Agents-tab leest core_tasks/job_runs/episodes/memory. Allebei zijn waar, en
 * allebei kunnen het actueelst zijn: een chatbeurt van net is verser dan een
 * taak van gisteren, en andersom. Dit stond in WarRoom.tsx en verhuist mee —
 * anders verliest de tab de chatkant zodra de kolommen het raster overnemen.
 */
function laatsteRegel(pulse: AgentPulse | undefined, routing: RoutingEvent | undefined) {
  if (pulse && (pulse.working || !routing || pulse.at >= routing.ts)) {
    return { tekst: pulse.text, at: pulse.at, werkt: pulse.working, fout: pulse.tone === 'fail' };
  }
  if (routing) {
    const staart = [routing.winner, routing.query].filter(Boolean).join(' · ');
    return { tekst: staart || 'handled a turn', at: routing.ts, werkt: false, fout: false };
  }
  return null;
}

function AgentKaart({
  agent, pulse, routing, tellers, now, actief, werkendNu, onKies,
}: {
  agent: AxeAgent;
  pulse: AgentPulse | undefined;
  routing: RoutingEvent | undefined;
  tellers: ReturnType<typeof tellersVoor>;
  now: number;
  actief: boolean;
  /** AXE is op dit moment aan het praten EN heeft deze agent aan het werk. */
  werkendNu: boolean;
  onKies: () => void;
}) {
  const regel = laatsteRegel(pulse, routing);
  const werkt = werkendNu || !!regel?.werkt;
  const heeftTellers = tellers.schedules > 0 || tellers.queued > 0 || tellers.episodes > 0;
  return (
    <button
      type="button"
      onClick={onKies}
      aria-pressed={actief}
      className="axe-kaart w-full cursor-pointer px-3 py-2.5 text-left"
      style={{ outline: actief ? `1px solid ${agent.accent}` : undefined, outlineOffset: -1 }}
    >
      <div className="flex items-start gap-2.5">
        <ManagerAvatar agent={agent} size={26} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold" style={{ color: agent.accent }}>
              {agent.name}
            </span>
            {agent.canDecide && (
              <span className="flex-none font-mono text-[9px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
                decides
              </span>
            )}
            <span
              className="flex-none font-mono text-[9px] uppercase tracking-[0.08em]"
              style={{ color: werkt ? 'var(--accent-cyan)' : 'var(--text-muted)' }}
            >
              {werkt ? 'working' : 'idle'}
            </span>
          </div>
          <p className="truncate text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{agent.role}</p>
          {regel ? (
            <p className="mt-1 line-clamp-2 text-[11px]" title={regel.tekst}
               style={{ color: regel.fout ? 'var(--error)' : 'var(--text-secondary)' }}>
              {regel.tekst}
              <span className="ml-1.5 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {relativeTime(regel.at, now)}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {/* Trading's werk staat op zijn eigen tab; dat is geen stilte. */}
              {agent.id === 'trading' ? 'its activity lives in the Trading tab' : 'nothing recorded yet'}
            </p>
          )}
          {heeftTellers && (
            <p className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <Teller n={tellers.schedules} woord="schedules" />
              <Teller n={tellers.queued} woord="queued" />
              <Teller n={tellers.approvals} woord="need you" kleur="var(--warning)" />
              <Teller n={tellers.episodes} woord="memories" />
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export function TierRooster(p: TierRoosterProps) {
  const kolommen = tierKolommen();
  const crew = agentsByKind('crew');

  /* De routing-log: wie kreeg de laatste chatbeurt. Kwam uit de War Room, die
     dit raster nu is -- zonder dit zou de tab alleen nog zien wat er in de
     tabellen staat en niet meer wat AXE net in gesprek uitbesteedde. */
  const routingLog = useVoiceStore((s) => s.routingLog);
  const voiceStatus = useVoiceStore((s) => s.voiceStatus);
  const bezig = voiceStatus !== 'idle';
  const huidig = (routingLog[0]?.delegate ?? 'axe') as AxeAgentId;
  const laatstePerAgent = new Map<AxeAgentId, RoutingEvent>();
  for (const ev of routingLog) {
    const d = (ev.delegate ?? 'axe') as AxeAgentId;
    if (!laatstePerAgent.has(d)) laatstePerAgent.set(d, ev);
  }

  return (
    <>
      {/* AXE staat boven de kolommen en niet erin: hij is geen tier, hij stuurt
          ze aan. Zijn regel zegt of hij nu praat en aan wie hij het gaf. */}
      <div className="mb-3.5">
        <AgentKaart
          agent={AXE}
          pulse={p.pulses.axe}
          routing={laatstePerAgent.get('axe')}
          tellers={tellersVoor('axe', p.plans, p.queues, p.counts, p.episodes)}
          now={p.now}
          actief={p.gekozen === 'axe'}
          werkendNu={bezig}
          onKies={() => p.onKies('axe')}
        />
        {/* "Chat:" ervoor, want dit gaat over de stem/chat en de kaart erboven
            over de tabellen. Zonder dat woord las het als tegenspraak: de
            kaart zei WORKING (een lopende taak) terwijl deze regel "All quiet"
            zei (geen chatbeurt onderweg). Allebei waar, twee onderwerpen. */}
        <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {bezig
            ? `Chat: AXE is working${huidig !== 'axe' ? ` → ${AXE_AGENTS.find((a) => a.id === huidig)?.name}` : ''}…`
            : 'Chat: all quiet — AXE is ready'}
        </p>
      </div>

      {/* Drie kolommen als het past, anders onder elkaar. minmax meet de
          werkelijke plek -- met de rechterlade open is dat smaller dan het
          venster, en dan hoort hij ook terug te vallen. */}
      <div
        style={{
          display: 'grid',
          // 220 en niet 260: met de lade open bleef er op een iPad (1024)
          // maar ~476px over, en bij 260 viel alles terug op één kolom. Bij 220
          // passen er twee, en zonder lade nog steeds gewoon drie.
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 14,
          alignItems: 'start',
        }}
      >
        {kolommen.map((kol) => (
          <div key={kol.key} className="flex min-w-0 flex-col gap-2">
            <header className="pb-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                {kol.rang} · {kol.leden.length} agents
              </div>
              <div className="mt-0.5 text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>{kol.titel}</div>
              <p className="mt-1 text-[10.5px] leading-snug" style={{ color: 'var(--text-muted)' }}>{kol.regel}</p>
            </header>
            {kol.leden.map((agent) => (
              <AgentKaart
                key={agent.id}
                agent={agent}
                pulse={p.pulses[agent.id]}
                routing={laatstePerAgent.get(agent.id)}
                tellers={tellersVoor(agent.id, p.plans, p.queues, p.counts, p.episodes)}
                now={p.now}
                actief={p.gekozen === agent.id}
                werkendNu={bezig && huidig === agent.id}
                onKies={() => p.onKies(agent.id)}
              />
            ))}
          </div>
        ))}
      </div>

      <SectieBlok
        titel="Wingman's crew"
        extra={
          <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
            The {crew.length} CrewAI personas Wingman runs on AXE&apos;s behalf — no tier of their own.
          </span>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 9 }}>
          {crew.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => p.onKiesCrew(c.id)}
              aria-pressed={p.gekozenCrew === c.id}
              className="axe-kaart w-full cursor-pointer px-2.5 py-2 text-left"
              style={{ outline: p.gekozenCrew === c.id ? `1px solid ${CREW_ACCENT}` : undefined, outlineOffset: -1 }}
            >
              <div className="flex items-center gap-2">
                <span className="flex-none rounded-full" style={{ width: 7, height: 7, background: CREW_ACCENT }} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium" style={{ color: CREW_ACCENT }}>{c.name}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                {c.description}
              </p>
            </button>
          ))}
        </div>
      </SectieBlok>
    </>
  );
}
