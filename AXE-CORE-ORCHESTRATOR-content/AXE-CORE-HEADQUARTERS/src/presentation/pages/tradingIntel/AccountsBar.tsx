/**
 * Which accounts are actually trading, as buttons you can see and toggle —
 * plus a way to run one of them on its own.
 *
 * The strip above showed one equity figure, so three enabled accounts and one
 * enabled account looked identical — which is why "it stays on one" was the
 * standing impression even after the fan-out was wired and all three answered
 * MetaAPI with real balances.
 *
 * This used to carry a warning that below two enabled accounts the fan-out
 * returned nothing and the autopilot quietly fell back to the active account.
 * That threshold is gone: `tradeableAccounts()` now returns every enabled
 * account, however many, so one account enabled means that account trades.
 *
 * The run button answers the other half. Toggling two accounts off to test the
 * third is not "trading one on its own" — it is changing what the desk does
 * and having to remember to change it back. The button runs a full cycle
 * against one account and leaves every switch exactly as it was.
 */
import { useEffect, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import {
  getAccounts, setAccountEnabled, type TradingAccount,
} from '@/infrastructure/persistence/tradingAccountsService';
import { runCycleForAccount } from '@/application/tradingIntel/agentAutopilot';

export function AccountsBar() {
  const [accounts, setAccounts] = useState<TradingAccount[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

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

  const runOne = async (a: TradingAccount) => {
    setRunning(a.id);
    setNote(null);
    try {
      const result = await runCycleForAccount(a.id);
      setNote({ text: result, bad: false });
    } catch (e) {
      // Shown, not swallowed. The two things that stop this — another cycle
      // already running, or an account with no token — are both fixable, and
      // both are invisible if the button just goes quiet.
      setNote({ text: e instanceof Error ? e.message : String(e), bad: true });
    } finally {
      setRunning(null);
    }
  };

  if (!accounts) return null;

  const on = accounts.filter(a => a.enabled);
  const anyRunning = running !== null;

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 rounded-lg"
         style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 flex-wrap">
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
          <span key={a.id} className="flex items-center rounded-full"
                style={{
                  background: a.enabled ? 'rgba(52,211,153,0.14)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${a.enabled ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}`,
                }}>
            <button
              type="button"
              disabled={busy === a.id}
              onClick={() => void toggle(a)}
              title={a.enabled ? 'Trading — click to stop including it' : 'Not trading — click to include it'}
              className="flex items-center gap-1.5 pl-2.5 pr-2 py-1 text-[11px] transition-colors"
              style={{ color: a.enabled ? '#6ee7b7' : 'rgba(255,255,255,0.4)' }}
            >
              {busy === a.id
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <span className="w-1.5 h-1.5 rounded-full"
                        style={{ background: a.enabled ? 'var(--success)' : 'rgba(255,255,255,0.25)' }} />}
              {a.label}
            </button>
            <button
              type="button"
              // Disabled while ANY account is running, not just this one: the
              // cycle guard is global, so a second click could only ever be
              // refused — better to show that than to let it be pressed.
              disabled={anyRunning}
              onClick={() => void runOne(a)}
              title={`Run one cycle on ${a.label} alone, without changing any switch`}
              className="flex items-center px-1.5 py-1 rounded-r-full transition-colors disabled:opacity-40"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              {running === a.id
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Play className="w-3 h-3" />}
            </button>
          </span>
        ))}

        {accounts.length > 0 && (
          <span className="text-[10px] ml-auto" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {on.length === 0
              ? 'None enabled — the scheduled cycle will not trade.'
              : on.length === 1
                ? '1 account · every decision runs on it'
                : `${on.length} accounts · every decision runs on each`}
          </span>
        )}
      </div>

      {note && (
        <span className="text-[10px] leading-snug break-words"
              style={{ color: note.bad ? 'var(--warning)' : 'rgba(255,255,255,0.45)' }}>
          {note.text}
        </span>
      )}
    </div>
  );
}
