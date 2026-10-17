/**
 * Twee knoppen boven de composer: agents (live, één bron) en taken/meldingen.
 * Uitgeklapt is elke regel volledig leesbaar. Geen truncate.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { agentById } from '@/domain/agents/roster';
import { balkLabel, jobLoopt } from '@/domain/tierRouter/axeJobRegels';
import { regelVan } from '@/domain/tierRouter/agentVenster';
import { homeLiveStand, werkPulseTekst } from '@/domain/homeLive';
import { taakActieLabel, taakFoutVan } from '@/domain/taken/taakFout';
import { taakMeldingVan } from '@/domain/taken/taakMelding';
import { GoedkeuringActie } from '@/presentation/components/axe-core/GoedkeuringActie';
import { beslisAgentOk } from '@/application/approvals/beslisAgentOk';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { retryDurableTask } from '@/infrastructure/gateways/axeCoreApiService';
import { speakGlobal } from '@/infrastructure/gateways/globalTts';
import '@/presentation/components/axe-core/homeLive.css';

const STAND: Record<string, string> = {
  queued: 'queued',
  running: 'running',
  waiting: 'needs your OK',
  done: 'done',
  failed: 'failed',
};

type TaakRij = {
  id: string;
  title: string;
  status: string;
  error?: unknown;
  assignee?: string | null;
  capability?: string | null;
  updated_at?: string;
};

type Melding = {
  id: string;
  titel: string;
  regel: string;
  mislukt: boolean;
  actie: 'retry' | 'open' | 'reconnect';
};

function stip(aan: boolean, fout = false) {
  return {
    width: 6,
    height: 6,
    borderRadius: 999,
    flexShrink: 0,
    background: fout ? 'var(--err)' : aan ? 'var(--accent-cyan)' : 'var(--text-muted)',
  } as const;
}

export function AxeAgentsBalk() {
  const jobs = useAxeJobStore((s) => s.jobs);
  const server = useServerAgents();
  const nav = useNavigate();
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [takenOpen, setTakenOpen] = useState(false);
  const [meldingen, setMeldingen] = useState<Melding[]>([]);
  const bekend = useRef<Map<string, string> | null>(null);

  const stand = homeLiveStand({
    agents: server.agents,
    jobs,
    extraGoedkeuringen: server.approvals.map((a) => ({
      id: a.id, task_id: a.task_id, wat: a.wat, waarom: a.waarom, title: a.title, detail: a.detail,
    })),
  });
  const label = werkPulseTekst(stand.werkend, stand.goedkeuringen.length);
  const namen = stand.namen.length ? ` · ${stand.namen.join(', ')}` : '';
  const kop = `${label}${namen}`;
  // balkLabel blijft de gedeelde kop voor 0/1/N zonder OK-suffix (wiring + tests).
  void balkLabel(stand.werkend);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let levend = true;
    const laad = async () => {
      const sinds = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await sb
        .from('core_tasks')
        .select('id,title,status,error,assignee,capability,updated_at')
        .gte('updated_at', sinds)
        .order('updated_at', { ascending: false })
        .limit(30);
      if (!levend || !data) return;
      const rijen = data as TaakRij[];
      const vast = rijen.filter((r) => ['failed', 'blocked', 'cancelled', 'rejected'].includes(r.status));
      const lijst: Melding[] = vast.map((r) => {
        const f = taakFoutVan(r.error, r.title);
        return { id: r.id, titel: r.title, regel: f.regel, mislukt: true, actie: f.actie };
      });
      if (!bekend.current) {
        bekend.current = new Map(rijen.map((r) => [r.id, r.status]));
        setMeldingen(lijst);
        return;
      }
      for (const rij of rijen) {
        const vorige = bekend.current.get(rij.id);
        const m = taakMeldingVan(
          rij,
          vorige !== undefined ? { id: rij.id, title: rij.title, status: vorige } : null,
        );
        if (m && !m.stuurde && !m.mislukt) {
          lijst.unshift({
            id: rij.id,
            titel: rij.title,
            regel: m.tekst,
            mislukt: false,
            actie: 'open',
          });
        }
        bekend.current.set(rij.id, rij.status);
      }
      setMeldingen(lijst.slice(0, 12));
    };
    void laad();
    const iv = window.setInterval(() => void laad(), 20_000);
    return () => { levend = false; window.clearInterval(iv); };
  }, []);

  const misluktN = meldingen.filter((m) => m.mislukt).length;
  const takenKop = misluktN > 0
    ? `${misluktN} task${misluktN === 1 ? '' : 's'} need attention`
    : meldingen.length
      ? `${meldingen.length} task update${meldingen.length === 1 ? '' : 's'}`
      : 'No task updates';

  const doe = (m: Melding, soort: 'retry' | 'open' | 'reconnect' | 'dismiss' | 'speak') => {
    if (soort === 'dismiss') {
      setMeldingen((prev) => prev.filter((x) => x.id !== m.id));
      return;
    }
    if (soort === 'speak') {
      speakGlobal(`${m.titel}. ${m.regel}`);
      return;
    }
    if (soort === 'reconnect') nav('/settings');
    else if (soort === 'open') nav('/tasks');
    else void retryDurableTask(m.id).then(() => {
      setMeldingen((prev) => prev.filter((x) => x.id !== m.id));
      verversServerAgents();
    });
  };

  return (
    <div className="axe-home-pillen" data-axe-home-pillen>
      <div
        className="axe-home-pill"
        data-axe-home-pill="agents"
        style={{ background: 'var(--surface-bg, #0a0c0c)', border: '1px solid var(--tint-line)' }}
      >
        <button
          type="button"
          onClick={() => setAgentsOpen((v) => !v)}
          className="axe-home-pill-knop"
          title="Background agents"
          aria-expanded={agentsOpen}
          data-axe-agents-balk
        >
          <span style={stip(stand.werkend > 0 || stand.goedkeuringen.length > 0)} />
          <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{kop}</span>
        </button>
        {agentsOpen && (
          <ul className="axe-home-pill-lijst">
            {stand.lopend.map((t) => (
              <li key={`live-${t.id}`} className="axe-home-pill-rij">
                <span style={{ color: t.kleur }}>{t.agent}</span>
                {' · '}
                {t.titel}
                {t.voortgang ? ` · ${t.voortgang}` : ''}
              </li>
            ))}
            {jobs.map((j) => (
              <li key={j.id} className="axe-home-pill-rij">
                <div>
                  <span style={{ color: 'var(--text-primary)' }}>{j.title}</span>
                  {' · '}
                  <span style={{ color: 'var(--accent-cyan)' }}>{agentById(j.agent).name}</span>
                  {' · '}
                  <span style={{ color: 'var(--text-muted)' }}>{STAND[j.state] ?? j.state}</span>
                </div>
                {jobLoopt(j.state) && (
                  <div style={{ color: 'var(--text-muted)', opacity: 0.85 }}>{regelVan(j)}</div>
                )}
                {j.state === 'waiting' && (
                  <GoedkeuringActie
                    compact
                    rijen={[{
                      id: j.approvalId || j.id,
                      taskId: j.taskId || '',
                      wat: j.approvalVraag || j.title,
                      waarom: '',
                    }]}
                    onBeslis={(rij, akkoord) => {
                      void beslisAgentOk({
                        akkoord,
                        job: j,
                        rij: rij.taskId ? rij : null,
                        agent: server.agents[j.agent],
                      }).then((ok) => {
                        if (ok) useAxeJobStore.getState().patch(j.id, { state: akkoord ? 'running' : 'failed' });
                        verversServerAgents();
                      });
                    }}
                  />
                )}
              </li>
            ))}
            {server.approvals.map((a) => (
              <li key={`ok-${a.id}`} className="axe-home-pill-rij">
                <GoedkeuringActie
                  compact
                  rijen={[{ id: a.id, taskId: a.task_id, wat: a.wat || a.title, waarom: a.waarom || a.detail || '' }]}
                  onBeslis={(rij, akkoord) => {
                    void beslisAgentOk({ akkoord, rij }).then(verversServerAgents);
                  }}
                />
              </li>
            ))}
            {stand.lopend.length === 0 && jobs.length === 0 && server.approvals.length === 0 && (
              <li className="axe-home-pill-rij" style={{ color: 'var(--text-muted)' }}>No agents working right now.</li>
            )}
          </ul>
        )}
      </div>

      <div className="axe-home-pill" data-axe-home-pill="taken" data-axe-toast>
        <button
          type="button"
          onClick={() => setTakenOpen((v) => !v)}
          className="axe-home-pill-knop"
          title="Tasks and notifications"
          aria-expanded={takenOpen}
          data-axe-taken-balk
        >
          <span style={stip(misluktN > 0, misluktN > 0)} />
          <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{takenKop}</span>
        </button>
        {takenOpen && (
          <ul className="axe-home-pill-lijst">
            {meldingen.length === 0 && (
              <li className="axe-home-pill-rij" style={{ color: 'var(--text-muted)' }}>No failed or finished tasks in the last 24 hours.</li>
            )}
            {meldingen.map((m) => (
              <li key={m.id} className="axe-home-pill-rij">
                <div style={{ color: m.mislukt ? 'var(--err)' : 'var(--ok)' }}>
                  {m.mislukt ? 'Failed' : 'Done'} · {m.titel}
                </div>
                <div>{m.regel}</div>
                <div className="axe-home-pill-acties">
                  <button type="button" onClick={() => doe(m, m.actie)}>{taakActieLabel(m.actie)}</button>
                  <button type="button" onClick={() => doe(m, 'open')}>Open</button>
                  <button type="button" onClick={() => doe(m, 'speak')}>Speak</button>
                  <button type="button" onClick={() => doe(m, 'dismiss')}>Dismiss</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
