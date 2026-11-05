/**
 * Eén regel waarom iets faalde, plus wat Luka eraan kan doen.
 * Geen jargon, geen afkapping: de pill en RECENT lezen dit.
 */
export type TaakActie = 'retry' | 'open' | 'reconnect' | 'fix';

export type TaakFout = {
  regel: string;
  actie: TaakActie;
};

/** Extra plekken waar lintregels kunnen staan (result, bewijs, events, steps). */
export type TaakFoutBron = {
  result?: unknown;
  metadata?: unknown;
  events?: unknown;
  steps?: unknown;
};

function tekstVan(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const o = error as Record<string, unknown>;
    const findings = Array.isArray(o.findings)
      ? o.findings.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : [];
    const m = o.message ?? o.output ?? o.detail;
    const kern = typeof m === 'string' ? m : typeof o.code === 'string' ? o.code : '';
    if (findings.length) {
      const rest = findings.filter((f) => !kern.includes(f));
      return [kern, ...rest].filter(Boolean).join('\n');
    }
    if (kern) return kern;
  }
  return String(error);
}

function kortPad(pad: string): string {
  const stukken = pad.replace(/\\/g, '/').split('/');
  return stukken.slice(-3).join('/');
}

const BESTAND = String.raw`([^\s:()]+?\.(?:tsx|ts|jsx|js|mjs|cjs|py))`;
const COMPACT = new RegExp(`${BESTAND}:(\\d+)(?::\\d+)?[:\\s]+(?:error|warning)\\b[^\\n]*?([@\\w./-]+)\\s*$`, 'gim');
const GATE = new RegExp(`${BESTAND}:(\\d+)(?::\\d+)?\\s+(?:error|warning)\\s+(@?[\\w./-]+)\\s+`, 'gi');
const TSC = new RegExp(`${BESTAND}\\((\\d+),\\d+\\):\\s+error\\s+(TS\\d+)`, 'gi');
const MULTI = new RegExp(`${BESTAND}\\n\\s+(\\d+):\\d+\\s+(?:error|warning)\\s+.+?\\s+([@\\w./-]+)\\s*$`, 'gim');

function lintVondsten(tekst: string): string[] {
  const uit: string[] = [];
  const gezien = new Set<string>();
  for (const rx of [MULTI, GATE, COMPACT, TSC]) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(tekst))) {
      const regel = `${kortPad(m[1])}:${m[2]} ${m[3]}`;
      if (gezien.has(regel)) continue;
      gezien.add(regel);
      uit.push(regel);
      if (uit.length >= 3) return uit;
    }
  }
  return uit;
}

function verzamelTekst(waarde: unknown, diepte = 0, uit: string[] = []): string[] {
  if (diepte > 10 || uit.length > 40) return uit;
  if (typeof waarde === 'string') {
    const s = waarde.trim();
    if (s) uit.push(s.length > 4000 ? s.slice(-4000) : s);
    return uit;
  }
  if (!waarde || typeof waarde !== 'object') return uit;
  if (Array.isArray(waarde)) {
    for (const v of waarde.slice(0, 24)) verzamelTekst(v, diepte + 1, uit);
    return uit;
  }
  for (const [k, v] of Object.entries(waarde as Record<string, unknown>)) {
    if (/token|password|secret|authorization/i.test(k)) continue;
    verzamelTekst(v, diepte + 1, uit);
  }
  return uit;
}

/** Eerste lintregels (bestand + rule) uit error/result/events/steps. */
export function lintUitlegVan(error: unknown, bron?: TaakFoutBron): string {
  const stukken = verzamelTekst({ error, ...bron });
  const vondsten = lintVondsten(stukken.join('\n'));
  return vondsten.join('; ');
}

function projectCheckNaam(laag: string): 'Lint' | 'Typecheck' | 'Tests' | 'Project check' {
  if (/\blint\b/.test(laag)) return 'Lint';
  if (/\btypecheck\b/.test(laag)) return 'Typecheck';
  if (/\btest(?:s|ing)?\b/.test(laag)) return 'Tests';
  return 'Project check';
}

function isProjectCheckFout(laag: string): boolean {
  return /project check failed|project checks are not verified|project checks failed/.test(laag);
}

export function taakFoutVan(error: unknown, titel = '', bron?: TaakFoutBron): TaakFout {
  const raw = tekstVan(error);
  const laag = `${raw} ${titel} ${lintUitlegVan(error, bron)}`.toLowerCase();

  // 29 okt: de DAX-bouw liep vier keer stuk op een geweigerde GitHub-sleutel en
  // Home bood "Retry" aan, wat alleen dezelfde fout herhaalt. De sleutel kan
  // alleen Luka vernieuwen.
  if (/could not read username for 'https:\/\/github\.com'|github rejects the (vps )?key/.test(laag)) {
    return { regel: 'GitHub rejects the VPS key, so a retry fails the same way. Make a new token and run scripts/zet_github_token.sh on the iMac.', actie: 'open' };
  }
  if (/no handler for northsea_desk|no handler for northsea/.test(laag)) {
    return { regel: 'NorthSea desk had no worker. Retry routes it to the crew on :8040 (drafts only).', actie: 'retry' };
  }
  if (/no handler/.test(laag)) {
    return { regel: 'AXE had no worker for this job. Retry sends it to the agent loop.', actie: 'retry' };
  }
  if (/gpt-6-astra|requires a newer version/.test(laag)) {
    return { regel: 'Codex asked for a model this CLI cannot run. Retry omits -m (account default), then Claude CLI.', actie: 'retry' };
  }
  if (/model_not_found|not supported when using codex|unsupported model/.test(laag)) {
    return { regel: 'Codex rejected the model on this ChatGPT account. Retry omits -m, then falls back to Claude CLI.', actie: 'retry' };
  }
  if (/unpaid invoice|payment required|insufficient (credits|balance)|billing/.test(laag)) {
    return { regel: 'This seat needs billing or credits before it can run.', actie: 'reconnect' };
  }
  if (/oauth|not logged in|please (log|sign) in|login required|authentication (failed|required)|invalid_grant/.test(laag)) {
    return { regel: 'This account is logged out. Reconnect it in Settings → Seats.', actie: 'reconnect' };
  }
  if (/every provider failed|waiting for capacity/.test(laag)) {
    if (/no credits|insufficient_quota|credit/.test(laag)) {
      return { regel: 'Cloud model credits ran out. AXE will retry on free models or your Mac seats — top up OpenAI/Gemini only if you want those back.', actie: 'retry' };
    }
    if (/rate limit|429|afkoelend/.test(laag)) {
      return { regel: 'Models are cooling after a rate limit. AXE will retry shortly on Groq, Ollama, or a free Mac seat.', actie: 'retry' };
    }
    return { regel: 'No cloud model answered. AXE will fall back to Ollama on the VPS or a Mac seat — try again in a moment.', actie: 'retry' };
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
  if (isProjectCheckFout(laag) || /eslint-gate:/.test(laag)) {
    const naam = projectCheckNaam(laag);
    const hint = 'Fix starts a repair task; Retry only re-checks.';
    const uitleg = lintUitlegVan(error, bron);
    const kop = `${naam} failed`;
    const regel = uitleg ? `${kop} — ${uitleg}. ${hint}` : `${kop} — ${hint}`;
    return { regel: regel.slice(0, 280), actie: 'fix' };
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
  if (actie === 'fix') return 'Fix';
  return 'Open';
}
