/**
 * Settings → Accounts: één kaart per codeer-stoel.
 *
 * Live stand van /claude/repos (host die de CLI's draait) plus de heartbeat
 * van de Mac mini in core_coding_seats. Geen tokens, wel het exacte
 * login-commando als een stoel uitgelogd of gelimiteerd is.
 */
import { useEffect, useState } from 'react';
import { SectieKop, StatusKaart } from '@/presentation/components/settings/StatusKaart';
import {
  metGedeeldeQuota,
  resetTekst,
  stoelHeeftActie,
  stoelHeartbeatStand,
  stoelNietGebruikt,
  toonStoelEmail,
  verbergStoel,
  type CodingSeat,
} from '@/domain/codingSeats';
import { abonnementVerbruik, codingSeatsHeartbeat } from '@/infrastructure/gateways/axeCoreApiService';
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
  return {
    id: String(row.seat_id || ''),
    provider: (row.provider as CodingSeat['provider']) || 'claude',
    label: String(row.seat_id || ''),
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
  const [verbruik, setVerbruik] = useState<Record<string, AbonnementVerbruik>>({});
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const laad = () => {
      void Promise.all([
        codingSeatsHeartbeat().catch(() => ({ seats: [] as WorkerSeatRow[] })),
        abonnementVerbruik().catch(() => ({ accounts: [] as AbonnementVerbruik[] })),
      ]).then(([hb, gebruik]) => {
        if (!alive) return;
        const rijen = Array.isArray(hb.seats) ? hb.seats.map(s => vanWorker(s as WorkerSeatRow)) : [];
        setStoelen(metGedeeldeQuota(rijen.filter(s => s.id && !verbergStoel(s))));
        setVerbruik(Object.fromEntries((gebruik.accounts ?? []).map(a => [a.motor, a])));
        setFout(null);
      }).catch((e: unknown) => {
        if (alive) setFout(e instanceof Error ? e.message : String(e));
      });
    };
    laad();
    const timer = window.setInterval(laad, 30_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const delen = (stoelen ?? []).filter(s => s.shared_quota_with.length > 0);
  const zelfdeMail = delen[0]?.email ?? null;

  return (
    <div className="axe-motoren">
      <SectieKop
        titel="Coding seats"
        uitleg="Every paid Claude, Codex, Cursor and OpenHands login as one team. AXE picks the next free seat and falls through on login or rate-limit errors."
      />
      {zelfdeMail && (
        <p className="axe-agentkaart-melding" style={{ color: 'var(--warning)', marginBottom: 12 }}>
          Several seats are {zelfdeMail} — they share one quota. Log the extra Claude/Codex seats into different accounts to get separate limits.
        </p>
      )}
      {fout && <p className="axe-agentkaart-melding">{fout}</p>}
      <div className="axe-agent-raster axe-agent-raster--ruim">
        {(stoelen ?? []).map(stoel => {
          const v = verbruik[stoel.id];
          const getoond: CodingSeat = {
            ...stoel,
            email: toonStoelEmail(stoel),
            rate_limited: stoel.rate_limited || Boolean(v?.limiet_bereikt),
          };
          const rood = stoelHeeftActie(getoond) && !stoelNietGebruikt(getoond);
          const reset = vensterReset(v?.sessie?.reset || v?.week?.reset) || resetTekst(getoond);
          return (
            <StatusKaart
              key={`${stoel.machine}:${stoel.id}`}
              klein={stoelNietGebruikt(getoond)}
              naam={toonStoelEmail(getoond) || (stoelNietGebruikt(getoond) ? `${stoel.label} (not used)` : stoel.label)}
              accent={ACCENT[stoel.provider] || 'var(--text-secondary)'}
              rol={`${stoel.provider} · ${stoel.machine}${stoel.shared_quota_with.length ? ` · same quota as ${stoel.shared_quota_with.join(', ')}` : ''}`}
              stand={stoelen == null ? { toon: 'muted', tekst: 'Checking' } : stoelHeartbeatStand(getoond)}
              keuze={rood ? (
                <code
                  title={stoel.login_command}
                  style={{ display: 'block', fontSize: 10, color: 'var(--error)', overflow: 'auto', whiteSpace: 'nowrap' }}
                >{stoel.login_command}</code>
              ) : undefined}
              stats={[
                { label: 'Provider', waarde: stoel.provider },
                { label: 'Machine', waarde: stoel.machine },
                { label: 'Task', waarde: stoel.current_task || 'idle' },
                { label: 'Reset', waarde: reset || '—' },
              ]}
              balken={verbruikBalken(v)}
              melding={stoel.last_limit_message ?? (rood ? stoel.login_command : undefined)}
            />
          );
        })}
        {stoelen?.length === 0 && (
          <StatusKaart
            naam="No seats reported"
            accent="var(--text-muted)"
            rol="The Mac mini worker has not heartbeated seats yet, and the agent host did not return /claude/repos."
            stand={{ toon: 'muted', tekst: 'Waiting' }}
            stats={[{ label: 'Last check', waarde: '—' }]}
          />
        )}
      </div>
    </div>
  );
}
