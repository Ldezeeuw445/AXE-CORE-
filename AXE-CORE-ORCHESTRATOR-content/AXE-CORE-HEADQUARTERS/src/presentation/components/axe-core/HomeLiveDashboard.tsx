import { useEffect, useState, type ReactNode } from 'react';
import { kiesTab, type HomeTab } from '@/domain/homeLiveTabs';
import { useNavigate } from 'react-router';
import { GoedkeuringActie } from '@/presentation/components/axe-core/GoedkeuringActie';
import { homeLiveStand, seatsRegels, type LiveRegel, type LiveTaak } from '@/domain/homeLive';
import { taakActieLabel, taakFoutVan, type TaakActie } from '@/domain/taken/taakFout';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { codingSeatsHeartbeat, fixDurableTask, retryDurableTask } from '@/infrastructure/gateways/axeCoreApiService';
import { beslisAgentOk } from '@/application/approvals/beslisAgentOk';
import { groepeerAbonnementen, stoelSleutel, type CodingSeat } from '@/domain/codingSeats';
import { haalWachtOpJou } from '@/application/approvals/wachtOpJou';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { AxeGezicht } from './AxeGezicht';
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

/**
 * Eén kaart per kant met twee tabs (22 nov, Luka: "die 2 onderste blokken worden
 * gewoon 1 card per kant met bovenaan 2 tabs, zodat ze allebei een groter vak
 * hebben"). De keuze blijft per Mac bewaard; zonder keuze wint wat er speelt.
 */
function TabKaart({ kant, tabs, standaard }: {
  kant: 'links' | 'rechts';
  tabs: Array<{ id: HomeTab; titel: string; aantal?: number; lijf: ReactNode; aandacht?: boolean }>;
  standaard: HomeTab;
}) {
  const sleutel = `axe.home.tab.${kant}`;
  const [gekozen, setGekozen] = useState<HomeTab | null>(() => {
    try { return (localStorage.getItem(sleutel) as HomeTab) || null; } catch { return null; }
  });
  const actief = kiesTab(tabs.map((t) => t.id), gekozen, standaard);
  const kies = (id: HomeTab) => {
    setGekozen(id);
    try { localStorage.setItem(sleutel, id); } catch { /* geen opslag */ }
  };
  const huidig = tabs.find((t) => t.id === actief) ?? tabs[0];
  return (
    <div className="axe-home-live-kaart-vak axe-home-tabkaart" data-axe-home-kaart={kant}>
      <div className="axe-kaart axe-home-live-kaart">
        <div className="axe-home-tabs" role="tablist" aria-label={kant === 'links' ? 'Activity' : 'Attention'}>
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === actief}
              className={`axe-home-tab${t.id === actief ? ' is-actief' : ''}${t.aandacht ? ' is-aandacht' : ''}`}
              onClick={() => kies(t.id)}>
              {t.titel}
              {t.aantal ? <span className="axe-home-tab-tal">{t.aantal}</span> : null}
            </button>
          ))}
        </div>
        <div className="axe-kaart-lijf axe-home-tab-lijf" role="tabpanel">{huidig.lijf}</div>
      </div>
    </div>
  );
}

/** Kerncijfer-tegel boven de orb (referentiemap: KPI-tegels). */
function Kpi({ label, waarde, sub, toon, onClick }: {
  label: string;
  waarde: ReactNode;
  sub: string;
  toon?: 'let-op' | 'goed' | 'fout';
  onClick?: () => void;
}) {
  return (
    <button type="button" className={`axe-home-kpi${toon ? ` is-${toon}` : ''}`} onClick={onClick} data-axe-home-kpi={label}>
      <span className="axe-home-kpi-label">{label}</span>
      <span className="axe-home-kpi-waarde">{waarde}</span>
      <span className="axe-home-kpi-sub">{sub}</span>
    </button>
  );
}

/** Hoeveel taken vandaag klaar en mislukt zijn, elke 2 minuten opnieuw geteld. */
function useVandaag(): { klaar: number | null; mislukt: number | null } {
  const [tel, setTel] = useState<{ klaar: number | null; mislukt: number | null }>({ klaar: null, mislukt: null });
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let levend = true;
    const laad = async () => {
      if (document.hidden) return;
      const middernacht = new Date();
      middernacht.setHours(0, 0, 0, 0);
      const sinds = middernacht.toISOString();
      const [k, m] = await Promise.all([
        sb.from('core_tasks').select('id', { count: 'exact', head: true }).in('status', ['done', 'completed']).gte('updated_at', sinds),
        sb.from('core_tasks').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('updated_at', sinds),
      ]);
      if (levend) setTel({ klaar: k.count ?? null, mislukt: m.count ?? null });
    };
    void laad();
    const t = window.setInterval(() => void laad(), 120_000);
    return () => { levend = false; window.clearInterval(t); };
  }, []);
  return tel;
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
  const vandaag = useVandaag();

  const lijfLopend = (
    <>
        <LiveLijst
          items={stand.lopend}
          leeg={<Regel kleur="var(--text-muted)">No running tasks or missions right now.</Regel>}
          render={(t) => (
            <div key={t.id} className="axe-home-feed-rij">
              <AxeGezicht kleur={t.kleur} stemming="werkt" size={16} label={t.agent} />
              <div className="axe-home-feed-tekst">
                <span className="axe-home-feed-kop">
                  <b style={{ color: t.kleur }}>{t.agent}</b>
                  {t.voortgang ? <span className="axe-home-feed-tijd">{t.voortgang}</span> : null}
                </span>
                <span className="axe-home-feed-sub">{t.titel.replace(/^Work on:\s*/i, '')}</span>
              </div>
            </div>
          )}
        />
    </>
  );

  const lijfRecent = (
    <>
        <LiveLijst
          items={stand.recent}
          leeg={<Regel kleur="var(--text-muted)">No recent completed or failed tasks in this feed.</Regel>}
          render={(t) => {
            const r = recentRegel(t);
            const mis = t.stand === 'failed';
            return (
              <div key={t.id} className="axe-home-feed-rij">
                <AxeGezicht kleur={t.kleur} stemming={mis ? 'fout' : 'klaar'} size={16} label={t.agent} />
                <div className="axe-home-feed-tekst">
                  <span className="axe-home-feed-kop">
                    <b style={{ color: t.kleur }}>{t.agent}</b>
                    <span className={`axe-home-feed-pil ${mis ? 'is-fout' : 'is-ok'}`} data-axe-home-feed={mis ? 'fail' : 'ok'}>
                      {mis ? 'Failed' : 'Done'}
                    </span>
                  </span>
                  <span className="axe-home-feed-sub" title={r.tekst}>{mis ? r.tekst.split(' · ').slice(1).join(' · ') : t.titel}</span>
                  <Actie actie={r.actie} taskId={t.taskId} />
                </div>
              </div>
            );
          }}
        />
    </>
  );

  const lijfOk = (
    <div data-axe-home-ok>
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
    </div>
  );

  const lijfSeats = (
    <div data-axe-home-seats>
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
    </div>
  );

  const okTal = stand.goedkeuringen.length + elders;
  const seatsSlecht = seats.filter((r) => r.kleur === 'var(--err)').length;
  const stoelenKlaar = stoelen.filter((s) => s.logged_in === true && !s.rate_limited).length;
  const stoelenVol = stoelen.filter((s) => s.rate_limited).length;

  return (
    <>
    <div className="axe-home-kpis" data-axe-home-kpis>
      <Kpi label="Waiting on you" waarde={okTal} toon={okTal ? 'let-op' : undefined}
        sub={okTal ? `${stand.goedkeuringen.length} AXE · ${elders} NorthSea` : 'Nothing to approve'}
        onClick={() => navigate('/wacht')} />
      <Kpi label="Working now" waarde={stand.werkend}
        sub={stand.namen.length ? stand.namen.slice(0, 3).join(', ') : 'Agents on standby'}
        onClick={() => navigate('/managers')} />
      <Kpi label="Done today" waarde={vandaag.klaar ?? '–'} toon={vandaag.mislukt ? undefined : 'goed'}
        sub={vandaag.mislukt == null ? 'Counting…' : `${vandaag.mislukt} failed today`}
        onClick={() => navigate('/tasks')} />
      <Kpi label="Model seats" waarde={stoelen.length ? `${stoelenKlaar}/${stoelen.length}` : '–'}
        toon={stoelen.length && !stoelenKlaar ? 'fout' : undefined}
        sub={stoelenVol ? `${stoelenVol} at their limit` : stoelen.length ? 'Ready to code' : 'No heartbeat yet'}
        onClick={() => navigate('/settings')} />
    </div>
    <div className="axe-home-live" data-axe-home-live>
      <div className="axe-home-live-cluster" data-axe-home-live-cluster="links">
        <TabKaart kant="links" standaard="lopend" tabs={[
          { id: 'lopend', titel: 'Working now', aantal: stand.lopend.length, lijf: lijfLopend },
          { id: 'recent', titel: 'Recent', aantal: stand.recent.length, lijf: lijfRecent,
            aandacht: stand.recent.some((t) => t.stand === 'failed') },
        ]} />
      </div>
      <div className="axe-home-live-midden" aria-hidden="true" />
      <div className="axe-home-live-cluster" data-axe-home-live-cluster="rechts">
        <TabKaart kant="rechts" standaard={okTal ? 'ok' : 'seats'} tabs={[
          { id: 'ok', titel: 'Needs your OK', aantal: okTal, lijf: lijfOk, aandacht: okTal > 0 },
          { id: 'seats', titel: 'Seats · DAX · Cron', aantal: seatsSlecht, lijf: lijfSeats, aandacht: seatsSlecht > 0 },
        ]} />
      </div>
    </div>
    </>
  );
}
