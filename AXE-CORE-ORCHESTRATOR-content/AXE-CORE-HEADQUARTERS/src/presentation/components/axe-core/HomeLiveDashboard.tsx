import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Kaart } from '@/presentation/components/layout/tabMaatstaf';
import { GoedkeuringActie } from '@/presentation/components/axe-core/GoedkeuringActie';
import { homeLiveStand, seatsRegels, type LiveRegel, type LiveTaak } from '@/domain/homeLive';
import { taakActieLabel, taakFoutVan, type TaakActie } from '@/domain/taken/taakFout';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { codingSeatsHeartbeat, fixDurableTask, retryDurableTask } from '@/infrastructure/gateways/axeCoreApiService';
import { beslisAgentOk } from '@/application/approvals/beslisAgentOk';
import { groepeerAbonnementen, stoelSleutel, type CodingSeat } from '@/domain/codingSeats';
import { haalWachtOpJou } from '@/application/approvals/wachtOpJou';
import './homeLive.css';

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
  actie?: TaakActie;
  taskId?: string;
}) {
  const nav = useNavigate();
  const [fout, setFout] = useState<string | null>(null);
  if (!actie) return null;
  if (fout) {
    return <span className="axe-home-live-actie" style={{ color: 'var(--err)' }}>{fout}</span>;
  }
  return (
    <button
      type="button"
      className="axe-home-live-actie"
      onClick={() => {
        if (actie === 'reconnect') nav('/settings');
        else if (actie === 'open') nav('/tasks');
        else if (actie === 'fix' && taskId) {
          void fixDurableTask(taskId).then(verversServerAgents).catch((e) => {
            const tekst = e instanceof Error ? e.message : String(e);
            setFout(`Could not start a lint repair: ${tekst}`);
          });
        } else if (actie === 'retry' && taskId) void retryDurableTask(taskId).then(verversServerAgents);
        else nav('/tasks');
      }}
    >
      {taakActieLabel(actie)}
    </button>
  );
}

function LiveLijst<T>({ items, render, leeg }: {
  items: T[];
  render: (item: T) => ReactNode;
  leeg: ReactNode;
}) {
  return <>{items.length ? items.map(render) : leeg}</>;
}

function recentRegel(t: LiveTaak): { tekst: string; actie?: TaakActie } {
  if (t.stand !== 'failed') return { tekst: `${t.voortgang} ${t.agent} · ${t.titel}` };
  const fout = taakFoutVan(t.fout || t.titel, t.titel);
  return { tekst: `${t.voortgang} ${t.agent} · ${t.titel} — ${fout.regel}`, actie: fout.actie };
}

export function HomeLiveDashboard() {
  const navigate = useNavigate();
  const server = useServerAgents();
  const jobs = useAxeJobStore((s) => s.jobs);
  const [stoelen, setStoelen] = useState<CodingSeat[]>([]);
  /* 17 nov, UI-ronde: "No pending approvals." terwijl er 48 wachtten -- deze
     kaart kende alleen AXE's eigen vragen. Nu ook wat elders wacht (NorthSea),
     met de knop naar "Wacht op jou". Eén keer per minuut ververst. */
  const [elders, setElders] = useState(0);
  useEffect(() => {
    let levend = true;
    const tel = () => {
      if (document.hidden) return;
      void haalWachtOpJou().then((r) => { if (levend) setElders(r.items.filter((i) => i.bron !== 'axe').length); });
    };
    const eerste = setTimeout(tel, 0);
    const t = window.setInterval(tel, 60_000);
    return () => { levend = false; clearTimeout(eerste); window.clearInterval(t); };
  }, []);

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

  const seats = seatsRegels(stand);

  const kaartLopend = (
    <div className="axe-home-live-kaart-vak" data-axe-home-kaart="lopend">
      <Kaart className="axe-home-live-kaart" titel="WORKING NOW">
        <LiveLijst
          items={stand.lopend}
          leeg={<Regel kleur="var(--text-muted)">No running tasks or missions right now.</Regel>}
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
        <LiveLijst
          items={stand.recent}
          leeg={<Regel kleur="var(--text-muted)">No recent completed or failed tasks in this feed.</Regel>}
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
        {stand.goedkeuringen.length === 0 && !elders && (
          <Regel kleur="var(--text-muted)">Niets wacht op jou.</Regel>
        )}
        {elders > 0 && (
          <button type="button" className="axe-home-live-actie" data-axe-home-wacht
            style={{ color: 'rgb(251,146,60)', textAlign: 'left' }} onClick={() => navigate('/wacht')}>
            {elders} NorthSea-{elders === 1 ? 'ding wacht' : 'dingen wachten'} · open Wacht op jou
          </button>
        )}
        <GoedkeuringActie
          rijen={stand.goedkeuringen}
          onVraag={(rij) => { if (rij.agentId) navigate(`/managers?open=${encodeURIComponent(rij.agentId)}`); }}
          onBeslis={(rij, akkoord) => { void beslisAgentOk({ akkoord, rij }).then(verversServerAgents); }}
        />
      </Kaart>
    </div>
  );

  const kaartSeats = (
    <div className="axe-home-live-kaart-vak" data-axe-home-seats data-axe-home-kaart="seats">
      <Kaart className="axe-home-live-kaart" titel="SEATS · DAX · CRON">
        <LiveLijst
          items={seats}
          leeg={<Regel kleur="var(--text-muted)">No seat, DAX or schedule heartbeat yet.</Regel>}
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
    <div className="axe-home-live" data-axe-home-live>
      <div className="axe-home-live-cluster" data-axe-home-live-cluster="links">
        {kaartLopend}
        {kaartRecent}
      </div>
      <div className="axe-home-live-midden" aria-hidden="true" />
      <div className="axe-home-live-cluster" data-axe-home-live-cluster="rechts">
        {kaartOk}
        {kaartSeats}
      </div>


    </div>
  );
}
