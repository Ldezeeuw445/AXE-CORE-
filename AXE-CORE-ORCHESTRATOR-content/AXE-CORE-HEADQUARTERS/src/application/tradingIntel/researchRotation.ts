/**
 * Research covers the whole watchlist, a few pairs at a time.
 *
 * It used to run on whichever symbol the chart happened to show, so thirty
 * instruments were configured and one was ever researched — and which one
 * depended on where the user last clicked.
 *
 * Running all thirty on a press is not the fix. One cycle is a model call plus
 * seven data fetches, so thirty is 30 model calls and 210 fetches: minutes of
 * waiting, and straight into the TwelveData rate limit that already bit today.
 *
 * So the window moves instead, exactly like the autopilot's scan offset. Each
 * press takes the next few pairs and remembers where it stopped, so the
 * watchlist is covered in full over several presses rather than one pair being
 * covered forever.
 */
import { allPairIds } from '@/domain/tradingIntel/pairRegistry';

/** How many pairs one press researches. Three keeps a press under a minute. */
export const RESEARCH_BATCH = 3;

export interface ResearchBatch {
  /** The pairs to research now. */
  pairs: string[];
  /** Where the next press should resume. */
  nextOffset: number;
  /** How far through the watchlist this press leaves us, for the UI. */
  covered: string;
}

/**
 * The next slice of the watchlist.
 *
 * Wraps, so the list is a loop rather than something that finishes and stops.
 * Positioning and flow change; a pair researched ten presses ago is stale, and
 * coming back round to it is the point rather than an inefficiency.
 */
export function nextBatch(offset: number, size = RESEARCH_BATCH): ResearchBatch {
  const all = allPairIds();
  if (!all.length) return { pairs: [], nextOffset: 0, covered: '0 of 0' };

  const start = ((offset % all.length) + all.length) % all.length;
  const pairs = Array.from({ length: Math.min(size, all.length) }, (_, i) => all[(start + i) % all.length]);
  const nextOffset = (start + pairs.length) % all.length;

  return {
    pairs,
    nextOffset,
    // Stated as a position in the list, because "3 of 30" answers the question
    // a person actually has: how much of my watchlist has been looked at.
    covered: `${start + pairs.length > all.length ? all.length : start + pairs.length} of ${all.length}`,
  };
}

/** Symbol the pipeline should carry forward: the first of the batch. */
export function leadSymbol(batch: ResearchBatch, fallback: string): string {
  return batch.pairs[0] ?? fallback;
}
