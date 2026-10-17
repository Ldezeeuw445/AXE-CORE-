/**
 * Living 24/7 strip around the core. Two small cards left of the composer,
 * two right — wrap, no ellipsis, no inner scroll. Extra rows behind "and N more".
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Kaart } from '@/presentation/components/layout/tabMaatstaf';
import { GoedkeuringActie } from '@/presentation/components/axe-core/GoedkeuringActie';
import { homeLiveStand, LIVE_KAART_REGELS, seatsRegels, type LiveRegel, type LiveTaak } from '@/domain/homeLive';
import { taakActieLabel, taakFoutVan } from '@/domain/taken/taakFout';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { codingSeatsHeartbeat, retryDurableTask } from '@/infrastructure/gateways/axeCoreApiService';
import { beslisAgentOk } from '@/application/approvals/beslisAgentOk';
import { groepeerAbonnementen, stoelSleutel, type CodingSeat } from '@/domain/codingSeats';
import './homeLive.css';

type LijstSleutel = 'lopend' | 'recent' | 'ok' | 'seats' | null;

function Meer({ n, onOpen }: { n: number; onOpen: () => void }) {
  if (n <= 0) return null;
  return (
    <button type="button" className="axe-home-live-meer" data-axe-home-meer onClick={onOpen}>
      {`and ${n} more`}
    </button>
  );
}

function Regel({ kleur, children }: { kleur?: string; children: ReactNode }) {
  return (
    <p className="axe-home-live-regel" style={{ color: kleur || 'var(--text-primary)' }}>
      {children}
    </p>
  );
}

function Actie({
  actie,
  taskId,
}: {
  actie?: 'retry' | 'open' | 'reconnect';
  taskId?: string;
}) {
  const nav = useNavigate();
  if (!actie) return null;
  return (
    <button
      type="button"
      className="axe-home-live-actie"
      onClick={() => {
        if (actie === 'reconnect') nav('/settings');
        else if (actie === 'open') nav('/tasks');
        else if (taskId) void retryDurableTask(taskId).then(verversServerAgents);
        else nav('/tasks');
      }}
    >
      {taakActieLabel(actie)}
    </button>
  );
}

/** Zoveel items als in de kaart passen, tot LIVE_KAART_REGELS; de rest achter 'and N more'. */
function FitLijst<T>({
  items,
  render,
  leeg,
  onMeer,
}: {
  items: T[];
  render: (item: T) => ReactNode;
  leeg: ReactNode;
  onMeer: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const aantal = items.length;
  const [zicht, setZicht] = useState(() => Math.min(LIVE_KAART_REGELS, aantal));
  useLayoutEffect(() => {
    setZicht(Math.min(LIVE_KAART_REGELS, aantal));
  }, [aantal]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 1 && zicht > 0) {
      setZicht((n) => Math.max(0, n - 1));
    }
  }, [zicht, aantal]);
  if (items.length === 0) return <>{leeg}</>;
  return (
    <div ref={ref} className="axe-home-live-fit">
      {items.slice(0, zicht).map(render)}
      <Meer n={items.length - zicht} onOpen={onMeer} />
    </div>
  );
}

function recentRegel(t: LiveTaak): { tekst: string; actie?: 'retry' | 'open' | 'reconnect' } {
  if (t.stand !== 'failed') return { tekst: `${t.voortgang} ${t.agent} · ${t.titel}` };
  const fout = taakFoutVan(t.fout || t.titel, t.titel);
  return { tekst: `${t.voortgang} ${t.agent} · ${t.titel} — ${fout.regel}`, actie: fout.actie };
}

export function HomeLiveDashboard() {
  const server = useServerAgents();
  const jobs = useAxeJobStore((s) => s.jobs);
  const [stoelen, setStoelen] = useState<CodingSeat[]>([]);
  const [lijst, setLijst] = useState<LijstSleutel>(null);

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

  const okZicht = stand.goedkeuringen.slice(0, 1);
  const seats = seatsRegels(stand);

  const kaartLopend = (
    <div className="axe-home-live-kaart-vak" data-axe-home-kaart="lopend">
      <Kaart className="axe-home-live-kaart" titel="WORKING NOW">
        <FitLijst
          items={stand.lopend}
          leeg={<Regel kleur="var(--text-muted)">No running tasks or missions right now.</Regel>}
          onMeer={() => setLijst('lopend')}
          render={(t) => (
            <Regel key={t.id}>
              <span style={{ color: t.kleur }}>{t.agent}</span>
              {' · '}
              {t.titel}
              {t.voortgang ? <span style={{ color: 'var(--text-muted)' }}> · {t.voortgang}</span> : null}
            </Regel>
          )}
        />
      </Kaart>
    </div>
  );

  const kaartRecent = (
    <div className="axe-home-live-kaart-vak" data-axe-home-kaart="recent">
      <Kaart className="axe-home-live-kaart" titel="RECENT">
        <FitLijst
          items={stand.recent}
          leeg={<Regel kleur="var(--text-muted)">No recent completed or failed tasks in this feed.</Regel>}
          onMeer={() => setLijst('recent')}
          render={(t) => {
            const r = recentRegel(t);
            return (
              <Regel key={t.id} kleur={t.kleur}>
                <span data-axe-home-feed={t.stand === 'failed' ? 'fail' : 'ok'}>{r.tekst}</span>
                <Actie actie={r.actie} taskId={t.taskId} />
              </Regel>
            );
          }}
        />
      </Kaart>
    </div>
  );

  const kaartOk = (
    <div className="axe-home-live-kaart-vak" data-axe-home-ok data-axe-home-kaart="ok">
      <Kaart className="axe-home-live-kaart" titel="NEEDS YOUR OK">
        {stand.goedkeuringen.length === 0 && (
          <Regel kleur="var(--text-muted)">No pending approvals.</Regel>
        )}
        <GoedkeuringActie
          rijen={okZicht}
          compact
          onBeslis={(rij, akkoord) => { void beslisAgentOk({ akkoord, rij }).then(verversServerAgents); }}
        />
        <Meer n={Math.max(0, stand.goedkeuringen.length - okZicht.length)} onOpen={() => setLijst('ok')} />
      </Kaart>
    </div>
  );

  const kaartSeats = (
    <div className="axe-home-live-kaart-vak" data-axe-home-seats data-axe-home-kaart="seats">
      <Kaart className="axe-home-live-kaart" titel="SEATS · DAX · CRON">
        <FitLijst
          items={seats}
          leeg={<Regel kleur="var(--text-muted)">No seat, DAX or schedule heartbeat yet.</Regel>}
          onMeer={() => setLijst('seats')}
          render={(s: LiveRegel) => (
            <Regel key={s.id} kleur={s.kleur}>
              {s.tekst}
              <Actie actie={s.actie} />
            </Regel>
          )}
        />
      </Kaart>
    </div>
  );

  return (
    <div className="pointer-events-auto axe-home-live" data-axe-home-live>
      <div className="axe-home-live-cluster" data-axe-home-live-cluster="links">
        {kaartLopend}
        {kaartRecent}
      </div>
      <div className="axe-home-live-midden" aria-hidden="true" />
      <div className="axe-home-live-cluster" data-axe-home-live-cluster="rechts">
        {kaartOk}
        {kaartSeats}
      </div>

      {lijst && (
        <div className="axe-home-live-lijst" data-axe-home-lijst={lijst} role="dialog" aria-label="Full live list">
          <div className="axe-home-live-lijst-kop">
            <span>
              {lijst === 'lopend' ? 'WORKING NOW' : lijst === 'recent' ? 'RECENT' : lijst === 'ok' ? 'NEEDS YOUR OK' : 'SEATS · DAX · CRON'}
            </span>
            <button type="button" className="axe-home-live-meer" onClick={() => setLijst(null)}>Close</button>
          </div>
          {lijst === 'lopend' && stand.lopend.map((t) => (
            <Regel key={t.id}><span style={{ color: t.kleur }}>{t.agent}</span> · {t.titel}</Regel>
          ))}
          {lijst === 'recent' && stand.recent.map((t) => {
            const r = recentRegel(t);
            return (
              <Regel key={t.id} kleur={t.kleur}>
                {r.tekst}
                <Actie actie={r.actie} taskId={t.taskId} />
              </Regel>
            );
          })}
          {lijst === 'ok' && (
            <GoedkeuringActie
              rijen={stand.goedkeuringen}
              onBeslis={(rij, akkoord) => { void beslisAgentOk({ akkoord, rij }).then(verversServerAgents); }}
            />
          )}
          {lijst === 'seats' && seatsRegels(stand).map((s) => (
            <Regel key={s.id} kleur={s.kleur}>
              {s.tekst}
              <Actie actie={s.actie} />
            </Regel>
          ))}
        </div>
      )}
    </div>
  );
}
