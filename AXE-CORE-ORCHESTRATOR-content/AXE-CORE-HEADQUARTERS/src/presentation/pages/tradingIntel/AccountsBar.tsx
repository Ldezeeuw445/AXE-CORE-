/**
 * Which accounts are actually trading, as buttons you can see and toggle.
 *
 * The strip above showed one equity figure, so three enabled accounts and one
 * enabled account looked identical — which is why "it stays on one" was the
 * standing impression even after the fan-out was wired and all three answered
 * MetaAPI with real balances.
 *
 * There is a second, sharper reason to show it. tradeableAccounts() returns
 * NOTHING below two enabled accounts, and the autopilot then quietly falls
 * back to the single active one. That threshold is invisible in the data and
 * catastrophic to reason about: switch one account off and the other two stop
 * being used, with no error anywhere. It is stated here, in the place where
 * the switching happens.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  getAccounts, setAccountEnabled, type TradingAccount,
} from '@/infrastructure/persistence/tradingAccountsService';

export function AccountsBar() {
  const [accounts, setAccounts] = useState<TradingAccount[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const state = await getAccounts().catch(() => null);
    setAccounts(state?.accounts ?? []);
  };

  // Deferred by a tick: calling load() straight from the effect body sets
  // state synchronously during the same render pass, which cascades. The
  // same pattern AgentOverviewPanel uses.
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, []);

  const toggle = async (a: TradingAccount) => {
    setBusy(a.id);
    try {
      await setAccountEnabled(a.id, !a.enabled);
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (!accounts) return null;

  const on = accounts.filter(a => a.enabled);
  // Mirrors tradeableAccounts(): below two, the fan-out returns nothing and
  // the autopilot uses the single active account instead.
  const fanningOut = on.length >= 2;

  return (
    <div className="flex items-center gap-2 flex-wrap px-3 py-2 rounded-lg"
         style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span className="text-[9px] font-mono-data tracking-[0.16em] uppercase"
            style={{ color: 'rgba(255,255,255,0.35)' }}>
        Trading on
      </span>

      {accounts.length === 0 && (
        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          No accounts added yet.
        </span>
      )}

      {accounts.map(a => (
        <button
          key={a.id}
          type="button"
          disabled={busy === a.id}
          onClick={() => void toggle(a)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] transition-colors"
          style={{
            background: a.enabled ? 'rgba(52,211,153,0.14)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${a.enabled ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: a.enabled ? '#6ee7b7' : 'rgba(255,255,255,0.4)',
          }}
        >
          {busy === a.id
            ? <Loader2 size={10} className="animate-spin" />
            : <span className="w-1.5 h-1.5 rounded-full"
                    style={{ background: a.enabled ? '#34d399' : 'rgba(255,255,255,0.25)' }} />}
          {a.label}
        </button>
      ))}

      {accounts.length > 0 && (
        <span className="text-[10px] ml-auto" style={{ color: fanningOut ? 'rgba(255,255,255,0.4)' : '#f59e0b' }}>
          {fanningOut
            ? `${on.length} accounts · every decision runs on each`
            : 'One account: decisions run on the active account only. Enable a second to fan out.'}
        </span>
      )}
    </div>
  );
}
