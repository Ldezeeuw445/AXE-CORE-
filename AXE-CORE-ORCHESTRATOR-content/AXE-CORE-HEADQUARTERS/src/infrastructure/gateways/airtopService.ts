/**
 * airtopService — a real Chromium in Airtop's cloud, with a view you can embed.
 *
 * ## Why this exists next to the VPS browser agent
 *
 * `browser_agent.py` already drives a headless Playwright on the VPS and it
 * works (measured: navigate + read, both 200). What it cannot give is a
 * *viewport*. AXE's in-app browser is an `<iframe src={url}>`, and any site
 * worth visiting sends `X-Frame-Options: DENY`, so the component carries a
 * hand-written blocklist of eighteen hosts and shows an apology for the rest.
 * No amount of work on that component fixes it: you cannot iframe a site that
 * refuses to be iframed.
 *
 * Airtop returns a `liveViewUrl` — a page on *their* origin, built to be
 * embedded, showing a browser that can load anything. That is the piece the
 * stack was missing, and it is why this is not merely a second engine for
 * something already solved.
 *
 * ## Sessions are scarce, so they are reused
 *
 * The free plan allows **three** concurrent sessions and creating a fourth
 * fails outright (`BROWSER_SESSION_COUNT_LIMIT_REACHED`). Measured while
 * building this: three forgotten test sessions were enough to lock the account
 * out. So this module keeps ONE session and hands it back, rather than opening
 * one per request and trusting something later to tidy up.
 *
 * ## Two shapes worth remembering
 *
 * - Session creation is **asynchronous**. A brand-new session answers
 *   `status: "initializing"`, and using it then returns a 404 whose message —
 *   "session not available" — reads exactly like a bad key. Always poll.
 * - `DELETE /sessions/{id}` answers with an **empty body**, so it must not be
 *   run through a JSON parser.
 */

/** Dev hits Airtop through vite's proxy; prod through the Vercel function.
 *  Both attach the key server-side — it is never in the bundle. */
const BASE = import.meta.env.DEV ? '/proxy/airtop' : '/api/proxy/airtop';

export interface AirtopWindow {
  sessionId: string;
  windowId: string;
  /** Embeddable — this is the one that makes an in-app browser possible. */
  liveViewUrl: string;
}

interface AirtopEnvelope<T> {
  data?: T;
  errors?: Array<{ message?: string; code?: string }> | null;
  message?: string;
}

async function call<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
  timeoutMs = 120_000,
): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  // DELETE answers 2xx with nothing at all; parsing that would throw on the
  // one call whose whole job is cleanup.
  if (!text) {
    if (!res.ok) throw new Error(`airtop ${res.status}`);
    return undefined as T;
  }

  let parsed: AirtopEnvelope<T>;
  try {
    parsed = JSON.parse(text) as AirtopEnvelope<T>;
  } catch {
    throw new Error(`airtop ${res.status}: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    // Airtop puts the useful sentence in errors[0].message and a duller one in
    // message. Prefer the useful one — the session-limit error names the limit.
    const detail = parsed.errors?.[0]?.message ?? parsed.message ?? `airtop ${res.status}`;
    throw new Error(detail);
  }
  return parsed.data as T;
}

export const isAirtopConfigured = true; // the key lives server-side; ask the proxy, not the bundle

/** Is the proxy wired and the key present? Distinguishes "off" from "broken". */
export async function airtopReachable(): Promise<{ ok: boolean; detail: string }> {
  try {
    await call<{ sessions: unknown[] }>('GET', 'sessions', undefined, 20_000);
    return { ok: true, detail: 'Airtop reachable.' };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

interface SessionData { id: string; status: string }

/** Sessions currently alive, so a stale one can be reused or reaped. */
export async function airtopListSessions(): Promise<SessionData[]> {
  const d = await call<{ sessions?: SessionData[] }>('GET', 'sessions', undefined, 20_000);
  return (d?.sessions ?? []).filter(s => s.status !== 'ended');
}

export async function airtopEndSession(sessionId: string): Promise<void> {
  await call<void>('DELETE', `sessions/${encodeURIComponent(sessionId)}`, undefined, 30_000);
}

/**
 * The one live session, created on first use.
 *
 * Held in a module-local rather than a store: it is a handle to something
 * remote, not app state, and a stale id surviving a reload would be worse
 * than making a fresh one.
 */
let current: AirtopWindow | null = null;

async function waitUntilRunning(sessionId: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await call<SessionData>('GET', `sessions/${encodeURIComponent(sessionId)}`, undefined, 20_000);
    if (s.status !== 'initializing') return;
    await new Promise(r => setTimeout(r, 1000));
  }
  // Measured: ~9s is normal. Anything past this is not slowness.
  throw new Error(`Airtop session ${sessionId} never left "initializing" — try again in a minute.`);
}

/**
 * A browser window showing `url`, reusing the open session when there is one.
 *
 * `solveCaptcha` is deliberately NOT enabled. When a page puts up a challenge
 * the live view is right there — Luka clears it himself and the agent carries
 * on, which is both the honest behaviour and the one that keeps working when
 * a site tightens up.
 */
export async function airtopOpen(url: string): Promise<AirtopWindow> {
  if (current) {
    try {
      await airtopLoadUrl(current, url);
      return current;
    } catch {
      current = null; // session died under us; fall through and make a new one
    }
  }

  const existing = await airtopListSessions().catch(() => []);
  const reusable = existing.find(s => s.status === 'running');

  let sessionId: string;
  if (reusable) {
    sessionId = reusable.id;
  } else {
    const s = await call<SessionData>('POST', 'sessions', { configuration: { timeoutMinutes: 10 } }, 60_000);
    sessionId = s.id;
    await waitUntilRunning(sessionId);
  }

  const w = await call<{ windowId: string }>(
    'POST', `sessions/${encodeURIComponent(sessionId)}/windows`, { url }, 120_000,
  );

  const info = await call<{ liveViewUrl: string }>(
    'GET',
    `sessions/${encodeURIComponent(sessionId)}/windows/${encodeURIComponent(w.windowId)}?includeNavigationBar=true`,
    undefined,
    30_000,
  );

  current = { sessionId, windowId: w.windowId, liveViewUrl: info.liveViewUrl };
  return current;
}

export async function airtopLoadUrl(win: AirtopWindow, url: string): Promise<void> {
  await call<unknown>(
    'POST',
    `sessions/${encodeURIComponent(win.sessionId)}/windows/${encodeURIComponent(win.windowId)}/load-url`,
    { url },
    120_000,
  );
}

/** Page text, as Airtop scraped it. */
export async function airtopScrape(win: AirtopWindow): Promise<string> {
  const d = await call<{ modelResponse?: { scrapedContent?: { text?: string } } }>(
    'POST',
    `sessions/${encodeURIComponent(win.sessionId)}/windows/${encodeURIComponent(win.windowId)}/scrape-content`,
    {},
    120_000,
  );
  return d?.modelResponse?.scrapedContent?.text ?? '';
}

/** Ask a question about the page; Airtop runs a model over it and answers. */
export async function airtopQuery(win: AirtopWindow, prompt: string): Promise<string> {
  const d = await call<{ modelResponse?: string }>(
    'POST',
    `sessions/${encodeURIComponent(win.sessionId)}/windows/${encodeURIComponent(win.windowId)}/page-query`,
    { prompt },
    180_000,
  );
  return d?.modelResponse ?? '';
}

/** Click by description — Airtop resolves it against the page itself. */
export async function airtopClick(win: AirtopWindow, elementDescription: string): Promise<void> {
  await call<unknown>(
    'POST',
    `sessions/${encodeURIComponent(win.sessionId)}/windows/${encodeURIComponent(win.windowId)}/click`,
    { elementDescription },
    120_000,
  );
}

export async function airtopType(
  win: AirtopWindow,
  text: string,
  elementDescription?: string,
  pressEnterKey = false,
): Promise<void> {
  await call<unknown>(
    'POST',
    `sessions/${encodeURIComponent(win.sessionId)}/windows/${encodeURIComponent(win.windowId)}/type`,
    { text, pressEnterKey, ...(elementDescription ? { elementDescription } : {}) },
    120_000,
  );
}

/** The window the in-app browser is currently showing, if any. */
export function airtopCurrent(): AirtopWindow | null {
  return current;
}

/** Close the session and forget it — the free plan's three slots are precious. */
export async function airtopClose(): Promise<void> {
  const win = current;
  current = null;
  if (win) await airtopEndSession(win.sessionId).catch(() => { /* already gone */ });
}
