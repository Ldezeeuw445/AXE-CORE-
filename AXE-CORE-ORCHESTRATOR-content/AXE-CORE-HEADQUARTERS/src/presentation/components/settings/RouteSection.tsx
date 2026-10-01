/**
 * Waar jouw werk heen gaat -- gemeten, niet beschreven.
 *
 * Hier stond "AXE Branches": branch A (CrewAI), B (cloudproviders), C (Claude
 * Code), de drie takken van de LangGraph-orchestrator op de VPS. Twee dingen
 * waren daar mis.
 *
 * Het eerste: dat pad wordt bijna nooit gelopen. `langGraphOrchestrator` zit in
 * `voiceStore.sendMessage`, de binnenste van vijf wikkels; de tier-router en
 * stable chat ervoor vangen het werk af. Het paneel beschreef dus een route die
 * de app nauwelijks neemt, in woorden die nergens anders voorkomen -- naast
 * tier 1/2/3 in de code, de agentsbalk en de jobs. Luka, 1 okt 2026: precies
 * wat één bron van waarheid in de weg zit.
 *
 * Het tweede: het was een dienststatus die zich voordeed als routering. Of
 * CrewAI draait zegt niets over waar je laatste zin heen ging.
 *
 * Nu: boven de drie wegen zoals ze werkelijk gelopen zijn, uit `routingLog` en
 * de jobstore. Onder dezelfde diensten, nu als diensten -- want of ze leven is
 * wél iets wat je hier hoort te kunnen zien.
 */
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, GitBranch, CheckCircle2, XCircle } from 'lucide-react';
import { getSystemState, checkAllServices, type ServiceState } from '@/application/system/systemService';
import { claudeRepos, type ClaudeRepoInfo } from '@/infrastructure/gateways/axeCoreApiService';
import { routeOverzicht, laatsteBeurtTekst, type TierRegel } from '@/domain/tierRouter/routeOverzicht';
import { agentById } from '@/domain/agents/roster';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { useAxeJobStore, lopendeJobs } from '@/presentation/store/axeJobStore';
import { SectieKop, geleden } from './StatusKaart';

/** De diensten die een weg kan gebruiken. Diensten, geen routes. */
const DIENSTEN: ReadonlyArray<{ sleutel: string; naam: string; waarvoor: string }> = [
  { sleutel: 'crewai', naam: 'CrewAI', waarvoor: 'Specialist crews for tier 3 jobs' },
  { sleutel: 'ollama', naam: 'Ollama', waarvoor: 'Local models and the bge-m3 memory index' },
  { sleutel: 'claude_code', naam: 'Claude Code', waarvoor: 'Headless CLI in a whitelisted checkout' },
  { sleutel: 'openrouter', naam: 'OpenRouter', waarvoor: 'Cloud models for tier 2 and 3' },
  { sleutel: 'groq', naam: 'Groq', waarvoor: 'The fast model tier 2 streams from' },
];

function RepoRegel({ naam, info }: { naam: string; info: ClaudeRepoInfo }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 min-w-0">
        <GitBranch size={11} style={{ color: info.runnable ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0 }} />
        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{naam}</span>
        <span className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{info.branch ?? '—'}</span>
      </div>
      {info.runnable
        ? <CheckCircle2 size={11} style={{ color: 'var(--success)', flexShrink: 0 }} />
        : <XCircle size={11} style={{ color: info.exists ? 'var(--warning)' : 'var(--error)', flexShrink: 0 }} />}
    </div>
  );
}

/**
 * Eén weg, met zijn aandeel als balk.
 *
 * De balk is grijs, niet per tier een eigen kleur: dit is een hoeveelheid, geen
 * stand, en kleur hoort hier het woord te zijn (wet 10).
 */
function RouteRegel({ regel, werk }: { regel: TierRegel; werk: string | null }) {
  const procent = Math.round(regel.deel * 100);
  return (
    <div className="rounded-xl px-4 py-3 space-y-2"
      style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{regel.naam}</span>
        <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
          {regel.aantal === 0 ? 'not used yet' : `${regel.aantal} · ${procent}%`}
        </span>
      </div>

      {/* De balk: hoeveel van de gemeten beurten deze weg namen. */}
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full"
          style={{ width: `${procent}%`, background: 'rgba(255,255,255,0.45)', transition: 'width .4s ease' }} />
      </div>

      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{regel.uitleg}</p>

      {regel.laatsteMotor && (
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Last answered by: </span>
          <span className="font-mono">{regel.laatsteMotor}</span>
        </p>
      )}
      {regel.laatsteAgent && (
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Last agent: </span>
          {agentById(regel.laatsteAgent).name}
        </p>
      )}
      {werk && (
        <p className="text-[10px]" style={{ color: 'var(--accent-cyan)' }}>{werk}</p>
      )}
    </div>
  );
}

function DienstRegel({ dienst, dienstStand }: {
  dienst: { sleutel: string; naam: string; waarvoor: string };
  dienstStand: ServiceState | undefined;
}) {
  const stand = dienstStand?.status;
  const kleur = stand === 'online' ? 'var(--success)' : stand ? 'var(--error)' : 'var(--text-muted)';
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="min-w-0">
        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{dienst.naam}</span>
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{dienst.waarvoor}</p>
      </div>
      <span className="text-[10px] font-mono shrink-0" style={{ color: kleur }}>
        {stand ?? 'not tracked'}
      </span>
    </div>
  );
}

export function RouteSection() {
  const routingLog = useVoiceStore((s) => s.routingLog);
  const jobs = useAxeJobStore((s) => s.jobs);
  const [diensten, setDiensten] = useState<ServiceState[]>([]);
  const [repos, setRepos] = useState<Record<string, ClaudeRepoInfo> | null>(null);
  const [repoFout, setRepoFout] = useState<string | null>(null);
  const [verversen, setVerversen] = useState(false);

  const wegen = useMemo(() => routeOverzicht(routingLog), [routingLog]);
  const laatste = useMemo(() => laatsteBeurtTekst(routingLog), [routingLog]);
  const lopend = useMemo(() => lopendeJobs(jobs), [jobs]);

  const laadRepos = async () => {
    try {
      const res = await claudeRepos();
      setRepos(res.repos ?? {});
      setRepoFout(null);
    } catch (e) {
      setRepos(null);
      setRepoFout(e instanceof Error ? e.message : 'Could not reach /claude/repos (check AXE_API_KEY)');
    }
  };

  const laad = async () => {
    const [stand] = await Promise.all([getSystemState(), laadRepos()]);
    setDiensten(stand);
  };

  useEffect(() => { void laad(); }, []);

  const verversNu = async () => {
    setVerversen(true);
    try {
      await checkAllServices();
      await laad();
    } finally {
      setVerversen(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <SectieKop
          titel="Routes"
          uitleg="The three ways a turn can go, counted over your last 50 turns on this device."
        />
        <button onClick={verversNu} disabled={verversen}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] shrink-0"
          style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }}>
          <RefreshCw size={11} className={verversen ? 'animate-spin' : ''} />
          Refresh services
        </button>
      </div>

      <div className="space-y-2">
        {wegen.map((regel) => (
          <RouteRegel
            key={regel.tier}
            regel={regel}
            /* Tier 3 is de enige weg waar iets kan dóórlopen nadat je antwoord
               gaf -- daar hoort de live stand bij, niet alleen de historie. */
            werk={regel.tier === 3 && lopend.length > 0
              ? `${lopend.length} job${lopend.length === 1 ? '' : 's'} running now: ${lopend.map((j) => j.title).join(', ')}`
              : null}
          />
        ))}
      </div>

      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        {laatste
          ? `${laatste} ${routingLog[0] ? `(${geleden(routingLog[0].ts)})` : ''}`
          : 'No turns measured yet — say something to AXE and this fills in.'}
      </p>

      <div className="space-y-2 pt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <SectieKop
          titel="Services"
          uitleg="What the routes can reach. A service being up does not mean a route is being used."
        />
        {DIENSTEN.map((d) => (
          <DienstRegel key={d.sleutel} dienst={d} dienstStand={diensten.find((s) => s.service === d.sleutel)} />
        ))}
        {repoFout ? (
          <p className="text-[10px]" style={{ color: 'var(--warning)' }}>{repoFout}</p>
        ) : repos && Object.keys(repos).length > 0 ? (
          Object.entries(repos).map(([naam, info]) => <RepoRegel key={naam} naam={naam} info={info} />)
        ) : (
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            No whitelisted repos configured (CLAUDE_CODE_REPOS).
          </p>
        )}
      </div>
    </div>
  );
}
