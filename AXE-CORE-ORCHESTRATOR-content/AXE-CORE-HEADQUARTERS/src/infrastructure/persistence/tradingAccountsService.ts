/**
 * tradingAccountsService — more than one broker account, without breaking the
 * one that already trades.
 *
 * THE CONSTRAINT THAT SHAPES THIS
 *
 * Every MetaAPI call in the app resolves its account inside
 * `getMetaApiConfig()` — eighteen functions, none of which take an account
 * argument. Rewriting all of them to be account-aware in one go, against a
 * setup that currently has exactly ONE account to test with, would mean
 * shipping untested order placement. So the model here is deliberately
 * additive:
 *
 *   * the LIST is the new source of truth, and it is persisted durably so the
 *     browser and the packaged Tauri app agree — same reason metaapi_config is;
 *   * exactly one account is `active`, and activating one WRITES the existing
 *     metaapi_config. Every existing call site keeps working untouched and
 *     immediately points at the newly chosen account;
 *   * `enabled` is recorded per account but nothing trades on more than the
 *     active one yet. It is the flag simultaneous execution will read, and
 *     until that exists the Accounts tab says so on the card rather than
 *     implying otherwise.
 *
 * The migration matters as much as the model: a user who has been trading a
 * single account for weeks must not open this tab and find nothing. The first
 * read folds the existing metaapi_config into a one-element list, marked
 * active, keeping its token, id, region and its live track record.
 */
import { saveDurableConfig } from '@/infrastructure/persistence/durableConfigService';
import { memList } from '@/infrastructure/gateways/axeCoreApiService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import {
  getMetaApiConfig,
  saveMetaApiConfig,
  type MetaApiConfig,
  type MetaApiRegion,
} from '@/infrastructure/gateways/metaApiService';

export interface TradingAccount {
  /** Stable local id — not the broker's. Survives an accountId being corrected. */
  id: string;
  /** What Luka calls it: "Live 50k", "Prop challenge", "Demo". */
  label: string;
  token: string;
  accountId: string;
  region: MetaApiRegion;
  /** Marked for trading. Read by simultaneous execution when that exists;
   *  today only the active account is traded. */
  enabled: boolean;
  addedAt: string;
}

export interface AccountsState {
  accounts: TradingAccount[];
  /** id of the account every existing MetaAPI call currently resolves to. */
  activeId: string | null;
}

const KEY = 'trading_accounts';
const EMPTY: AccountsState = { accounts: [], activeId: null };

function uid(): string {
  return `acct_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Never render a token. Enough to recognise which key is which, no more. */
export function maskToken(token: string): string {
  const t = (token ?? '').trim();
  if (t.length <= 8) return '••••';
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

/**
 * Read the stored list, and say WHETHER IT COULD BE READ.
 *
 * loadDurableConfig() catches its own errors and returns the fallback, which
 * makes "the API is down" indistinguishable from "nothing is stored". That
 * distinction is the difference between showing a list and destroying one:
 * on a failed read the caller would see an empty list, run the migration, and
 * PERSIST a one-element list over the real accounts. Luka added an account and
 * it vanished; the stored row still said one account, written hours earlier.
 *
 * So this talks to memList directly and lets a failure throw.
 */
async function readStored(): Promise<AccountsState | null> {
  const rows = await memList({ user_id: AXE_USER_ID, key_prefix: `cfg:${KEY}`, limit: 5 });
  const row = rows.find(r => r.key === `cfg:${KEY}`);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as AccountsState;
  } catch {
    // Unparseable is NOT "absent". Migrating over it would delete accounts.
    throw new Error('stored accounts list is corrupt — refusing to overwrite it');
  }
}

/**
 * The list, folding in the single account that already exists.
 *
 * Idempotent: once migrated, the stored list wins and metaapi_config is only
 * consulted to keep `activeId` honest if it was changed elsewhere (the Agent
 * tab still has its own MetaAPI form, and this must not fight it).
 *
 * Throws when the store is unreachable, rather than pretending it is empty.
 */
export async function getAccounts(): Promise<AccountsState> {
  const stored = await readStored();
  const legacy = await getMetaApiConfig().catch(() => null);

  let state: AccountsState = stored?.accounts?.length ? stored : EMPTY;

  // Migrate ONLY when the store was genuinely readable and genuinely empty.
  if (stored === null && !state.accounts.length && legacy?.token && legacy?.accountId) {
    const migrated: TradingAccount = {
      id: uid(),
      label: 'Account 1',
      token: legacy.token,
      accountId: legacy.accountId,
      region: legacy.region,
      enabled: legacy.enabled,
      addedAt: legacy.updatedAt || new Date().toISOString(),
    };
    state = { accounts: [migrated], activeId: migrated.id };
    await saveDurableConfig(KEY, state);
    return state;
  }

  // Someone changed the MetaAPI config outside this tab — believe the config,
  // because that is what the trading code actually uses. Saying otherwise here
  // would make this tab the lying one.
  //
  // And it did. Measured 2026-08-20: Luka registered an MT5 100K DEMO through
  // the Agent tab's own MetaAPI form, which set metaapi_config to it, while the
  // stored list still held only the OANDA account. The tab would have drawn
  // OANDA as ACTIVE while every order went to the other account — the worst
  // possible thing for this screen to be wrong about.
  //
  // So an account that is being traded but is not in the list gets ADOPTED into
  // it rather than ignored. The Agent tab, a future flow, or a hand edit can
  // all point the config somewhere; this tab has to describe reality, not the
  // subset of it that came through here.
  if (legacy?.accountId) {
    const match = state.accounts.find(a => a.accountId === legacy.accountId);
    if (match) {
      if (state.activeId !== match.id) state = { ...state, activeId: match.id };
    } else if (legacy.token) {
      const adopted: TradingAccount = {
        id: uid(),
        label: 'Active account',
        token: legacy.token,
        accountId: legacy.accountId,
        region: legacy.region,
        enabled: true,
        addedAt: legacy.updatedAt || new Date().toISOString(),
      };
      state = { accounts: [...state.accounts, adopted], activeId: adopted.id };
      // Persisted so the adoption is not re-done on every read, and so the
      // label can be renamed and stick.
      await saveDurableConfig(KEY, state).catch(() => { /* shown by the caller */ });
    }
  }
  return state;
}

/**
 * Write, then READ IT BACK.
 *
 * saveDurableConfig goes through the VPS API, which is exactly what was
 * failing when Luka added an account ("Sync mislukt — The quota has been
 * exceeded"). The add resolved, the tab re-rendered, and the account was gone
 * on the next load, because nothing had checked that the write landed.
 *
 * This is the same rule saveMetaApiConfig already states in its own comment: a
 * config that only LOOKS saved is the bug. Reading back costs one request and
 * turns a silent loss into an error the UI can show.
 */
async function persist(state: AccountsState): Promise<AccountsState> {
  await saveDurableConfig(KEY, state);
  const back = await readStored().catch(() => null);
  if (!back || back.accounts.length !== state.accounts.length) {
    throw new Error(
      'the accounts list did not save — the AXE API rejected the write, so nothing was changed',
    );
  }
  return state;
}

export async function addAccount(input: {
  label: string;
  token: string;
  accountId: string;
  region: MetaApiRegion;
}): Promise<AccountsState> {
  const state = await getAccounts();
  const account: TradingAccount = {
    id: uid(),
    label: input.label.trim() || `Account ${state.accounts.length + 1}`,
    token: input.token.trim(),
    accountId: input.accountId.trim(),
    region: input.region,
    enabled: true,
    addedAt: new Date().toISOString(),
  };
  const next: AccountsState = {
    accounts: [...state.accounts, account],
    // First account added becomes active; a second does not steal the desk out
    // from under a running autopilot.
    activeId: state.activeId ?? account.id,
  };
  if (!state.activeId) await pointMetaApiAt(account);
  return persist(next);
}

export async function removeAccount(id: string): Promise<AccountsState> {
  const state = await getAccounts();
  const remaining = state.accounts.filter(a => a.id !== id);
  const wasActive = state.activeId === id;
  const next: AccountsState = {
    accounts: remaining,
    activeId: wasActive ? remaining[0]?.id ?? null : state.activeId,
  };
  if (wasActive && remaining[0]) await pointMetaApiAt(remaining[0]);
  return persist(next);
}

export async function setAccountEnabled(id: string, enabled: boolean): Promise<AccountsState> {
  const state = await getAccounts();
  return persist({
    ...state,
    accounts: state.accounts.map(a => (a.id === id ? { ...a, enabled } : a)),
  });
}

export async function renameAccount(id: string, label: string): Promise<AccountsState> {
  const state = await getAccounts();
  return persist({
    ...state,
    accounts: state.accounts.map(a => (a.id === id ? { ...a, label: label.trim() || a.label } : a)),
  });
}

/**
 * Make this the account the whole app trades.
 *
 * This is the only function here with teeth: it rewrites metaapi_config, which
 * is what all eighteen MetaAPI call sites read. Awaited rather than
 * fire-and-forget for the reason saveMetaApiConfig documents — a config that
 * only looks saved is the bug that already cost this project a day.
 */
export async function activateAccount(id: string): Promise<AccountsState> {
  const state = await getAccounts();
  const account = state.accounts.find(a => a.id === id);
  if (!account) return state;
  await pointMetaApiAt(account);
  return persist({ ...state, activeId: id });
}

async function pointMetaApiAt(account: TradingAccount): Promise<MetaApiConfig> {
  return saveMetaApiConfig({
    token: account.token,
    accountId: account.accountId,
    region: account.region,
    enabled: true,
  });
}

/**
 * Every account the algo should trade this cycle, as MetaAPI configs.
 *
 * `enabled` finally means something: an account marked for trading gets its own
 * full decision — its own equity for sizing, its own circuit breaker, its own
 * refusal if it is near a limit. It is NOT a mirror of the active account's
 * order, because mirroring skips exactly the checks that matter most on a prop
 * account, where one more trade is the difference between a challenge passed
 * and a challenge lost.
 *
 * Returns [] when there is nothing to fan out to — no list, or a single
 * account — so the caller keeps its original single-account path and behaviour
 * is unchanged for anyone who never opens the Accounts tab.
 */
/**
 * Every enabled account, however many there are.
 *
 * Distinct from [tradeableAccounts] on purpose, because two different
 * questions were being answered by one function:
 *
 *   "which accounts do I fan an order out to?"  — needs 2+, else the caller
 *                                                  keeps its single-account path
 *   "which symbols can I actually trade?"       — needs every account, always
 *
 * scanUniverse asked the first and used the answer for the second, so with one
 * account it received [] and could not check the universe against any broker
 * at all. It then fell back to the cached list and screened markets that
 * account has never heard of — and MetaAPI answers those with 404s and, past a
 * threshold, throttles the whole subscription with "The quota has been
 * exceeded". The 404s are the cost, not the volume.
 */
export async function enabledAccounts(): Promise<MetaApiConfig[]> {
  const state = await getAccounts().catch(() => null);
  if (!state) return [];
  return state.accounts
    .filter(a => a.enabled && a.token && a.accountId)
    .map(a => ({
      token: a.token,
      accountId: a.accountId,
      region: a.region,
      enabled: true,
      updatedAt: a.addedAt,
    }));
}

export async function tradeableAccounts(): Promise<MetaApiConfig[]> {
  const state = await getAccounts().catch(() => null);
  if (!state) return [];
  const enabled = state.accounts.filter(a => a.enabled && a.token && a.accountId);
  if (enabled.length < 2) return [];
  return enabled.map(a => ({
    token: a.token,
    accountId: a.accountId,
    region: a.region,
    enabled: true,
    updatedAt: a.addedAt,
  }));
}

/** Label for an account id, for summaries and traces. */
export async function accountLabel(accountId: string): Promise<string> {
  const state = await getAccounts().catch(() => null);
  return state?.accounts.find(a => a.accountId === accountId)?.label ?? accountId.slice(0, 8);
}
