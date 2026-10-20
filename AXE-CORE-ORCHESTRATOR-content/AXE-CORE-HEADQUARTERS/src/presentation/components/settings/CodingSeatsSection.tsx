/**
 * Settings → Subscriptions: één kaart per codeer-stoel.
 *
 * Status uit core_coding_seats (vers < 5 min). Stale last-run "Login expired"
 * overschrijft een verse logged_in=true nooit — die fout is geschiedenis.
 * Ontbrekende dirs (codex3 / ~/.codex-derde) blijven weg. Eén kaart per
 * account-e-mail+provider; machines waar hij écht inlogt staan erbij.
 * Default ~/.claude uitgelogd is een kleine 'not used'-kaart.
 */
import { useEffect, useState } from 'react';
import { SectieKop, StatusKaart, geleden, kort } from '@/presentation/components/settings/StatusKaart';
import {
  abonnementKaartStand,
  groepeerAbonnementen,
  metGedeeldeQuota,
  resetTekst,
  stoelHeeftActie,
  stoelNietGebruikt,
  stoelSleutel,
  toonStoelEmail,
  type AbonnementGroep,
  type CodingSeat,
} from '@/domain/codingSeats';
import { MOTOR_LABEL, HOOFD_AGENTS, AGENT_LABEL } from '@/domain/agentMotoren';
import { leesToewijzing } from '@/infrastructure/persistence/agentMotorenOpslag';
import { motorNaam } from '@/domain/motorNaam';
import { abonnementVerbruik, codingSeatsHeartbeat, claudeRepos, plannerStatus, type AgentSubscriptionUsage, type PlannerStatus } from '@/infrastructure/gateways/axeCoreApiService';
import {
  resetTekst as vensterReset,
  verbruikBalken,
  type AbonnementVerbruik,
} from '@/domain/abonnementVerbruik';

interface WorkerSeatRow {
  seat_id?: string;
  id?: string;
  provider?: string;
  machine?: string;
  host?: string;
  email?: string | null;
  logged_in?: boolean | null;
  login_command?: string;
  current_task?: string | null;
  rate_limited?: boolean;
  rate_limit_until?: string | null;
  last_limit_message?: string | null;
  remaining_note?: string | null;
  last_seen_at?: string;
  config_exists?: boolean;
}

function totMs(waarde: number | string | null | undefined): number | null {
  if (waarde == null || waarde === '') return null;
  if (typeof waarde === 'number') return waarde < 1e12 ? waarde * 1000 : waarde;
  const n = Date.parse(waarde);
  return Number.isNaN(n) ? null : n;
}

function vanWorker(row: WorkerSeatRow): CodingSeat {
  const loggedIn = typeof row.logged_in === 'boolean' ? row.logged_in : null;
  const sid = stoelSleutel({ id: row.id, seat_id: row.seat_id });
  return {
    id: sid,
    seat_id: sid,
    provider: (row.provider as CodingSeat['provider']) || 'claude',
    label: sid,
    email: loggedIn === true ? (row.email ?? null) : null,
    machine: row.machine || row.host || 'unknown',
    logged_in: loggedIn,
    login_command: row.login_command || '',
    current_task: row.current_task ?? null,
    rate_limited: Boolean(row.rate_limited),
    rate_limit_until: totMs(row.rate_limit_until),
    last_limit_message: row.last_limit_message ?? null,
    remaining_note: row.remaining_note || 'CLI does not expose remaining quota.',
    shared_quota_with: [],
    last_seen_at: row.last_seen_at ?? null,
    config_exists: row.config_exists,
  };
}

const ACCENT: Record<string, string> = {
  claude: '#f59e0b',
  codex: '#34d399',
  cursor: '#60a5fa',
  openhands: '#fb923c',
};

export function CodingSeatsSection() {
  const [stoelen, setStoelen] = useState<CodingSeat[] | null>(null);
  const [heartbeatOk, setHeartbeatOk] = useState(false);
  const [verbruik, setVerbruik] = useState<Record<string, AbonnementVerbruik>>({});
  const [gebruik, setGebruik] = useState<Record<string, AgentSubscriptionUsage>>({});
  const [planner, setPlanner] = useState<PlannerStatus | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const toewijzing = leesToewijzing();

  useEffect(() => {
    let alive = true;
    const laad = () => {
      void Promise.all([
        codingSeatsHeartbeat().then((hb) => ({ ok: true as const, hb })).catch(() => ({ ok: false as const, hb: { seats: [] as WorkerSeatRow[] } })),
        abonnementVerbruik().catch(() => ({ accounts: [] as AbonnementVerbruik[] })),
        claudeRepos().catch(() => ({ usage: {} as Record<string, AgentSubscriptionUsage> })),
        plannerStatus().catch(() => null),
      ]).then(([hb, gebruikR, repos, plan]) => {
        if (!alive) return;
        setHeartbeatOk(hb.ok);
        const rijen = Array.isArray(hb.hb.seats) ? hb.hb.seats.map((s) => vanWorker(s as WorkerSeatRow)) : [];
        setStoelen(metGedeeldeQuota(rijen.filter((s) => s.id)));
        setVerbruik(Object.fromEntries((gebruikR.accounts ?? []).map((a) => [a.motor, a])));
        setGebruik(repos.usage ?? {});
        setPlanner(plan);
        setFout(hb.ok ? null : 'No fresh coding-seat heartbeat from the Mac mini.');
      }).catch((e: unknown) => {
        if (alive) setFout(e instanceof Error ? e.message : String(e));
      });
    };
    laad();
    const timer = window.setInterval(laad, 30_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const groepen = groepeerAbonnementen(stoelen ?? []);
  const delen = (stoelen ?? []).filter((s) => s.shared_quota_with.length > 0 && s.logged_in === true);
  const zelfdeMail = delen[0]?.email ?? null;
  const gebruiktDoor = (ids: string[]) => HOOFD_AGENTS.filter((a) => ids.includes(toewijzing[a])).map((a) => AGENT_LABEL[a]);

  const kaartVoor = (groep: AbonnementGroep) => {
    const stoel = groep.stoel;
    const v = groep.seatIds.map((id) => verbruik[id]).find(Boolean);
    const g = groep.seatIds.map((id) => gebruik[id]).find(Boolean);
    const tokens = g ? g.input_tokens_7d + g.output_tokens_7d : 0;
    const vandaag = groep.seatIds.reduce((n, id) => n + (planner?.gebruik_vandaag[id] ?? 0), 0);
    const door = gebruiktDoor(groep.seatIds);
    const getoond: CodingSeat = {
      ...stoel,
      email: toonStoelEmail(stoel),
      rate_limited: stoel.rate_limited || Boolean(v?.limiet_bereikt),
    };
    const kaart = abonnementKaartStand({
      stoel: getoond,
      heartbeatOk,
      verbruikStatus: v?.status,
      lastRunFout: v?.status === 'ok' || v?.status === 'idle' ? (g?.last_limit_message ?? null) : (v?.reden ?? g?.last_limit_message ?? null),
    });
    const rood = stoelHeeftActie(getoond) && !stoelNietGebruikt(getoond) && kaart.stand.tekst !== 'Online' && kaart.stand.tekst !== 'Running' && kaart.stand.tekst !== 'Not used';
    const reset = vensterReset(v?.sessie?.reset || v?.week?.reset) || resetTekst(getoond);
    const label = MOTOR_LABEL[stoel.id as keyof typeof MOTOR_LABEL] || stoel.label;
    const machines = groep.bruikbaarOp.length
      ? `Usable on ${groep.bruikbaarOp.join(', ')}`
      : 'Not logged in on any machine';
    return (
      <StatusKaart
        key={groep.key}
        klein={groep.nietGebruikt}
        naam={motorNaam(label, {
          account: groep.email,
          ingelogd: stoel.logged_in,
          nietGebruikt: groep.nietGebruikt,
        })}
        accent={ACCENT[groep.provider] || 'var(--text-secondary)'}
        rol={`${v?.plan ? `${v.plan} plan · ` : ''}${machines}${door.length ? ` · ${door.join(', ')}` : ''}`}
        stand={stoelen == null ? { toon: 'muted', tekst: 'Checking' } : (groep.nietGebruikt ? { toon: 'muted', tekst: 'Not used' } : kaart.stand)}
        keuze={rood ? (
          <code
            title={stoel.login_command}
            style={{ display: 'block', fontSize: 10, color: 'var(--error)', overflow: 'auto', whiteSpace: 'nowrap' }}
          >{stoel.login_command}</code>
        ) : undefined}
        stats={[
          { label: 'Runs 24h', waarde: g ? String(g.runs_24h) : '—' },
          { label: 'Runs 7d', waarde: g ? String(g.runs_7d) : '—' },
          { label: 'Tokens 7d', waarde: tokens ? kort(tokens) : '—' },
          { label: 'Last run', waarde: g?.last_run_at ? geleden(g.last_run_at * 1000) : (reset || '—') },
        ]}
        balken={[
          ...verbruikBalken(v),
          ...(planner?.dagbudget ? [{ label: 'Planner today', waarde: `${vandaag}/${planner.dagbudget}`, pct: (vandaag / planner.dagbudget) * 100 }] : []),
          ...(g && g.ok_7d + g.failed_7d > 0 ? [{ label: 'Success 7d', waarde: `${g.ok_7d}/${g.ok_7d + g.failed_7d}`, pct: (g.ok_7d / (g.ok_7d + g.failed_7d)) * 100, goed: true }] : []),
        ]}
        melding={kaart.geschiedenis ?? undefined}
      />
    );
  };

  return (
    <div className="axe-motoren">
      <SectieKop
        titel="Subscriptions"
        uitleg="One card per account. Status from core_coding_seats (fresh < 5 min) on Mac mini and iMac. A null row on the other machine never overrides logged_in=true. Missing CLIs stay hidden."
      />
      {zelfdeMail && (
        <p className="axe-agentkaart-melding" style={{ color: 'var(--warning)', marginBottom: 12 }}>
          Several seats are {zelfdeMail} — they share one quota. Log the extra Claude/Codex seats into different accounts to get separate limits.
        </p>
      )}
      {fout && <p className="axe-agentkaart-melding">{fout}</p>}
      <div className="axe-agent-raster axe-agent-raster--ruim">
        {groepen.kaarten.map(kaartVoor)}
        {stoelen?.length === 0 && (
          <StatusKaart
            naam="No seats reported"
            accent="var(--text-muted)"
            rol="The Mac mini worker has not heartbeated seats yet."
            stand={{ toon: 'muted', tekst: 'Waiting' }}
            stats={[{ label: 'Last check', waarde: '—' }]}
          />
        )}
      </div>
      {groepen.ongebruikt.length > 0 && (
        <div className="axe-agent-raster" style={{ marginTop: 12, justifyContent: 'start' }}>
          {groepen.ongebruikt.map(kaartVoor)}
        </div>
      )}
    </div>
  );
}
