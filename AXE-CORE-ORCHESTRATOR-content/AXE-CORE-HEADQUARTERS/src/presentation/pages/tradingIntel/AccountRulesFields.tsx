/**
 * AccountRulesFields — de accountregels die de poort nu ook echt toepast
 * (domain/tradingIntel/accountRules). Elk veld is optioneel; leeg = de regel
 * geldt niet. Waarden gaan via `commit`, dus een wijziging maakt het profiel
 * 'custom' (applyRiskEdit) in plaats van het presetlabel te laten liegen.
 */
import { useState } from 'react';
import type { RiskProfile } from '@/domain/tradingIntel/botTypes';
import { parseSessionText } from '@/domain/tradingIntel/accountRules';

const INPUT_CLS = 'rounded px-2 py-1.5 text-[12px] w-full';
const INPUT_STYLE = { background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' } as const;
const LABEL = { color: 'rgba(255,255,255,0.4)' } as const;
const HINT = { color: 'rgba(255,255,255,0.28)' } as const;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] uppercase tracking-wide" style={LABEL}>{label}</span>
      {children}
      {hint && <span className="text-[9px]" style={HINT}>{hint}</span>}
    </label>
  );
}

/** Getal of leeg. Leeg bewaart `undefined`: de regel staat dan uit. */
function OptionalNumber({ value, onCommit, scale = 1, step = 'any', placeholder = 'off' }: {
  value: number | undefined; onCommit: (v: number | undefined) => void; scale?: number; step?: string; placeholder?: string;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(+(value * scale).toFixed(6)));
  return (
    <input
      type="number" step={step} min={0} value={draft} placeholder={placeholder}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() === '') { onCommit(undefined); return; }
        const n = parseFloat(draft);
        if (Number.isFinite(n) && n >= 0) onCommit(n / scale);
        else setDraft(value == null ? '' : String(value * scale));
      }}
      className={INPUT_CLS} style={INPUT_STYLE}
    />
  );
}

export function AccountRulesFields({ risk, commit }: { risk: RiskProfile; commit: (patch: Partial<RiskProfile>) => void }) {
  const sessions = risk.sessionWindows ?? [];
  const [sessionText, setSessionText] = useState(sessions.map(w => `${w.start}-${w.end}`).join(', '));
  const weekdaysOnly = sessions.length > 0 && sessions.every(w => w.days?.length === 5 && !w.days.includes(0) && !w.days.includes(6));

  return (
    <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))] mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[10px] col-span-full" style={LABEL}>
        Account rules — enforced by the pre-trade gate for AXE Algo and manual orders. Leave a field empty to switch the rule off.
      </p>
      <Field label="Starting balance" hint="static DD, targets">
        <OptionalNumber value={risk.initialBalance} onCommit={v => commit({ initialBalance: v })} step="1" />
      </Field>
      <Field label="Challenge start" hint="counts days & consistency">
        <input
          type="date" value={risk.startedAt?.slice(0, 10) ?? ''}
          onChange={e => commit({ startedAt: e.target.value ? new Date(`${e.target.value}T00:00:00Z`).toISOString() : undefined })}
          className={INPUT_CLS} style={INPUT_STYLE}
        />
      </Field>
      <Field label="Drawdown type" hint="static needs a starting balance">
        <select value={risk.drawdownType ?? 'trailing'} onChange={e => commit({ drawdownType: e.target.value as RiskProfile['drawdownType'] })} className={INPUT_CLS} style={INPUT_STYLE}>
          <option value="trailing">Trailing (from peak)</option>
          <option value="static">Static (from start)</option>
        </select>
      </Field>
      <Field label="Daily loss measured on">
        <select value={risk.dailyLossBase ?? 'dayStartBalance'} onChange={e => commit({ dailyLossBase: e.target.value as RiskProfile['dailyLossBase'] })} className={INPUT_CLS} style={INPUT_STYLE}>
          <option value="dayStartBalance">Day-start balance</option>
          <option value="initialBalance">Starting balance</option>
        </select>
      </Field>
      <Field label="Risk % of" hint="money lost at the stop">
        <select value={risk.sizingBase ?? 'equity'} onChange={e => commit({ sizingBase: e.target.value as RiskProfile['sizingBase'] })} className={INPUT_CLS} style={INPUT_STYLE}>
          <option value="equity">Equity</option>
          <option value="balance">Balance</option>
          <option value="initialBalance">Starting balance</option>
        </select>
      </Field>
      <Field label="Day resets in" hint="IANA zone, e.g. Europe/Prague">
        <input
          defaultValue={risk.resetTimezone ?? 'UTC'}
          onBlur={e => {
            const tz = e.target.value.trim() || 'UTC';
            try { new Intl.DateTimeFormat('en', { timeZone: tz }); commit({ resetTimezone: tz }); }
            catch { e.target.value = risk.resetTimezone ?? 'UTC'; }
          }}
          className={INPUT_CLS} style={INPUT_STYLE}
        />
      </Field>
      <Field label="Max open positions">
        <OptionalNumber value={risk.maxConcurrentPositions} onCommit={v => commit({ maxConcurrentPositions: v == null ? undefined : Math.round(v) })} step="1" />
      </Field>
      <Field label="Daily profit target %" hint="stop for the day">
        <OptionalNumber value={risk.dailyProfitTargetPct} scale={100} onCommit={v => commit({ dailyProfitTargetPct: v })} />
      </Field>
      <Field label="Profit target %" hint="of starting balance">
        <OptionalNumber value={risk.profitTargetPct} scale={100} onCommit={v => commit({ profitTargetPct: v })} />
      </Field>
      <Field label="On profit target">
        <select value={risk.profitTargetAction ?? (risk.mode === 'funded_challenge' ? 'halt' : 'continue')} onChange={e => commit({ profitTargetAction: e.target.value as RiskProfile['profitTargetAction'] })} className={INPUT_CLS} style={INPUT_STYLE}>
          <option value="halt">Stop opening</option>
          <option value="continue">Keep trading</option>
        </select>
      </Field>
      <Field label="Consistency %" hint="best day ≤ % of total profit">
        <OptionalNumber value={risk.consistencyPct} scale={100} onCommit={v => commit({ consistencyPct: v })} />
      </Field>
      <Field label="Min trading days">
        <OptionalNumber value={risk.minTradingDays} onCommit={v => commit({ minTradingDays: v == null ? undefined : Math.round(v) })} step="1" />
      </Field>
      <Field label="Sessions" hint="e.g. 08:00-17:00, in reset zone">
        <input
          value={sessionText} placeholder="always"
          onChange={e => setSessionText(e.target.value)}
          onBlur={() => commit({ sessionWindows: parseSessionText(sessionText, weekdaysOnly) })}
          className={INPUT_CLS} style={INPUT_STYLE}
        />
      </Field>
      <label className="flex items-center gap-2 self-end pb-1.5">
        <input type="checkbox" checked={weekdaysOnly} disabled={!sessions.length}
          onChange={e => commit({ sessionWindows: parseSessionText(sessionText, e.target.checked) })} />
        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>Weekdays only</span>
      </label>
      <label className="flex items-center gap-2 self-end pb-1.5" title="US high-impact releases only; date granularity (FRED)">
        <input type="checkbox" checked={risk.newsRestriction === 'high_impact_day'}
          onChange={e => commit({ newsRestriction: e.target.checked ? 'high_impact_day' : 'off' })} />
        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>No opens on US high-impact release days</span>
      </label>
    </div>
  );
}
