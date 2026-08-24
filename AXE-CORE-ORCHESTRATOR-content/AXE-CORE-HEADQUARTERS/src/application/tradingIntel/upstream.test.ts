/**
 * What an agent is told about the ones before it.
 *
 * The pipeline is only a chain if the arrow carries something. These pin the
 * two cases that would quietly turn it back into four unrelated panels: an
 * empty upstream that reads as absence, and a populated one that names who
 * said what.
 */
import { describe, it, expect } from 'vitest';
import { upstreamBlock } from './deskAgents';

describe('upstreamBlock', () => {
  it('says plainly when nothing ran before it', () => {
    const out = upstreamBlock(undefined);
    expect(out).toContain('nothing has run before you');
    // The instruction matters as much as the fact: without it the model fills
    // the silence by implying it built on someone.
    expect(out).toContain('Say so rather than implying');
  });

  it('treats an empty object the same as no upstream at all', () => {
    expect(upstreamBlock({})).toContain('nothing has run before you');
  });

  it('names which agent said what, so the model can agree or differ with one', () => {
    const out = upstreamBlock({ research: 'gold is bid', intel: 'flow is short' });
    expect(out).toContain('WHAT RESEARCH FOUND:');
    expect(out).toContain('gold is bid');
    expect(out).toContain('WHAT INTEL ADDED:');
    expect(out).toContain('flow is short');
  });

  it('keeps the order research → intel → companion', () => {
    const out = upstreamBlock({ companion: 'c', intel: 'i', research: 'r' });
    expect(out.indexOf('RESEARCH')).toBeLessThan(out.indexOf('INTEL'));
    expect(out.indexOf('INTEL')).toBeLessThan(out.indexOf('COMPANION'));
  });

  it('omits a lane that has not run rather than showing an empty heading', () => {
    const out = upstreamBlock({ research: 'r' });
    expect(out).toContain('WHAT RESEARCH FOUND:');
    expect(out).not.toContain('WHAT INTEL ADDED:');
  });

  it('caps each upstream section so one long report cannot crowd out the rest', () => {
    const out = upstreamBlock({ research: 'x'.repeat(5000), intel: 'the intel line' });
    expect(out).toContain('the intel line');
    expect(out.length).toBeLessThan(3600);
  });
});
