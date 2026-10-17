/**
 * Living 24/7 strip around the core. The orb stays; this sits in the plate
 * under it. Real data only — empty cards say so.
 */
import { useEffect, useState } from 'react';
import { Kaart, SectieBlok } from '@/presentation/components/layout/tabMaatstaf';
import { GoedkeuringActie } from '@/presentation/components/axe-core/GoedkeuringActie';
import { homeLiveStand, werkPulseTekst } from '@/domain/homeLive';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { codingSeatsHeartbeat } from '@/infrastructure/gateways/axeCoreApiService';
import { beslisAgentOk } from '@/application/approvals/beslisAgentOk';
import { groepeerAbonnementen, stoelSleutel, type CodingSeat } from '@/domain/codingSeats';
import './homeLive.css';

export function HomeLiveDashboard() {
  const server = useServerAgents();
  const jobs = useAxeJobStore((s) => s.jobs);
  const [stoelen, setStoelen] = useState<CodingSeat[]>([]);

  useEffect(() => {
    let alive = true;
    const laad = () => {
      void codingSeatsHeartbeat()
        .then((r) => {
          if (!alive) return;
          const rijen: CodingSeat[] = (r.seats ?? []).map((s) => {
            const sid = stoelSleutel(s);
            return {
              id: sid,
              seat_id: sid,
              provider: (s.provider as CodingSeat['provider']) || 'claude',
              label: s.label || sid,
              email: s.logged_in === true ? s.email : null,
              machine: s.machine || s.host || '',
              logged_in: s.logged_in,
              login_command: s.login_command,
              current_task: s.current_task,
              rate_limited: s.rate_limited,
              rate_limit_until: s.rate_limit_until,
              last_limit_message: s.last_limit_message,
              remaining_note: s.remaining_note,
              shared_quota_with: s.shared_quota_with ?? [],
              last_seen_at: s.last_seen_at,
              config_exists: s.config_exists,
            };
          });
          setStoelen(groepeerAbonnementen(rijen).kaarten.map((g) => g.stoel));
        })
        .catch(() => { if (alive) setStoelen([]); });
    };
    laad();
    const t = window.setInterval(laad, 30_000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const stand = homeLiveStand({
    agents: server.agents,
    jobs,
    extraGoedkeuringen: server.approvals.map((a) => ({
      id: a.id, task_id: a.task_id, wat: a.wat, waarom: a.waarom, title: a.title, detail: a.detail,
    })),
    stoelen,
  });

  return (
    <div className="pointer-events-auto axe-home-live" data-axe-home-live>
      <div className="axe-home-live-pulse" aria-live="polite">
        <span
          className="inline-block size-1.5 rounded-full"
          style={{
            background: stand.werkend ? 'var(--accent-cyan)' : 'rgba(255,255,255,.25)',
            boxShadow: stand.werkend ? '0 0 8px var(--accent-cyan)' : 'none',
          }}
        />
        {werkPulseTekst(stand.werkend)}
        {stand.namen.length ? ` · ${stand.namen.join(', ')}` : ''}
      </div>

      <div className="axe-kaart-raster axe-home-live-raster">
        <SectieBlok titel="WORKING NOW">
          <Kaart compact titel={`${stand.lopend.length || 'No'} running`}>
            {stand.lopend.length === 0 && (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No running tasks or missions right now.</p>
            )}
            {stand.lopend.map((t) => (
              <p key={t.id} className="text-[11px] leading-snug truncate" style={{ color: 'var(--text-primary)' }}>
                <span style={{ color: t.kleur }}>{t.agent}</span>
                {' · '}
                {t.titel}
                {t.voortgang ? <span style={{ color: 'var(--text-muted)' }}> · {t.voortgang}</span> : null}
              </p>
            ))}
          </Kaart>
        </SectieBlok>

        <SectieBlok titel="RECENT">
          <Kaart compact titel="Completed / failed">
            {stand.recent.length === 0 && (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No recent completed or failed tasks in this feed.</p>
            )}
            {stand.recent.map((t) => (
              <p key={t.id} className="text-[11px] leading-snug truncate" style={{ color: t.kleur }}>
                {t.voortgang} {t.agent} · {t.titel}
              </p>
            ))}
          </Kaart>
        </SectieBlok>

        <SectieBlok titel="NEEDS YOUR OK">
          <Kaart compact titel={stand.goedkeuringen.length ? `${stand.goedkeuringen.length} pending` : 'None pending'}>
            {stand.goedkeuringen.length === 0 && (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No pending approvals.</p>
            )}
            <GoedkeuringActie
              rijen={stand.goedkeuringen}
              onBeslis={(rij, akkoord) => { void beslisAgentOk({ akkoord, rij }).then(verversServerAgents); }}
            />
          </Kaart>
        </SectieBlok>

        <SectieBlok titel="SEATS · DAX · CRON">
          <Kaart compact titel="Coding seats">
            {stand.stoelen.length === 0 && (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No seat heartbeat yet.</p>
            )}
            {stand.stoelen.map((s) => (
              <p key={s.id} className="text-[11px] truncate" style={{ color: s.toon === 'ok' || s.toon === 'info' ? 'var(--ok)' : 'var(--text-muted)' }}>
                {s.id} · {s.stand}{s.taak && s.taak !== 'idle' ? ` · ${s.taak}` : ''}
              </p>
            ))}
          </Kaart>
          <Kaart compact titel="DAX computers">
            {stand.dax.length === 0 && (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No DAX heartbeat on these agents.</p>
            )}
            {stand.dax.map((d) => (
              <p key={d.agent} className="text-[11px] leading-snug" style={{ color: d.wakker ? 'var(--accent-cyan)' : 'var(--text-muted)' }} title={d.blokkade}>
                {d.agent} · {d.tekst}
              </p>
            ))}
          </Kaart>
          <Kaart compact titel="Schedules">
            {stand.roosters.length === 0 && (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No schedules reported.</p>
            )}
            {stand.roosters.map((r) => (
              <p key={`${r.agent}-${r.naam}`} className="text-[11px] truncate" style={{ color: r.fout ? 'var(--err)' : 'var(--text-secondary)' }}>
                {r.agent} · {r.naam} · last {r.laatste} · next {r.volgende}
              </p>
            ))}
          </Kaart>
        </SectieBlok>
      </div>
    </div>
  );
}
