/**
 * chartResolver — application layer.
 * Builds chart ProjectionPayload from real app data when possible.
 */
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import {
  listIncomeEntries,
  summarizeIncome,
  INCOME_SOURCES,
} from '@/infrastructure/persistence/incomeLedgerService';

export type ChartPoint = { label: string; value: number };

function id(): string {
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function pack(
  partial: Omit<ProjectionPayload, 'id' | 'createdAt'>,
): ProjectionPayload {
  return { ...partial, id: id(), createdAt: Date.now() };
}

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
        return pack({
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

  const series: ChartPoint[] = [
    { label: 'Mon', value: 42 },
    { label: 'Tue', value: 55 },
    { label: 'Wed', value: 48 },
    { label: 'Thu', value: 70 },
    { label: 'Fri', value: 63 },
    { label: 'Sat', value: 80 },
    { label: 'Sun', value: 74 },
  ];
  return pack({
    mode: 'chart',
    title: 'Chart',
    subtitle: 'Sample series · log income for live data',
    text: query?.trim() || undefined,
    data: { series, source: 'sample' },
    source: 'director',
  });
}

export function resolveChartFromSeries(
  series: ChartPoint[],
  meta?: { title?: string; subtitle?: string; text?: string },
): ProjectionPayload {
  return pack({
    mode: 'chart',
    title: meta?.title || 'Chart',
    subtitle: meta?.subtitle,
    text: meta?.text,
    data: { series, source: 'resolved' },
    source: 'tool',
  });
}
