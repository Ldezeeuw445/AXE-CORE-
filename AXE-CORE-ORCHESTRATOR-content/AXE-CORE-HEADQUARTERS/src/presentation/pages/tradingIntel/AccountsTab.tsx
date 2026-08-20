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
import { Loader2, Plus, RefreshCw, Trash2, Check } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import {
  getAccounts, addAccount, removeAccount, activateAccount, setAccountEnabled,
  maskToken, type TradingAccount, type AccountsState,
} from '@/infrastructure/persistence/tradingAccountsService';
import { metaApiAccountInfoFor, metaApiPositionsFor, type MetaApiRegion } from '@/infrastructure/gateways/metaApiService';

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
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: '', token: '', accountId: '', region: 'london' as MetaApiRegion });

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
    const s = await getAccounts();
    setState(s);
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
    try { setState(await fn()); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <WidgetCard
        title="Broker accounts"
        headerAction={
          <button type="button" onClick={() => void load()} className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
            <RefreshCw size={10} /> Refresh
          </button>
        }
      >
        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          AXE Algo trades the <span style={{ color: '#22d3ee' }}>active</span> account. Others are read-only
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
                    style={{ color: '#22d3ee', background: 'rgba(34,211,238,0.10)' }}>active</span>
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
              <div className="text-[11px] mt-1.5" style={{ color: '#f59e0b' }} title={l.reason}>
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
                    <span style={{ color: l.floating >= 0 ? '#34d399' : '#f87171' }}>
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

      <WidgetCard title="Add an account">
        {!adding ? (
          <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-[11px]" style={{ color: '#22d3ee' }}>
            <Plus size={12} /> Add a broker account
          </button>
        ) : (
          <div className="space-y-1.5">
            {(['label', 'accountId', 'token'] as const).map(f => (
              <input
                key={f}
                value={form[f]}
                onChange={e => setForm({ ...form, [f]: e.target.value })}
                placeholder={f === 'label' ? 'Name it — "Prop challenge"' : f === 'accountId' ? 'MetaAPI account id' : 'MetaAPI token'}
                type={f === 'token' ? 'password' : 'text'}
                className="w-full rounded px-2 py-1 text-[11px]"
                style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
              />
            ))}
            <select
              value={form.region}
              onChange={e => setForm({ ...form, region: e.target.value as MetaApiRegion })}
              className="w-full rounded px-2 py-1 text-[11px]"
              style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
            >
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !form.token.trim() || !form.accountId.trim()}
                onClick={() => void act(async () => {
                  const s = await addAccount(form);
                  setForm({ label: '', token: '', accountId: '', region: 'london' });
                  setAdding(false);
                  void load();
                  return s;
                })}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px]"
                style={{ background: 'rgba(52,211,153,0.12)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.28)' }}
              >
                <Check size={11} /> Add
              </button>
              <button type="button" onClick={() => setAdding(false)} className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </WidgetCard>
    </div>
  );
}
