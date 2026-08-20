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
import { loadDurableConfig, saveDurableConfig } from '@/infrastructure/persistence/durableConfigService';
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
 * The list, folding in the single account that already exists.
 *
 * Idempotent: once migrated, the stored list wins and metaapi_config is only
 * consulted to keep `activeId` honest if it was changed elsewhere (the Agent
 * tab still has its own MetaAPI form, and this must not fight it).
 */
export async function getAccounts(): Promise<AccountsState> {
  const stored = await loadDurableConfig<AccountsState | null>(KEY, null).catch(() => null);
  const legacy = await getMetaApiConfig().catch(() => null);

  let state: AccountsState = stored?.accounts?.length ? stored : EMPTY;

  if (!state.accounts.length && legacy?.token && legacy?.accountId) {
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
  if (legacy?.accountId) {
    const match = state.accounts.find(a => a.accountId === legacy.accountId);
    if (match && state.activeId !== match.id) state = { ...state, activeId: match.id };
  }
  return state;
}

async function persist(state: AccountsState): Promise<AccountsState> {
  await saveDurableConfig(KEY, state);
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
