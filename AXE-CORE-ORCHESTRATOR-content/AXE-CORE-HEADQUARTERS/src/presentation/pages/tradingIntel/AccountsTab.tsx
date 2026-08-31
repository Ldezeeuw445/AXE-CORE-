/**
 * AccountsTab — every broker account, and what is actually happening on each.
 *
 * WHAT THIS DELIBERATELY DOES NOT CLAIM
 *
 * Only the ACTIVE account trades. Marking others "enabled" records the
 * intention and nothing more, because simultaneous execution does not exist
 * yet: every MetaAPI call in the app resolves its account inside
 * getMetaApiConfig(), and making eighteen of them account-aware against a
 * setup with one account to test on would mean shipping untested order
 * placement. The card says so in words rather than leaving a toggle that looks
 * like it trades.
 *
 * Numbers come from each account's OWN MetaAPI read, one request per card, not
 * from the active account's figures reused. An account that cannot be read
 * shows why — never a zero, never the last account's balance. A wrong number
 * here would be worse than a blank one: this is the screen you would check
 * before deciding a prop account is safe.
 */
import { useCallback, useEffect, useState } from 'react';
import { AccountsBar } from './AccountsBar';
import { Loader2, Plus, RefreshCw, Trash2, Check } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import {
  getAccounts, addAccount, removeAccount, activateAccount, setAccountEnabled,
  maskToken, type TradingAccount, type AccountsState,
} from '@/infrastructure/persistence/tradingAccountsService';
import {
  metaApiAccountInfoFor, metaApiPositionsFor, metaApiListAccounts, metaApiAccountId,
  metaApiProvisionAccount, type MetaApiRegion, type MetaApiTradingAccount,
} from '@/infrastructure/gateways/metaApiService';

// All four MetaApiRegion values. Omitting one would quietly make an account
// in that region unaddable from this screen while the type says otherwise.
const REGIONS: MetaApiRegion[] = ['london', 'new-york', 'singapore', 'tokyo'];

type Live =
  | { state: 'loading' }
  | { state: 'error'; reason: string }
  | { state: 'ok'; equity: number | null; balance: number | null; currency: string | null; positions: number; floating: number };

function money(v: number | null, ccy: string | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}${ccy ? ` ${ccy}` : ''}`;
}

export function AccountsTab() {
  const [state, setState] = useState<AccountsState>({ accounts: [], activeId: null });
  const [live, setLive] = useState<Record<string, Live>>({});
  const [busy, setBusy] = useState(false);
  // Every mutation can fail — the store is behind the VPS API. Without this,
  // a failed add resolved into an unhandled rejection: the form closed,
  // nothing appeared, and nothing said why. Declared here, above load(),
  // which uses it.
  const [opError, setOpError] = useState<string | null>(null);

  const readOne = useCallback(async (a: TradingAccount) => {
    setLive(l => ({ ...l, [a.id]: { state: 'loading' } }));
    const cfg = { token: a.token, accountId: a.accountId, region: a.region, enabled: true, updatedAt: a.addedAt };
    const [info, pos] = await Promise.all([
      metaApiAccountInfoFor(cfg),
      metaApiPositionsFor(cfg),
    ]);
    if (!info.ok) {
      setLive(l => ({ ...l, [a.id]: { state: 'error', reason: info.error } }));
      return;
    }
    // Floating P&L straight off the open positions this account reports.
    const rows = (pos.ok ? pos.positions : []) as Array<{ profit?: number }>;
    const floating = rows.reduce((n, r) => n + (typeof r.profit === 'number' ? r.profit : 0), 0);
    setLive(l => ({
      ...l,
      [a.id]: {
        state: 'ok',
        equity: info.info.equity,
        balance: info.info.balance,
        currency: info.info.currency,
        positions: rows.length,
        floating,
      },
    }));
  }, []);

  const load = useCallback(async () => {
    let s: AccountsState;
    try {
      s = await getAccounts();
    } catch (e) {
      // The store being unreachable is NOT an empty account list, and must not
      // be drawn as one.
      setOpError(e instanceof Error ? e.message : String(e));
      return;
    }
    setState(s);
    setOpError(null);
    // Sequential on purpose. MetaAPI rate-limits per token, and this project
    // already spent a day on a quota error that stopped every trade — a tab
    // that fans out one request per account per render would be a new way to
    // trip the same limit.
    for (const a of s.accounts) await readOne(a);
  }, [readOne]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (fn: () => Promise<AccountsState>) => {
    setBusy(true);
    setOpError(null);
    try {
      setState(await fn());
    } catch (e) {
      setOpError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Which accounts are actually being traded, and the threshold that
          decides it. Below two enabled, the fan-out returns nothing and the
          autopilot silently uses the active account only — invisible in the
          data and the reason "it stays on one" survived the fan-out being
          wired and all three answering MetaAPI with real balances. */}
      <AccountsBar />
      <WidgetCard
        title="Broker accounts"
        headerAction={
          <button type="button" onClick={() => void load()} className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
            <RefreshCw size={10} /> Refresh
          </button>
        }
      >
        {opError && (
          <p className="text-[11px] mb-1.5" style={{ color: 'var(--error)' }}>{opError}</p>
        )}
        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          AXE Algo trades the <span style={{ color: 'var(--accent-cyan)' }}>active</span> account. Others are read-only
          here — simultaneous trading across accounts is not built yet, so nothing on this screen
          places an order on more than one.
        </p>
      </WidgetCard>

      {state.accounts.map(a => {
        const l = live[a.id];
        const isActive = state.activeId === a.id;
        return (
          <WidgetCard
            key={a.id}
            title={a.label}
            headerAction={
              <span className="flex items-center gap-2">
                {isActive ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide"
                    style={{ color: 'var(--accent-cyan)', background: 'var(--tint)' }}>active</span>
                ) : (
                  <button type="button" disabled={busy} onClick={() => void act(() => activateAccount(a.id))}
                    className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide"
                    style={{ color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.06)' }}>
                    trade this
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => void act(() => removeAccount(a.id))} title="Remove">
                  <Trash2 size={11} style={{ color: 'rgba(255,255,255,0.3)' }} />
                </button>
              </span>
            }
          >
            <div className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {a.accountId} · {a.region} · key {maskToken(a.token)}
            </div>

            {!l || l.state === 'loading' ? (
              <div className="flex items-center gap-1.5 text-[11px] mt-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <Loader2 size={11} className="animate-spin" /> Reading the broker…
              </div>
            ) : l.state === 'error' ? (
              // The reason, not a zero. A blank balance is honest; a wrong one
              // is how you convince yourself an account is flat when it is not.
              <div className="text-[11px] mt-1.5" style={{ color: 'var(--warning)' }} title={l.reason}>
                Unreadable — {l.reason.slice(0, 90)}
              </div>
            ) : (
              <div className="mt-1.5 space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[15px] font-medium" style={{ color: '#F5F0E6' }}>{money(l.equity, l.currency)}</span>
                  <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>equity</span>
                  <span className="ml-auto text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    bal {money(l.balance, l.currency)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>{l.positions} open</span>
                  {l.positions > 0 && (
                    <span style={{ color: l.floating >= 0 ? 'var(--success)' : 'var(--error)' }}>
                      {l.floating >= 0 ? '+' : ''}{l.floating.toFixed(2)} floating
                    </span>
                  )}
                </div>
              </div>
            )}

            <label className="flex items-center gap-1.5 mt-2 text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
              <input type="checkbox" checked={a.enabled} disabled={busy}
                onChange={e => void act(() => setAccountEnabled(a.id, e.target.checked))} />
              Mark for trading — recorded for when multi-account execution lands
            </label>
          </WidgetCard>
        );
      })}

      <AddAccount
        existingToken={state.accounts[0]?.token ?? null}
        alreadyAdded={state.accounts.map(a => a.accountId)}
        onAdded={() => void load()}
        busy={busy}
      />
    </div>
  );
}

/**
 * Adding an account, the way the accounts actually exist.
 *
 * The first version of this asked for a MetaAPI token every time, which is
 * wrong about how MetaAPI is organised: ONE token (one subscription) holds
 * MANY MT5 accounts. Asking for the token per account implied each was a
 * separate MetaAPI and made the common case — "add my second MT5, same
 * subscription" — the awkward one. Luka hit exactly that.
 *
 * So the default is now the token that is already here, and the accounts under
 * it are LISTED rather than typed: no account id to look up, no token to paste,
 * and ones already added are shown as such instead of silently duplicating.
 *
 * Two other routes stay available because both are real:
 *   * register a brand-new MT5 with broker credentials, still under the same
 *     token (MetaAPI stores those credentials; AXE keeps only the token and the
 *     resulting id);
 *   * paste a different token, for a genuinely separate MetaAPI subscription.
 */
function AddAccount({ existingToken, alreadyAdded, onAdded, busy }: {
  existingToken: string | null;
  alreadyAdded: string[];
  onAdded: () => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<null | 'pick' | 'register' | 'token'>(null);
  const [found, setFound] = useState<MetaApiTradingAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [reg, setReg] = useState({ label: '', login: '', password: '', server: '', region: 'london' as MetaApiRegion });
  const [manual, setManual] = useState({ label: '', token: '', accountId: '', region: 'london' as MetaApiRegion });

  const browse = async () => {
    if (!existingToken) return;
    setWorking(true); setError(null);
    const res = await metaApiListAccounts(existingToken);
    setWorking(false);
    if (!res.ok) { setError(res.error); return; }
    setFound(res.accounts);
    setMode('pick');
  };

  const addFound = async (a: MetaApiTradingAccount) => {
    const id = metaApiAccountId(a);
    if (!id || !existingToken) return;
    setWorking(true); setError(null);
    try {
    await addAccount({
      // Whatever MetaAPI already calls it beats "Account 3".
      label: a.name || `${a.login ?? ''} ${a.server ?? ''}`.trim() || id.slice(0, 8),
      token: existingToken,
      accountId: id,
      region: (a.region as MetaApiRegion) || 'london',
    });
    onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <WidgetCard title="Add an account">
      {error && <p className="text-[11px] mb-1.5" style={{ color: 'var(--warning)' }}>{error}</p>}

      {mode === null && (
        <div className="space-y-1.5">
          {existingToken && (
            <button type="button" disabled={busy || working} onClick={() => void browse()}
              className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--accent-cyan)' }}>
              {working ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Add an MT5 account from my MetaAPI
            </button>
          )}
          {existingToken && (
            <button type="button" onClick={() => setMode('register')} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
              <Plus size={12} /> Register a new MT5 with broker login
            </button>
          )}
          <button type="button" onClick={() => setMode('token')} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <Plus size={12} /> Use a different MetaAPI token
          </button>
        </div>
      )}

      {mode === 'pick' && (
        <div className="space-y-1.5">
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Accounts under your MetaAPI token. Same token, same subscription.
          </p>
          {!found?.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>None found.</p>}
          {found?.map((a, i) => {
            const id = metaApiAccountId(a);
            const have = !!id && alreadyAdded.includes(id);
            return (
              <div key={id ?? `row-${i}`} className="flex items-center gap-2 rounded px-2 py-1.5"
                style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] truncate" style={{ color: '#F5F0E6' }}>{a.name || id}</div>
                  <div className="text-[9px] font-mono-data truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {[a.login, a.server, a.region, a.state].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {have ? (
                  <span className="text-[9px] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>added</span>
                ) : (
                  <button type="button" disabled={working} onClick={() => void addFound(a)}
                    className="text-[10px] px-2 py-0.5 rounded"
                    style={{ background: 'rgba(52,211,153,0.12)', color: '#6ee7b7' }}>Add</button>
                )}
              </div>
            );
          })}
          <button type="button" onClick={() => setMode(null)} className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Back</button>
        </div>
      )}

      {mode === 'register' && (
        <div className="space-y-1.5">
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Registers a new MT5 with MetaAPI under the token already here. MetaAPI stores the broker
            credentials; AXE keeps only the token and the account id. Deploying can take a minute.
          </p>
          {(['label', 'login', 'password', 'server'] as const).map(f => (
            <input key={f} value={reg[f]} onChange={e => setReg({ ...reg, [f]: e.target.value })}
              placeholder={f === 'label' ? 'Name it — "Prop challenge"' : f === 'server' ? 'Broker server, e.g. ICMarkets-Live02' : f}
              type={f === 'password' ? 'password' : 'text'}
              className="w-full rounded px-2 py-1 text-[11px]"
              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
          ))}
          <select value={reg.region} onChange={e => setReg({ ...reg, region: e.target.value as MetaApiRegion })}
            className="w-full rounded px-2 py-1 text-[11px]"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="flex gap-2">
            <button type="button" disabled={working || !reg.login.trim() || !reg.password || !reg.server.trim()}
              onClick={() => void (async () => {
                if (!existingToken) return;
                setWorking(true); setError(null);
                const res = await metaApiProvisionAccount({
                  token: existingToken, login: reg.login, password: reg.password,
                  name: reg.label || `AXE CORE ${reg.login}`, server: reg.server, region: reg.region,
                });
                if (!res.ok) { setError(res.error); setWorking(false); return; }
                try {
                  await addAccount({ label: reg.label || reg.login, token: existingToken, accountId: res.accountId, region: reg.region });
                } catch (e) {
                  // The MT5 is registered with MetaAPI at this point; only the
                  // local list write failed. Say exactly that, so it is not
                  // registered twice.
                  setError(`Registered with MetaAPI (id ${res.accountId}) but the accounts list did not save: ${e instanceof Error ? e.message : String(e)}`);
                  setWorking(false); return;
                }
                setReg({ label: '', login: '', password: '', server: '', region: 'london' });
                setWorking(false); setMode(null); onAdded();
              })()}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px]"
              style={{ background: 'rgba(52,211,153,0.12)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.28)' }}>
              {working ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Register
            </button>
            <button type="button" onClick={() => setMode(null)} className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'token' && (
        <div className="space-y-1.5">
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Only for a separate MetaAPI subscription. For another MT5 on the token you already have,
            go back and use the first option.
          </p>
          {(['label', 'accountId', 'token'] as const).map(f => (
            <input key={f} value={manual[f]} onChange={e => setManual({ ...manual, [f]: e.target.value })}
              placeholder={f === 'label' ? 'Name it' : f === 'accountId' ? 'MetaAPI account id' : 'MetaAPI token'}
              type={f === 'token' ? 'password' : 'text'}
              className="w-full rounded px-2 py-1 text-[11px]"
              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
          ))}
          <select value={manual.region} onChange={e => setManual({ ...manual, region: e.target.value as MetaApiRegion })}
            className="w-full rounded px-2 py-1 text-[11px]"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="flex gap-2">
            <button type="button" disabled={working || !manual.token.trim() || !manual.accountId.trim()}
              onClick={() => void (async () => {
                setWorking(true); setError(null);
                try {
                  await addAccount(manual);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                  setWorking(false); return;
                }
                setManual({ label: '', token: '', accountId: '', region: 'london' });
                setWorking(false); setMode(null); onAdded();
              })()}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px]"
              style={{ background: 'rgba(52,211,153,0.12)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.28)' }}>
              <Check size={11} /> Add
            </button>
            <button type="button" onClick={() => setMode(null)} className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Cancel</button>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}
