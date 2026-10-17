/**
 * Eén regel waarom iets faalde, plus wat Luka eraan kan doen.
 * Geen jargon, geen afkapping: de pill en RECENT lezen dit.
 */
export type TaakActie = 'retry' | 'open' | 'reconnect';

export type TaakFout = {
  regel: string;
  actie: TaakActie;
};

function tekstVan(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const o = error as Record<string, unknown>;
    const m = o.message ?? o.output ?? o.detail;
    if (typeof m === 'string') return m;
    const code = o.code;
    if (typeof code === 'string') return code;
  }
  return String(error);
}

export function taakFoutVan(error: unknown, titel = ''): TaakFout {
  const raw = tekstVan(error);
  const laag = `${raw} ${titel}`.toLowerCase();

  if (/no handler for northsea_desk|no handler for northsea/.test(laag)) {
    return { regel: 'NorthSea desk had no worker. Retry routes it to the crew on :8040 (drafts only).', actie: 'retry' };
  }
  if (/no handler/.test(laag)) {
    return { regel: 'AXE had no worker for this job. Retry sends it to the agent loop.', actie: 'retry' };
  }
  if (/gpt-6-astra|requires a newer version/.test(laag)) {
    return { regel: 'Codex asked for gpt-6-astra; this CLI is too old. Retry uses gpt-5-codex.', actie: 'retry' };
  }
  if (/unpaid invoice|payment required|insufficient (credits|balance)|billing/.test(laag)) {
    return { regel: 'This seat needs billing or credits before it can run.', actie: 'reconnect' };
  }
  if (/oauth|not logged in|please (log|sign) in|login required|authentication (failed|required)|invalid_grant/.test(laag)) {
    return { regel: 'This account is logged out. Reconnect it in Settings → Seats.', actie: 'reconnect' };
  }
  if (/rate limit|quota exceeded|too many requests|\b429\b|usage limit/.test(laag)) {
    return { regel: 'This seat hit its usage limit. Retry after it cools, or reconnect another seat.', actie: 'retry' };
  }
  if (/northsea:.*token not set|127\.0\.0\.1:8040|crew service/.test(laag)) {
    return { regel: 'NorthSea crew on this Mac is unreachable. Reconnect the desk token.', actie: 'reconnect' };
  }
  if (/orchestrator health/.test(laag)) {
    return { regel: 'Orchestrator health check found a real compile or test failure. Open the report.', actie: 'open' };
  }
  if (/consecutive_failures|schedule|cron/.test(laag) && /fail/.test(laag)) {
    return { regel: raw.slice(0, 180) || 'A schedule failed its last run.', actie: 'retry' };
  }
  const regel = raw.replace(/\s+/g, ' ').trim();
  if (regel) return { regel: regel.slice(0, 220), actie: 'retry' };
  return { regel: titel ? `Failed: ${titel}` : 'This task failed without a stored reason.', actie: 'open' };
}

export function taakActieLabel(actie: TaakActie): string {
  if (actie === 'retry') return 'Retry';
  if (actie === 'reconnect') return 'Reconnect account';
  return 'Open';
}
