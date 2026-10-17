/**
 * LseVaultTab — what London Strategic Edge actually holds, and a read of any
 * slice of it.
 *
 * ## Why this tab exists at all
 *
 * The desk had no historical dataset. Every other source here answers "what is
 * true now": TwelveData's last candles, Perigon's headlines, Unusual Whales'
 * flow. None of them answer "and how did this behave the last six times". LSE
 * is 30 years, 118,000 datasets and options with greeks, so this is a category
 * the desk did not have rather than a better version of one it did.
 *
 * ## Why it shows the tick count and the last tick
 *
 * A catalogue that lists a symbol tells you nothing about whether the data
 * behind it is usable. Verified 2026-09-10 through this exact path: BTC/USD
 * carries 4,118,371,543 ticks from 2017-08-17 to that morning. A row with nine
 * years and four billion ticks and a row with three months of gaps look
 * identical in a plain symbol list, and you find out which one you had after
 * the backtest.
 *
 * ## What may be built on this
 *
 * LSE permit their data in your own research, models and internal work
 * including commercially, and forbid making it available to third parties.
 * AXE Core is one operator. Nothing on this screen may be lifted into Companion
 * or Trading OS, which have paying subscribers, until LSE answer on an
 * enterprise licence — and derived conclusions are the arguable case, raw rows
 * like these are not.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search, Database } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { lseCatalog, lseCandles, lseSeries, type LseResult } from '@/infrastructure/gateways/lseGateway';

/** One catalogue row. Fields are whatever the vault returns; all optional. */
interface CatalogRow {
  dataset?: string;
  symbol?: string;
  name?: string;
  ticks?: number;
  first_tick?: string;
  last_tick?: string;
  years?: number;
  last_value?: number;
  change_pct?: number;
  change_1y?: number;
}

type Mode = 'catalog' | 'candles' | 'series';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'catalog', label: 'Catalogue', hint: 'search by symbol or name' },
  { id: 'candles', label: 'Candles', hint: 'exact symbol, e.g. BTC/USD' },
  { id: 'series', label: 'Macro series', hint: 'series id — 100+ countries' },
];

function rowsOf(data: unknown): CatalogRow[] {
  if (Array.isArray(data)) return data as CatalogRow[];
  const wrapped = data as { datasets?: unknown; rows?: unknown; data?: unknown } | null;
  for (const k of ['datasets', 'rows', 'data'] as const) {
    if (wrapped && Array.isArray(wrapped[k])) return wrapped[k] as CatalogRow[];
  }
  return [];
}

function compactNumber(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function day(iso: string | undefined): string {
  return iso ? String(iso).slice(0, 10) : '—';
}

export function LseVaultTab() {
  const [mode, setMode] = useState<Mode>('catalog');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState<number | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    setRaw(null);
    const started = Date.now();

    let res: LseResult;
    if (mode === 'catalog') {
      res = await lseCatalog(query.trim() ? { search: query.trim(), limit: 60 } : { limit: 60 });
    } else if (mode === 'candles') {
      if (!query.trim()) {
        setBusy(false);
        setError('Candles need an exact symbol. Find one in the catalogue first.');
        return;
      }
      res = await lseCandles({ symbol: query.trim(), limit: 60 });
    } else {
      if (!query.trim()) {
        setBusy(false);
        setError('A macro series needs its id.');
        return;
      }
      res = await lseSeries({ series: query.trim() });
    }

    setMs(Date.now() - started);
    setBusy(false);

    if (!res.ok) {
      // The proxy passes LSE's own refusal through whole: "429 rate limit" and
      // "401 bad key" need opposite fixes, and a tidy message hides which one.
      setError(res.detail ? `${res.error} — ${res.detail}` : (res.error ?? 'unknown error'));
      setRows([]);
      return;
    }

    const parsed = rowsOf(res.data);
    setRows(parsed);
    if (parsed.length === 0) {
      setRaw(JSON.stringify(res.data ?? {}, null, 2).slice(0, 4000));
    }
  }, [mode, query]);

  // The catalogue on open, so the tab is never an empty box with a button.
  useEffect(() => {
    void run();
    // Deliberately once: re-running on every keystroke would spend the hourly
    // download budget on typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <WidgetCard title="London Strategic Edge" icon={<Database className="h-4 w-4" />}>
        <p className="text-[12px] leading-relaxed text-tos-muted">
          30 years of history, options with greeks, futures, bond yields, and
          14,640 macro series across 100+ countries — the part FRED cannot give,
          being US-only. Reached through the VPS backend, which holds the key.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-lg border px-3 py-1.5 text-[12px] transition-colors ${
                mode === m.id
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                  : 'border-white/10 bg-white/[0.02] text-tos-muted hover:bg-white/[0.05]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tos-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
              placeholder={MODES.find((m) => m.id === mode)?.hint}
              className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-[13px] text-tos-text placeholder:text-tos-dim focus:border-cyan-400/40 focus:outline-none"
            />
          </div>
          <button
            onClick={() => void run()}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-[12px] text-tos-text hover:bg-white/[0.08] disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Reading' : 'Read'}
          </button>
        </div>

        {ms !== null && !busy ? (
          <p className="mt-2 font-mono text-[10px] text-tos-dim">
            {rows.length} row{rows.length === 1 ? '' : 's'} · {ms} ms
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-red-400/25 bg-red-500/[0.07] px-3 py-2.5 font-mono text-[11px] leading-relaxed text-red-200/90">
            {error}
          </p>
        ) : null}
      </WidgetCard>

      {rows.length > 0 ? (
        <WidgetCard title={mode === 'catalog' ? 'Catalogue' : mode === 'candles' ? 'Candles' : 'Series'}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wider text-tos-dim">
                  {mode === 'catalog' ? (
                    <>
                      <th className="py-2 pr-3">Symbol</th>
                      <th className="py-2 pr-3">Dataset</th>
                      <th className="py-2 pr-3 text-right">Ticks</th>
                      <th className="py-2 pr-3 text-right">Years</th>
                      <th className="py-2 pr-3">Range</th>
                      <th className="py-2 text-right">1y</th>
                    </>
                  ) : (
                    Object.keys(rows[0] ?? {}).slice(0, 7).map((k) => (
                      <th key={k} className="py-2 pr-3">{k}</th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 60).map((r, i) => (
                  <tr key={i} className="border-b border-white/[0.04] last:border-0">
                    {mode === 'catalog' ? (
                      <>
                        <td className="py-2 pr-3 font-mono text-tos-text">{r.symbol ?? '—'}</td>
                        <td className="py-2 pr-3 text-tos-muted">{r.dataset ?? '—'}</td>
                        <td className="py-2 pr-3 text-right font-mono tabular-nums text-tos-warm/90">
                          {compactNumber(r.ticks)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono tabular-nums text-tos-muted">
                          {typeof r.years === 'number' ? r.years.toFixed(1) : '—'}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-tos-dim">
                          {day(r.first_tick)} → {day(r.last_tick)}
                        </td>
                        <td
                          className={`py-2 text-right font-mono tabular-nums ${
                            typeof r.change_1y === 'number'
                              ? r.change_1y >= 0 ? 'text-emerald-300/90' : 'text-red-300/90'
                              : 'text-tos-dim'
                          }`}
                        >
                          {typeof r.change_1y === 'number' ? `${r.change_1y.toFixed(1)}%` : '—'}
                        </td>
                      </>
                    ) : (
                      Object.keys(rows[0] ?? {}).slice(0, 7).map((k) => (
                        <td key={k} className="py-2 pr-3 font-mono text-tos-muted">
                          {String((r as Record<string, unknown>)[k] ?? '—').slice(0, 28)}
                        </td>
                      ))
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WidgetCard>
      ) : null}

      {raw ? (
        <WidgetCard title="Answered, but not in a shape this table knows">
          <p className="mb-2 text-[11px] text-tos-muted">
            Shown whole rather than summarised — a vault route that changes its
            envelope should be visible, not silently rendered as empty.
          </p>
          <pre className="max-h-80 overflow-auto rounded-lg bg-black/40 p-3 font-mono text-[10px] leading-relaxed text-tos-muted">
            {raw}
          </pre>
        </WidgetCard>
      ) : null}
    </div>
  );
}
