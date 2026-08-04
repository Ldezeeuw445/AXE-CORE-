/**
 * Data plane panel — the agent's toolbox, made legible.
 *
 * Two things are deliberately visible here rather than hidden in logs:
 *   1. which tools the agent *can* reach right now (green) vs. which are
 *      waiting on an API key (dim), so an unexplained decision can always be
 *      traced back to "it couldn't see that data";
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
    void load();
  }, [load]);

  const ready = tools.filter(t => t.configured);
  const waiting = tools.filter(t => !t.configured);

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
            {ready.length}/{tools.length} live
          </button>
        }
      >
        {error ? (
          <p className="text-[11px]" style={{ color: '#f87171' }}>{error}</p>
        ) : (
          <div className="space-y-1.5">
            {ready.map(t => (
              <ToolRow key={t.name} tool={t} live />
            ))}
            {waiting.length > 0 && (
              <>
                <p className="text-[9px] uppercase tracking-wider pt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Waiting on API key
                </p>
                {waiting.map(t => (
                  <ToolRow key={t.name} tool={t} live={false} />
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
                    note={r.ok ? undefined : r.error ?? undefined}
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
              {!brief.calendar.ok && <Empty>{brief.calendar.error}</Empty>}
            </Section>

            <Section label="News">
              {((brief.news.data as NewsItem[] | null) ?? []).slice(0, 4).map((n, i) => (
                <Line key={i} left={n.title} right={n.source ?? ''} />
              ))}
              {!brief.news.ok && <Empty>{brief.news.error}</Empty>}
            </Section>

            <Section label="Crowd bias">
              {((brief.crowd_bias.data as BiasMarket[] | null) ?? []).slice(0, 3).map((m, i) => (
                <Line key={i} left={m.question} right={formatOdds(m.outcomePrices)} />
              ))}
              {!brief.crowd_bias.ok && <Empty>{brief.crowd_bias.error}</Empty>}
            </Section>
          </div>
        )}
      </WidgetCard>
    </div>
  );
}

function ToolRow({ tool, live }: { tool: MarketTool; live: boolean }) {
  return (
    <div className="flex items-start gap-1.5" title={tool.description}>
      {live ? (
        <Check size={10} className="mt-0.5 shrink-0" style={{ color: '#6ee7b7' }} />
      ) : (
        <AlertTriangle size={10} className="mt-0.5 shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
      )}
      <span
        className="text-[11px] font-mono-data"
        style={{ color: live ? '#F5F0E6' : 'rgba(255,255,255,0.3)' }}
      >
        {tool.name}
      </span>
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

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
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
