/**
 * Every data source the desk holds a key for, and whether it actually answers.
 *
 * ## Why this exists
 *
 * Three keys sat in `cfg:research_sources` for weeks, doing real work and real
 * failing, with nothing anywhere on screen saying so. Measured 2026-08-25:
 * Perigon had been answering all day ("8 macro headlines · 9/150 this month"),
 * EODHD was refusing every call, and Massive had never once been tried. The
 * only way to find that out was to read the database by hand — which is why
 * the same keys were supplied three times, each time in the belief that they
 * had never arrived.
 *
 * ## Configured is not working
 *
 * The panel asks each provider rather than checking whether a string is
 * present. Every one of those seven keys is "configured", and asking them gave
 * four different answers:
 *
 *   Massive, Unusual Whales, SEC, TwelveData → real data
 *   EODHD    → HTTP 402, daily limit spent — the key is fine
 *   FMP      → HTTP 403, the v3 route is legacy on this plan
 *
 * "Key set" would have shown seven ticks and told you nothing. The provider's
 * own refusal is kept verbatim, because "out of quota" and "wrong endpoint"
 * need opposite fixes and a tidy summary hides which one you have.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Check, X, Minus } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import {
  RESEARCH_SOURCES, getResearchSourceKeys, researchSourceHealth, probeResearchSource,
  budgetUsedToday, type ResearchSourceKeys, type SourceHealth,
} from '@/infrastructure/gateways/researchSources';

interface Row {
  id: keyof ResearchSourceKeys;
  label: string;
  what: string;
  hasKey: boolean;
  health: SourceHealth | null;
  usedToday: number;
}

function ageOf(iso: string | undefined): string {
  if (!iso) return 'never tested';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'never tested';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function Mark({ row }: { row: Row }) {
  if (!row.hasKey) return <Minus size={11} style={{ color: 'rgba(255,255,255,0.25)' }} />;
  if (!row.health) return <Minus size={11} style={{ color: '#f59e0b' }} />;
  return row.health.ok
    ? <Check size={11} style={{ color: '#34d399' }} />
    : <X size={11} style={{ color: '#f87171' }} />;
}

export function DataSourcesPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [keys, health] = await Promise.all([
      getResearchSourceKeys().catch(() => ({} as ResearchSourceKeys)),
      researchSourceHealth().catch(() => ({} as Record<string, SourceHealth>)),
    ]);
    const next: Row[] = [];
    for (const s of RESEARCH_SOURCES) {
      next.push({
        id: s.id,
        label: s.label,
        what: s.what,
        hasKey: !!keys[s.id],
        health: health[s.id] ?? null,
        usedToday: await budgetUsedToday(s.id).catch(() => 0),
      });
    }
    setRows(next);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Sequential on purpose: seven parallel probes against seven providers is a
  // burst that some of them rate-limit, which would make the panel report a
  // problem it caused itself.
  const testAll = useCallback(async () => {
    setBusy(true);
    try {
      for (const s of RESEARCH_SOURCES) {
        await probeResearchSource(s.id).catch(() => undefined);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  const answering = rows.filter(r => r.health?.ok).length;
  const configured = rows.filter(r => r.hasKey).length;

  return (
    <WidgetCard
      title="Data sources"
      headerAction={
        <button
          type="button"
          onClick={() => void testAll()}
          disabled={busy}
          className="flex items-center gap-1 text-[10px]"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          <RefreshCw size={10} className={busy ? 'animate-spin' : ''} />
          {busy ? 'testing…' : `${answering}/${configured} answering`}
        </button>
      }
    >
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.id}>
            <div className="flex items-center gap-1.5">
              <Mark row={r} />
              <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{r.label}</span>
              {!r.hasKey && (
                <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>no key</span>
              )}
              <span className="ml-auto text-[9px] font-mono-data" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {r.usedToday > 0 ? `${r.usedToday} today · ` : ''}{ageOf(r.health?.at)}
              </span>
            </div>
            <p className="text-[9px] leading-snug pl-[18px]" style={{ color: 'rgba(255,255,255,0.32)' }}>
              {r.what}
            </p>
            {/* The provider's own words, not ours. */}
            {r.health && !r.health.ok && (
              <p className="text-[9px] leading-snug pl-[18px]" style={{ color: '#f87171' }}>
                {r.health.detail}
              </p>
            )}
            {r.health?.ok && r.health.detail && (
              <p className="text-[9px] leading-snug pl-[18px] truncate" style={{ color: 'rgba(52,211,153,0.7)' }}>
                {r.health.detail}
              </p>
            )}
          </div>
        ))}
        {!rows.length && (
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Loading sources…</p>
        )}
      </div>

      <p className="text-[9px] mt-2 pt-2" style={{ color: 'rgba(255,255,255,0.28)', borderTop: '1px solid var(--border-subtle)' }}>
        A tick means the provider answered with data just now — not that a key is present. Every key
        here is present; that is exactly what made the failures invisible.
      </p>
    </WidgetCard>
  );
}
