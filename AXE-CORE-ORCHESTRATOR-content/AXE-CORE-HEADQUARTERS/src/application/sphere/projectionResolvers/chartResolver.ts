/**
 * chartResolver — application layer.
 * Builds chart ProjectionPayload from real app data when possible.
 * Presentation never fetches; it only renders the payload.
 */
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { projectionFromResolved } from '@/application/sphere/sphereDirector';
import {
  listIncomeEntries,
  summarizeIncome,
  INCOME_SOURCES,
} from '@/infrastructure/persistence/incomeLedgerService';

export type ChartPoint = { label: string; value: number };

/** Prefer real income-by-source; fall back to mild synthetic series. */
export async function resolveChart(query?: string): Promise<ProjectionPayload> {
  try {
    const entries = await listIncomeEntries();
    if (entries.length > 0) {
      const sum = summarizeIncome(entries);
      const series: ChartPoint[] = Object.entries(sum.bySource)
        .map(([source, v]) => ({
          label: INCOME_SOURCES.find(s => s.id === source)?.label ?? source,
          value: Math.round(v.amount * 100) / 100,
        }))
        .sort((a, b) => b.value - a.value);

      if (series.length) {
        return projectionFromResolved({
          mode: 'chart',
          title: 'Income by source',
          subtitle: `This month ${sum.thisMonth.toFixed(2)} ${sum.currency} · total ${sum.total.toFixed(2)}`,
          text: query?.trim() || undefined,
          data: { series, currency: sum.currency, source: 'income_ledger' },
          source: 'director',
        });
      }
    }
  } catch {
    /* fall through */
  }

  // Deterministic fallback (not random) so UX stays stable
  const series: ChartPoint[] = [
    { label: 'Mon', value: 42 },
    { label: 'Tue', value: 55 },
    { label: 'Wed', value: 48 },
    { label: 'Thu', value: 70 },
    { label: 'Fri', value: 63 },
    { label: 'Sat', value: 80 },
    { label: 'Sun', value: 74 },
  ];
  return projectionFromResolved({
    mode: 'chart',
    title: 'Chart',
    subtitle: 'Sample series · log income for live data',
    text: query?.trim() || undefined,
    data: { series, source: 'sample' },
    source: 'director',
  });
}

/** Build chart payload from arbitrary numeric rows (tools / DB). */
export function resolveChartFromSeries(
  series: ChartPoint[],
  meta?: { title?: string; subtitle?: string; text?: string },
): ProjectionPayload {
  return projectionFromResolved({
    mode: 'chart',
    title: meta?.title || 'Chart',
    subtitle: meta?.subtitle,
    text: meta?.text,
    data: { series, source: 'resolved' },
    source: 'tool',
  });
}
