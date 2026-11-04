/**
 * DAX bots overview — real heartbeats from /agents/activity (dax_wacht).
 * Reachable from Meer, BottomNav Meer sheet, and Home side cards.
 */
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import {
  daxOverzichtRijen,
  daxStandKleur,
  type DaxOverzichtRij,
} from '@/domain/agents/daxOverzicht';
import { ManagerAvatar } from '@/presentation/components/axe-core/ManagerAvatar';
import { agentById, type AxeAgentId } from '@/domain/agents/roster';

function Kaart({ rij, highlight }: { rij: DaxOverzichtRij; highlight: boolean }) {
  const navigate = useNavigate();
  const agent = agentById(rij.agentId as AxeAgentId);
  const kleur = daxStandKleur(rij.stand);

  return (
    <article
      className="axe-dax-kaart"
      data-axe-dax-computer={rij.computer}
      data-stand={rij.stand}
      data-always-on={rij.alwaysOn ? 'ja' : undefined}
      data-highlight={highlight ? 'ja' : undefined}
      style={{ ['--dax-accent' as string]: rij.accent }}
    >
      <header className="axe-dax-kaart-kop">
        <span className="axe-dax-kaart-av">
          {agent ? <ManagerAvatar agent={agent} size={36} /> : (
            <span className="axe-dax-kaart-av-fallback">{rij.naam.slice(0, 2)}</span>
          )}
        </span>
        <div className="axe-dax-kaart-titels">
          <h3>{rij.naam}</h3>
          <p>{rij.app}</p>
        </div>
        <div className="axe-dax-kaart-badges">
          {rij.alwaysOn && <span className="axe-dax-pill axe-dax-pill--on">24/7</span>}
          <span className="axe-dax-pill" style={{ color: kleur, borderColor: kleur }}>
            {rij.stand}
          </span>
        </div>
      </header>

      <dl className="axe-dax-kaart-grid">
        <div>
          <dt>Computer</dt>
          <dd><code>{rij.computer}</code></dd>
        </div>
        <div>
          <dt>Heartbeat</dt>
          <dd>{rij.heartbeatTekst}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd style={{ color: kleur }}>{rij.standTekst}</dd>
        </div>
        <div>
          <dt>Current task</dt>
          <dd>{rij.huidigeTaak}</dd>
        </div>
        <div>
          <dt>Next run</dt>
          <dd>{rij.volgendeRun}</dd>
        </div>
        {rij.blokkade ? (
          <div className="axe-dax-kaart-blok">
            <dt>Blocked</dt>
            <dd style={{ color: 'var(--err, #F87171)' }}>{rij.blokkade}</dd>
          </div>
        ) : null}
      </dl>

      {rij.laatsteActies.length > 0 && (
        <ul className="axe-dax-kaart-acties" aria-label="Last actions">
          {rij.laatsteActies.map((t, i) => (
            <li key={`${rij.computer}-a-${i}`}>{t}</li>
          ))}
        </ul>
      )}

      <footer className="axe-dax-kaart-voet">
        <button type="button" onClick={() => navigate(`/managers?open=${rij.agentId}`)}>
          Open manager chat
        </button>
        {(rij.agentId === 'northsea' || rij.agentId === 'trading' || rij.agentId === 'browser' || rij.agentId === 'developer') && (
          <button
            type="button"
            className="axe-dax-kaart-sec"
            onClick={() => navigate(
              rij.agentId === 'northsea' ? '/northsea'
                : rij.agentId === 'trading' ? '/trading'
                  : rij.agentId === 'browser' ? '/browser'
                    : '/code-editor',
            )}
          >
            Open app
          </button>
        )}
      </footer>
    </article>
  );
}

export default function DaxOverzicht() {
  const server = useServerAgents();
  const [params] = useSearchParams();
  const bot = params.get('bot');
  const rijen = useMemo(
    () => daxOverzichtRijen(server.agents),
    [server.agents, server.at],
  );
  const altijd = rijen.filter((r) => r.alwaysOn);
  const wakker = rijen.filter((r) => r.stand === 'running');

  return (
    <div className="axe-tabruimte axe-dax-overzicht h-full overflow-y-auto pt-4 pb-8" data-axe-dax-page>
      <header className="axe-dax-overzicht-kop mb-5">
        <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--accent-cyan)' }}>
          VPS computers
        </p>
        <h1 className="text-[22px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          DAX bots
        </h1>
        <p className="mt-1 text-[13px] max-w-2xl" style={{ color: 'var(--text-muted)' }}>
          Real heartbeats from <code>dax_wacht</code> (every 5 min). Bots marked 24/7 stay up via{' '}
          <code>always_on</code> — running means a fresh heartbeat, not just a DB status.
        </p>
        <div className="axe-dax-overzicht-stats mt-3 flex flex-wrap gap-2">
          <span className="axe-dax-stat">{rijen.length} computers</span>
          <span className="axe-dax-stat">{altijd.length} marked 24/7</span>
          <span className="axe-dax-stat" style={{ color: 'var(--ok, #34D399)' }}>
            {wakker.length} awake now
          </span>
          {!server.ok && (
            <span className="axe-dax-stat" style={{ color: 'var(--warning, #F59E0B)' }}>
              last poll failed — showing last known
            </span>
          )}
        </div>
      </header>

      {rijen.length === 0 ? (
        <div className="axe-dax-leeg rounded-2xl p-8" style={{ border: '1px solid rgba(255,255,255,.08)' }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            No DAX computers in the activity feed yet. When <code>dax_wacht</code> reports heartbeats,
            they show up here with status, task, and next run.
          </p>
        </div>
      ) : (
        <div className="axe-dax-grid">
          {rijen.map((rij) => (
            <Kaart
              key={rij.computer}
              rij={rij}
              highlight={bot === rij.agentId || bot === rij.computer}
            />
          ))}
        </div>
      )}
    </div>
  );
}
