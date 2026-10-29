/**
 * Sentiment — lightweight bias from news headlines (TEST; X/COT later).
 */
import type { NewsResult, SentimentResult } from '../types';

const BULL = /\b(rally|surge|bull|beat|hawkish|strong|rise|gain|record)\b/i;
const BEAR = /\b(plunge|crash|bear|miss|dovish|weak|fall|loss|recession)\b/i;

export function runSentiment(symbol: string, news: NewsResult | null): SentimentResult {
  const titles = (news?.headlines ?? []).map(h => h.title);
  let bull = 0;
  let bear = 0;
  for (const t of titles) {
    if (BULL.test(t)) bull += 1;
    if (BEAR.test(t)) bear += 1;
  }
  let bias: SentimentResult['bias'] = 'neutral';
  let score = 50;
  if (bull > bear) {
    bias = 'bullish';
    score = Math.min(90, 55 + bull * 10);
  } else if (bear > bull) {
    bias = 'bearish';
    score = Math.max(10, 45 - bear * 10);
  }
  return {
    symbol,
    bias,
    score,
    notes: [
      `headline tokens bull=${bull} bear=${bear}`,
      titles.length ? `n=${titles.length}` : 'no headlines — neutral default',
    ],
  };
}
