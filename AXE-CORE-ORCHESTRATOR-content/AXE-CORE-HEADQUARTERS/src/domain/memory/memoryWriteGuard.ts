/**
 * Wanneer mag een agent of cron iets in het geheugen zetten?
 *
 * Geheugen is wat AXE leert, geen run-log. Een HOLD, een skip, of dezelfde
 * les als gisteren is geen nieuwe kennis. Zonder dit hek schrijft Trading
 * elke cyclus een rij en cron elke tik, en de Neural-tab wordt een muur.
 */

export const GEHEUGEN_MAG_PER_DAG = 120;

const NOOP = /^(hold\s+score=|no(?:thing)?\s*(?:new|change|op)\b|skip(?:ped|ping)?\b|no[- ]change\b)/i;
const HOLD_JSON = /"action"\s*:\s*"hold"/i;
const RUN_KEY = /^agent_run:/i;
const CYCLE_KEY = /:(cycle):/i;
const TS_TAIL = /:\d{10,13}$/;
const UUID_TAIL = /:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isNoopMemory(tekst: string | null | undefined): boolean {
  const t = (tekst || '').trim();
  if (!t) return true;
  if (NOOP.test(t)) return true;
  if (HOLD_JSON.test(t) && /\bhold\b/i.test(t)) return true;
  return false;
}

/** Run-logs horen in core_job_runs / core_tasks, niet in memory. */
export function isRunLogKey(key: string | null | undefined): boolean {
  const k = key || '';
  return RUN_KEY.test(k) || CYCLE_KEY.test(k);
}

export function inhoudHash(tekst: string): string {
  const data = new TextEncoder().encode((tekst || '').trim());
  // Sync FNV-1a 64-bit, alleen voor tests die geen subtle crypto hebben.
  // De échte sleutelhash loopt via inhoudHashAsync (SHA-256, zelfde als Python).
  let h = 0xcbf29ce484222325n;
  for (const b of data) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0').slice(0, 16);
}

export async function inhoudHashAsync(tekst: string): Promise<string> {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.subtle) {
    const buf = await cryptoObj.subtle.digest('SHA-256', new TextEncoder().encode((tekst || '').trim()));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }
  return inhoudHash(tekst);
}

/**
 * Timestamp/uuid-staart eraf, zodat dezelfde les dezelfde sleutel krijgt.
 * `ta:…:lesson:XAUUSD:17877…` → `ta:…:lesson:XAUUSD`.
 */
export function stabieleSleutel(key: string | null | undefined): string {
  let k = (key || '').trim();
  if (!k) return '';
  if (RUN_KEY.test(k)) {
    k = k.replace(TS_TAIL, '');
    return k.split(':').slice(0, 3).join(':');
  }
  return k.replace(TS_TAIL, '').replace(UUID_TAIL, '');
}

export function sleutelMetHash(key: string | null | undefined, hash: string): string {
  const basis = stabieleSleutel(key);
  if (!basis) return hash ? `mem:${hash}` : '';
  if (basis.endsWith(`:${hash}`)) return basis;
  return `${basis}:${hash}`;
}

export type SchrijfReden = 'ok' | 'leeg' | 'noop' | 'run_log' | 'duplicate' | 'cap';

export function magGeheugenSchrijven(input: {
  key?: string | null;
  content?: string | null;
  hash?: string | null;
  bestaandeHash?: string | null;
  vandaagAl?: number;
  cap?: number;
}): SchrijfReden {
  const tekst = (input.content || '').trim();
  if (!tekst) return 'leeg';
  if (isRunLogKey(input.key)) return 'run_log';
  if (isNoopMemory(tekst)) return 'noop';
  const hash = input.hash || inhoudHash(tekst);
  if (input.bestaandeHash && input.bestaandeHash === hash) return 'duplicate';
  const cap = input.cap ?? GEHEUGEN_MAG_PER_DAG;
  if ((input.vandaagAl ?? 0) >= cap) return 'cap';
  return 'ok';
}
