/**
 * Data plane panel — the agent's toolbox, made legible.
 *
 * Two things are deliberately visible here rather than hidden in logs:
 *   1. which tools the agent *can* reach right now (green) vs. which are
 *      waiting on an API key (dim), so an unexplained decision can always be
 *      traced back to "it couldn't see that data";
 *
 *      "Live" used to mean `configured` -- a key exists on the VPS -- which is
 *      not the same claim and was wrong on screen: the header read "5/5 live"
 *      while the panel directly below it printed
 *      `Finnhub calendar HTTP 403: {"error":"You don't have access to this
 *      resource."}`. The key was fine; the plan does not include that endpoint.
 *      A tool with a key that refuses to answer is the most misleading state
 *      there is, because it looks identical to a working one. So the count is
 *      now of tools that actually ANSWERED in the brief beside it, and a
 *      configured-but-refusing tool gets its own amber row.
 *   2. the actual macro/news/calendar context it starts every cycle from.
 *
 * Keys themselves never reach the browser — the VPS holds them and only
 * reports a boolean `configured` per tool.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, RefreshCw } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import {
  marketBrief,
  marketToolCatalog,
  type MacroBrief,
  type MarketTool,
} from '@/infrastructure/gateways/axeCoreApiService';

type FredObs = { date: string; value: string };
type CalendarEvent = { event: string; date: string; impact?: string; country?: string };
type NewsItem = { title: string; url?: string; source?: string; sentiment?: unknown };
type BiasMarket = { question: string; outcomePrices?: string };

/**
 * A provider's raw error is not a sentence.
 *
 * The calendar row rendered this, verbatim, on the phone:
 *   Finnhub calendar HTTP 403: {"error":"You don't have access to this resource."}
 *
 * Which is JSON in a UI, and worse, it reads as "broken" when the actual
 * meaning is "this endpoint is not on your Finnhub plan" -- nothing to debug,
 * a billing fact. The status code is the part that carries meaning, so lead
 * with what it means and keep the original as the tooltip.
 */
function humanError(raw?: string | null): { text: string; title?: string } {
  if (!raw) return { text: 'No data' };
  const code = raw.match(/\b(4\d{2}|5\d{2})\b/)?.[1];
  const by: Record<string, string> = {
    '401': 'Key rejected — check it in Settings',
    '403': 'Not included in this plan',
    '404': 'Not carried for this symbol',
    '429': 'Rate limit reached — it will retry',
    '500': 'Provider error — not ours',
    '502': 'Provider unreachable',
    '503': 'Provider temporarily down',
  };
  if (code && by[code]) return { text: `${by[code]} (${code})`, title: raw };
  // Unrecognised: still strip an embedded JSON blob rather than printing it.
  const cleaned = raw.replace(/\{.*\}/s, '').trim().replace(/[:\s-]+$/, '');
  return { text: cleaned || 'Unavailable', title: raw };
}

const MACRO_LABEL: Record<string, string> = {
  real_yield_10y: 'Real yield 10Y',
  dxy: 'Dollar index',
  fed_funds: 'Fed funds',
};

export function DataPlanePanel({ symbol }: { symbol: string }) {
  const [tools, setTools] = useState<MarketTool[]>([]);
  const [brief, setBrief] = useState<MacroBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cat, br] = await Promise.all([
        marketToolCatalog(),
        marketBrief(symbol).catch(() => null),
      ]);
      setTools(cat.tools);
      setBrief(br);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    // load() calls setLoading synchronously as its first statement — calling
    // it directly here would mean an effect synchronously triggering
    // setState (react-hooks/set-state-in-effect). Deferring one tick keeps
    // the same "fetch on mount / on symbol change" behavior without that.
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Which brief section each tool feeds, so "did it answer?" can be read off
  // the same response the panel below already renders. A tool absent from this
  // map is simply not exercised by the brief -- it keeps its key state and is
  // never counted as answering, because nothing here proves it did.
  const SECTION_OF: Record<string, 'macro' | 'calendar' | 'news' | 'crowd_bias'> = {
    fred_macro: 'macro',
    finnhub_calendar: 'calendar',
    finnhub_news: 'news',
    polymarket_bias: 'crowd_bias',
  };

  const answered = (name: string): boolean | null => {
    const section = SECTION_OF[name];
    if (!section || !brief) return null;
    if (section === 'macro') {
      const rows = Object.values(brief.macro ?? {});
      return rows.length ? rows.some(r => r.ok) : null;
    }
    return brief[section]?.ok ?? null;
  };

  const state = (t: MarketTool): 'live' | 'refusing' | 'unproven' | 'nokey' => {
    if (!t.configured) return 'nokey';
    const a = answered(t.name);
    return a === null ? 'unproven' : a ? 'live' : 'refusing';
  };

  const ready = tools.filter(t => state(t) === 'live');
  const refusing = tools.filter(t => state(t) === 'refusing');
  const unproven = tools.filter(t => state(t) === 'unproven');
  const waiting = tools.filter(t => state(t) === 'nokey');

  return (
    <div className="space-y-3">
      <WidgetCard
        title="Agent toolbox"
        headerAction={
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1 text-[10px]"
            style={{ color: 'rgba(255,255,255,0.45)' }}
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
            {ready.length}/{tools.length} answering
          </button>
        }
      >
        {error ? (
          <p className="text-[11px]" style={{ color: '#f87171' }}>{error}</p>
        ) : (
          <div className="space-y-1.5">
            {ready.map(t => (
              <ToolRow key={t.name} tool={t} state="live" />
            ))}
            {refusing.length > 0 && (
              <>
                <p className="text-[9px] uppercase tracking-wider pt-1.5" style={{ color: 'rgba(245,158,11,0.7)' }}>
                  Key accepted, data refused
                </p>
                {refusing.map(t => (
                  <ToolRow key={t.name} tool={t} state="refusing" />
                ))}
              </>
            )}
            {unproven.map(t => (
              <ToolRow key={t.name} tool={t} state="unproven" />
            ))}
            {waiting.length > 0 && (
              <>
                <p className="text-[9px] uppercase tracking-wider pt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Waiting on API key
                </p>
                {waiting.map(t => (
                  <ToolRow key={t.name} tool={t} state="nokey" />
                ))}
              </>
            )}
            {!tools.length && !loading && (
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Data plane unreachable — check the VPS.
              </p>
            )}
          </div>
        )}
      </WidgetCard>

      <WidgetCard title={`Decision context · ${symbol}`}>
        {loading && !brief ? (
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <Loader2 size={12} className="animate-spin" /> Building context…
          </div>
        ) : !brief ? (
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            No context yet — add provider keys on the VPS to populate this.
          </p>
        ) : (
          <div className="space-y-2.5">
            <Section label="Macro">
              {Object.entries(brief.macro).map(([k, r]) => {
                const obs = (r.data as { observations?: FredObs[] } | null)?.observations;
                const latest = obs?.[0];
                return (
                  <Line
                    key={k}
                    left={MACRO_LABEL[k] ?? k}
                    right={latest ? latest.value : '—'}
                    sub={latest?.date}
                    muted={!r.ok}
                    note={r.ok ? undefined : humanError(r.error).text}
                  />
                );
              })}
            </Section>

            <Section label="Upcoming events">
              {((brief.calendar.data as CalendarEvent[] | null) ?? [])
                .filter(e => (e.impact ?? '').toLowerCase() === 'high')
                .slice(0, 4)
                .map((e, i) => (
                  <Line key={i} left={e.event} right={e.country ?? ''} sub={e.date} warn />
                ))}
              {brief.calendar.ok &&
                !((brief.calendar.data as CalendarEvent[] | null) ?? []).some(
                  e => (e.impact ?? '').toLowerCase() === 'high',
                ) && <Empty>No high-impact events in window</Empty>}
              {!brief.calendar.ok && <Empty title={humanError(brief.calendar.error).title}>{humanError(brief.calendar.error).text}</Empty>}
            </Section>

            <Section label="News">
              {((brief.news.data as NewsItem[] | null) ?? []).slice(0, 4).map((n, i) => (
                <Line key={i} left={n.title} right={n.source ?? ''} />
              ))}
              {!brief.news.ok && <Empty title={humanError(brief.news.error).title}>{humanError(brief.news.error).text}</Empty>}
            </Section>

            <Section label="Crowd bias">
              {((brief.crowd_bias.data as BiasMarket[] | null) ?? []).slice(0, 3).map((m, i) => (
                <Line key={i} left={m.question} right={formatOdds(m.outcomePrices)} />
              ))}
              {!brief.crowd_bias.ok && <Empty title={humanError(brief.crowd_bias.error).title}>{humanError(brief.crowd_bias.error).text}</Empty>}
            </Section>
          </div>
        )}
      </WidgetCard>
    </div>
  );
}

function ToolRow({ tool, state }: { tool: MarketTool; state: 'live' | 'refusing' | 'unproven' | 'nokey' }) {
  const look = {
    live: { icon: '#6ee7b7', text: '#F5F0E6', note: '' },
    refusing: { icon: '#f59e0b', text: '#F5F0E6', note: 'answered with an error' },
    unproven: { icon: 'rgba(255,255,255,0.45)', text: 'rgba(255,255,255,0.6)', note: 'key set, not used here' },
    nokey: { icon: 'rgba(255,255,255,0.25)', text: 'rgba(255,255,255,0.3)', note: '' },
  }[state];
  return (
    <div className="flex items-start gap-1.5" title={look.note ? `${tool.description} — ${look.note}` : tool.description}>
      {state === 'live' ? (
        <Check size={10} className="mt-0.5 shrink-0" style={{ color: look.icon }} />
      ) : (
        <AlertTriangle size={10} className="mt-0.5 shrink-0" style={{ color: look.icon }} />
      )}
      <span className="text-[11px] font-mono-data" style={{ color: look.text }}>{tool.name}</span>
      {look.note && (
        <span className="text-[9px] ml-auto shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>{look.note}</span>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Line({
  left,
  right,
  sub,
  muted,
  warn,
  note,
}: {
  left: string;
  right?: string;
  sub?: string;
  muted?: boolean;
  warn?: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-baseline gap-2" title={note}>
      <span
        className="text-[11px] truncate flex-1"
        style={{ color: muted ? 'rgba(255,255,255,0.28)' : warn ? '#fbbf24' : 'rgba(255,255,255,0.72)' }}
      >
        {left}
      </span>
      {right ? (
        <span className="text-[11px] font-mono-data shrink-0" style={{ color: '#F5F0E6' }}>
          {right}
        </span>
      ) : null}
      {sub ? (
        <span className="text-[9px] shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {sub}
        </span>
      ) : null}
    </div>
  );
}

function Empty({ children, title }: { children: React.ReactNode; title?: string }) {
  // `title` carries the provider's original message, so the raw text is one
  // hover away without being the thing on screen.
  return (
    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.28)' }} title={title}>
      {children}
    </p>
  );
}

/** Polymarket returns outcomePrices as a JSON-encoded string array. */
function formatOdds(raw?: string): string {
  if (!raw) return '';
  try {
    const arr = JSON.parse(raw) as string[];
    const yes = Number(arr[0]);
    return Number.isFinite(yes) ? `${(yes * 100).toFixed(0)}%` : '';
  } catch {
    return '';
  }
}
