/**
 * Reading a prediction market without inventing one.
 *
 * The failure that matters here is silent: a feed that cannot be reached must
 * not become an agent stating what the crowd thinks. So the empty case says
 * so in words the prompt carries, rather than being left out of the block.
 */
import { describe, it, expect } from 'vitest';
import { formatPredictions, type PredictionMarket } from './polymarketGateway';

const m = (over: Partial<PredictionMarket>): PredictionMarket => ({
  question: 'Will Bitcoin reach $90,000 in August?',
  probability: 0.1105,
  volume24h: 128035,
  endsAt: null,
  ...over,
});

describe('formatPredictions', () => {
  it('says the market is unreachable rather than omitting the section', () => {
    const out = formatPredictions([]);
    expect(out).toContain('unreachable');
    expect(out).toContain('do not guess');
  });

  it('states the probability as a percentage the model can quote', () => {
    expect(formatPredictions([m({})])).toContain('11.1%');
  });

  it('carries the volume, because a market with no money in it is not sentiment', () => {
    expect(formatPredictions([m({ volume24h: 128035 })])).toContain('128,035');
  });

  it('marks an unknown probability rather than printing a number for it', () => {
    const out = formatPredictions([m({ probability: null })]);
    expect(out).toContain('→ ?');
    expect(out).not.toContain('NaN');
  });

  it('labels the source as money at stake, not commentary', () => {
    // The distinction is the entire reason to read it: a price is a position,
    // an article is an opinion.
    expect(formatPredictions([m({})])).toContain('money at stake');
  });
});
