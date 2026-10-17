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
  stoelStand,
  type CodingSeat,
} from '@/domain/codingSeats';
import { claudeRepos, sbGetRows } from '@/infrastructure/gateways/axeCoreApiService';

interface WorkerSeatRow {
  seat_id?: string;
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
}

function totMs(waarde: number | string | null | undefined): number | null {
  if (waarde == null || waarde === '') return null;
  if (typeof waarde === 'number') return waarde < 1e12 ? waarde * 1000 : waarde;
  const n = Date.parse(waarde);
  return Number.isNaN(n) ? null : n;
}

function vanApi(raw: Record<string, unknown>): CodingSeat {
  return {
    id: String(raw.id || ''),
    provider: (raw.provider as CodingSeat['provider']) || 'claude',
    label: String(raw.label || raw.id || ''),
    email: typeof raw.email === 'string' ? raw.email : null,
    machine: String(raw.machine || 'unknown'),
    logged_in: typeof raw.logged_in === 'boolean' ? raw.logged_in : null,
    login_command: String(raw.login_command || ''),
    current_task: typeof raw.current_task === 'string' ? raw.current_task : null,
    rate_limited: Boolean(raw.rate_limited),
    rate_limit_until: totMs(raw.rate_limit_until as number | string | null),
    last_limit_message: typeof raw.last_limit_message === 'string' ? raw.last_limit_message : null,
    remaining_note: String(raw.remaining_note || 'CLI does not expose remaining quota.'),
    shared_quota_with: Array.isArray(raw.shared_quota_with) ? raw.shared_quota_with.map(String) : [],
  };
}

function vanWorker(row: WorkerSeatRow): CodingSeat {
  return {
    id: String(row.seat_id || ''),
    provider: (row.provider as CodingSeat['provider']) || 'claude',
    label: String(row.seat_id || ''),
    email: row.email ?? null,
    machine: row.machine || row.host || 'unknown',
    logged_in: typeof row.logged_in === 'boolean' ? row.logged_in : null,
    login_command: row.login_command || '',
    current_task: row.current_task ?? null,
    rate_limited: Boolean(row.rate_limited),
    rate_limit_until: totMs(row.rate_limit_until),
    last_limit_message: row.last_limit_message ?? null,
    remaining_note: row.remaining_note || 'CLI does not expose remaining quota.',
    shared_quota_with: [],
  };
}

function voegSamen(api: CodingSeat[], worker: CodingSeat[]): CodingSeat[] {
  const uit = new Map<string, CodingSeat>();
  for (const s of api) if (s.id) uit.set(s.id, s);
  for (const s of worker) {
    if (!s.id) continue;
    const eerder = uit.get(s.id);
    uit.set(s.id, {
      ...eerder,
      ...s,
      label: eerder?.label || s.label,
      email: s.email ?? eerder?.email ?? null,
      login_command: s.login_command || eerder?.login_command || '',
      remaining_note: s.remaining_note || eerder?.remaining_note || '',
    });
  }
  return metGedeeldeQuota([...uit.values()]);
}

const ACCENT: Record<string, string> = {
  claude: '#f59e0b',
  codex: '#34d399',
  cursor: '#60a5fa',
  openhands: '#fb923c',
};

export function CodingSeatsSection() {
  const [stoelen, setStoelen] = useState<CodingSeat[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const laad = () => {
      void Promise.all([
        claudeRepos().catch(() => ({ seats: [] as unknown[] })),
        sbGetRows<WorkerSeatRow>('core_coding_seats', { limit: 40, orderBy: 'last_seen_at', orderDir: 'desc' })
          .catch(() => [] as WorkerSeatRow[]),
      ]).then(([repos, worker]) => {
        if (!alive) return;
        const api = Array.isArray(repos.seats) ? repos.seats.map(s => vanApi(s as Record<string, unknown>)) : [];
        setStoelen(voegSamen(api, worker.map(vanWorker)));
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
          const rood = stoelHeeftActie(stoel);
          return (
            <StatusKaart
              key={`${stoel.machine}:${stoel.id}`}
              naam={stoel.email || stoel.label}
              accent={ACCENT[stoel.provider] || 'var(--text-secondary)'}
              rol={`${stoel.provider} · ${stoel.machine}${stoel.shared_quota_with.length ? ` · same quota as ${stoel.shared_quota_with.join(', ')}` : ''}`}
              stand={stoelen == null ? { toon: 'muted', tekst: 'Checking' } : stoelStand(stoel)}
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
                { label: 'Reset', waarde: resetTekst(stoel) },
              ]}
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
