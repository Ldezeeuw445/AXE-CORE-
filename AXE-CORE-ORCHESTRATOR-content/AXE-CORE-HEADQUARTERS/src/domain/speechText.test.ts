import { describe, it, expect } from 'vitest';
import { normalizeForSpeech } from './speechText';

describe('normalizeForSpeech', () => {
  it('drops Markdown emphasis but keeps the words', () => {
    expect(normalizeForSpeech('This is **very** _important_ and ~~old~~ news'))
      .toBe('This is very important and old news');
  });

  it('never reads code fences or inline code ticks', () => {
    expect(normalizeForSpeech('Run `npm test` now.\n```\nconst x = 1\n```\nDone'))
      .toBe('Run npm test now. Done');
  });

  it('speaks a link by its label and swallows the URL', () => {
    expect(normalizeForSpeech('See [the report](https://example.com/report) please'))
      .toBe('See the report please');
  });

  it('removes bare URLs and emails', () => {
    expect(normalizeForSpeech('Ping me at trade@northsea.com or https://a.b/c ok'))
      .toBe('Ping me at or ok'.replace(/\s{2,}/g, ' '));
  });

  it('strips headings, bullets and numbered list markers', () => {
    expect(normalizeForSpeech('# Title\n- first\n- second\n1. third'))
      .toBe('Title first second third');
  });

  it('removes emoji and arrows', () => {
    expect(normalizeForSpeech('Deploy done ✅ → shipping 🚀'))
      .toBe('Deploy done shipping'.replace(/\s{2,}/g, ' '));
  });

  it('normalizes smart quotes and dashes', () => {
    expect(normalizeForSpeech('“Ready” — really')).toBe('"Ready", really');
  });

  it('is idempotent', () => {
    const once = normalizeForSpeech('## Hi **there** `x` 🎉 [a](http://b)');
    expect(normalizeForSpeech(once)).toBe(once);
  });

  it('leaves already-clean speech untouched', () => {
    const s = "Okay, I'll send that to the trading desk now.";
    expect(normalizeForSpeech(s)).toBe(s);
  });
});
