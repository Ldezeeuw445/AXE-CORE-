/**
 * News — headlines + high-impact calendar window (2h no-trade).
 */
import { fetchPairNews, fetchEconomicReleases } from '@/infrastructure/gateways/researchSources';
import type { NewsResult } from '../types';

export async function runNews(symbol: string): Promise<NewsResult> {
  const notes: string[] = [];
  let headlines: NewsResult['headlines'] = [];
  try {
    const items = await fetchPairNews(symbol, 5);
    headlines = items.map(i => ({
      title: i.title,
      source: i.source,
      publishedAt: i.at,
    }));
  } catch (e) {
    notes.push(`pair news unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }

  const events: NewsResult['events'] = [];
  let highImpactWithin2h = false;
  try {
    const releases = await fetchEconomicReleases();
    const now = Date.now();
    for (const r of releases) {
      const t = Date.parse(r.date);
      if (!Number.isFinite(t)) continue;
      const within2h = Math.abs(t - now) <= 2 * 3600_000;
      const nameU = r.name.toUpperCase();
      const relevant =
        nameU.includes(symbol.slice(0, 3)) ||
        /FOMC|NFP|CPI|GDP|INTEREST|ECB|FED|BOE|BOJ/i.test(r.name);
      if (relevant || within2h) {
        events.push({ name: r.name, date: r.date, within2h });
        if (within2h && relevant) highImpactWithin2h = true;
      }
    }
    events.splice(12);
  } catch (e) {
    notes.push(`calendar unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (highImpactWithin2h) notes.push('HIGH-IMPACT within 2h — Risk should block');
  return { symbol, headlines, highImpactWithin2h, events, notes };
}
