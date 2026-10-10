/** Kostenhek voor deze app-installatie; geen organisatiebreed OpenAI-budget.
 * Telt conservatief alle tokens, ook cached input. Geen audio of teksten opslaan.
 */
export const REALTIME_USAGE_KEY = 'axe-realtime-usage-v1';
export const REALTIME_DAILY_TOKENS = 50_000;
export const REALTIME_SESSION_TOKENS = 20_000;
export const REALTIME_IDLE_MS = 90_000;
export const REALTIME_MAX_SESSION_MS = 10 * 60_000;

export interface UsageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type Ledger = { day: string; tokens: number; responses: Record<string, number> };

function dayKey(now: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function createRealtimeUsageGuard(storage: UsageStorage, now = () => Date.now()) {
  let sessionTokens = 0;
  const seen = new Map<string, number>();
  const read = (): Ledger => {
    const day = dayKey(now());
    const raw = storage.getItem(REALTIME_USAGE_KEY);
    if (!raw) return { day, tokens: 0, responses: {} };
    const value = JSON.parse(raw) as Ledger;
    if (!value || typeof value.day !== 'string' || !Number.isSafeInteger(value.tokens)
      || value.tokens < 0 || !value.responses || typeof value.responses !== 'object'
      || Array.isArray(value.responses)) throw new Error('Voice usage storage is invalid.');
    return value.day === day ? value : { day, tokens: 0, responses: {} };
  };
  const assertAvailable = () => {
    if (read().tokens >= REALTIME_DAILY_TOKENS) throw new Error('Daily voice token limit reached. Use typed chat.');
    if (sessionTokens >= REALTIME_SESSION_TOKENS) throw new Error('Voice session token limit reached. Start a new conversation.');
  };
  assertAvailable();
  // Controleer vóór het ophalen van een geheim ook of opslag beschrijfbaar is.
  storage.setItem(REALTIME_USAGE_KEY, JSON.stringify(read()));
  return {
    assertAvailable,
    record(response: unknown) {
      const r = response as { id?: unknown; usage?: { total_tokens?: unknown } } | undefined;
      const tokens = r?.usage?.total_tokens;
      if (typeof r?.id !== 'string' || !r.id || typeof tokens !== 'number'
        || !Number.isSafeInteger(tokens) || tokens < 0) {
        throw new Error('Voice usage is unavailable. Conversation stopped to protect credits.');
      }
      const ledger = read();
      // Grootste waarneming telt; dubbele response.done-events tellen niet opnieuw.
      const previous = Object.hasOwn(ledger.responses, r.id) ? ledger.responses[r.id] : 0;
      if (!Number.isSafeInteger(previous) || previous < 0) throw new Error('Voice usage storage is invalid.');
      const added = Math.max(0, tokens - previous);
      ledger.tokens += added;
      ledger.responses[r.id] = Math.max(previous, tokens);
      storage.setItem(REALTIME_USAGE_KEY, JSON.stringify(ledger));
      sessionTokens += Math.max(0, tokens - (seen.get(r.id) ?? 0));
      seen.set(r.id, Math.max(seen.get(r.id) ?? 0, tokens));
      assertAvailable();
      return { dailyTokens: ledger.tokens, sessionTokens };
    },
  };
}
