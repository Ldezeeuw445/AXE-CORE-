/**
 * deskRunner — dezelfde tradingcyclus als de app, zonder de app.
 *
 * "24/7" betekende tot nu toe: zolang het Tauri-venster op de Mac mini open
 * staat. Dit is de headless variant voor de VPS. Geen tweede motor: het roept
 * precies `maybeRunTradingAutopilot` aan — dezelfde due-check, dezelfde
 * accounts, dezelfde poort, dezelfde sizing — en de lease in Supabase zorgt dat
 * hij nooit tegelijk met de desktop of de telefoon dezelfde cyclus draait.
 *
 * Bouwen:  npm run build:runner   → dist-runner/deskRunner.mjs (één bestand)
 * Draaien: node dist-runner/deskRunner.mjs
 *
 * Omgeving (alleen op de VPS; nooit in de app-bundel):
 *   AXE_SUPABASE_URL                 Supabase-URL (standaard die van de app)
 *   AXE_SUPABASE_SERVICE_ROLE_KEY    service role — blijft op de server
 *   AXE_RUNNER_USER_ID               auth-uid van het bureau (Luka)
 *   AXE_RUNNER_DRY=1                 niets claimen, niets draaien: alleen melden
 *                                    wat hij zou doen (voor een eerste controle)
 *   AXE_RUNNER_HEARTBEAT=1           ook de bureauhartslag (correlatie/impact)
 *                                    hier draaien; zet hem dan in de app uit, want
 *                                    twee hartslagen delen één LSE-uurquotum
 *   AXE_RUNNER_STATE_FILE            waar de localStorage-vervanger bewaart
 *   AXE_RUNNER_HEALTH_FILE           waar elke tik zijn status schrijft
 *   `--check`                        exit 1 als de health-file ouder is dan 5 min
 *                                    (voor een watchdog-timer)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const env = process.env;
const STATE_FILE = env.AXE_RUNNER_STATE_FILE || '/var/lib/axe-desk-runner/state.json';
const HEALTH_FILE = env.AXE_RUNNER_HEALTH_FILE || '/var/lib/axe-desk-runner/health.json';
const TICK_MS = 60_000;
const STALE_MS = 5 * 60_000;

function log(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));
}

function writeJson(file: string, value: unknown): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
  } catch (e) {
    log('write_failed', { file, error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * localStorage voor Node, bewaard in één JSON-bestand. De app gebruikt het als
 * snelle lokale kopie naast Supabase (sporen, leerstatistiek); zonder dit
 * zouden die bij elke herstart leeg beginnen.
 */
function installLocalStorage(): void {
  let data: Record<string, string> = {};
  try { if (existsSync(STATE_FILE)) data = JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { data = {}; }
  let dirty = false;
  const flush = () => { if (dirty) { writeJson(STATE_FILE, data); dirty = false; } };
  setInterval(flush, 5_000).unref();
  process.on('exit', flush);
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); dirty = true; },
    removeItem: k => { delete data[k]; dirty = true; },
    clear: () => { data = {}; dirty = true; },
    key: i => Object.keys(data)[i] ?? null,
    get length() { return Object.keys(data).length; },
  };
}

function checkHealth(): never {
  try {
    const h = JSON.parse(readFileSync(HEALTH_FILE, 'utf8')) as { at: string };
    const age = Date.now() - Date.parse(h.at);
    if (age < STALE_MS) { console.log(`ok — last tick ${Math.round(age / 1000)}s ago`); process.exit(0); }
    console.error(`stale — last tick ${Math.round(age / 1000)}s ago`);
  } catch (e) {
    console.error(`no health file: ${e instanceof Error ? e.message : String(e)}`);
  }
  process.exit(1);
}

async function main(): Promise<void> {
  if (process.argv.includes('--check')) checkHealth();

  const serviceKey = env.AXE_SUPABASE_SERVICE_ROLE_KEY ?? '';
  const userId = env.AXE_RUNNER_USER_ID ?? '';
  const dry = env.AXE_RUNNER_DRY === '1';
  if (!serviceKey || !userId) {
    log('refused', { reason: 'AXE_SUPABASE_SERVICE_ROLE_KEY and AXE_RUNNER_USER_ID are required — not running without an identity' });
    process.exit(2);
  }

  installLocalStorage();
  // Pas na de localStorage-vervanger laden: sommige modules lezen hem bij het laden.
  const supa = await import('@/infrastructure/supabase/supabaseClient');
  supa.installServerIdentity({ url: env.AXE_SUPABASE_URL || supa.SUPABASE_URL, serviceKey, userId });
  const lease = await import('@/infrastructure/persistence/autopilotLeaseStore');
  lease.setRunnerKind('vps');
  const autopilot = await import('@/application/tradingIntel/agentAutopilot');
  const { cycleSlot } = await import('@/domain/tradingIntel/autopilotLease');

  log('started', { instance: lease.myHolderId(), dry, heartbeat: env.AXE_RUNNER_HEARTBEAT === '1' });

  if (env.AXE_RUNNER_HEARTBEAT === '1' && !dry) {
    const { startDeskHartslag } = await import('@/application/tradingIntel/deskHartslag');
    startDeskHartslag();
  }

  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      if (!dry) await autopilot.maybeRunTradingAutopilot();
      const st = await autopilot.getAutopilotStatus();
      const due = !st.nextDueAt || Date.parse(st.nextDueAt) <= Date.now();
      const health = {
        at: new Date().toISOString(), instance: st.instance, dry,
        enabled: st.enabled, running: st.running, lastRunAt: st.lastRunAt, nextDueAt: st.nextDueAt,
        lease: st.lease, lastSkip: st.lastSkip, lastResult: st.lastResult?.slice(0, 300) ?? null,
        ...(dry ? { wouldClaimSlot: st.enabled && due ? cycleSlot(st.lastRunAt, st.intervalMin, Date.now()) : null } : {}),
      };
      writeJson(HEALTH_FILE, health);
      log('tick', health);
    } catch (e) {
      log('tick_failed', { error: e instanceof Error ? e.message : String(e) });
    } finally {
      ticking = false;
    }
  };

  await tick();
  if (process.argv.includes('--once')) process.exit(0);
  setInterval(() => { void tick(); }, TICK_MS);
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, () => { log('stopping', { signal: sig }); process.exit(0); });
  }
}

void main().catch(e => { log('crashed', { error: e instanceof Error ? e.stack ?? e.message : String(e) }); process.exit(1); });
