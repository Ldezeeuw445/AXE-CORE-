/**
 * The ordering rule, tested where it can be tested.
 *
 * An agent reads its own namespace and the global one, merged. Which row comes
 * first is not cosmetic: the prompt is truncated from the bottom, so an agent
 * that puts its own stale note above a fresher global fact acts on the older
 * one and never sees the newer. That is the failure the six-table split caused
 * in the first place, one level down.
 */
import { describe, it, expect } from 'vitest';
import { mergeNewestFirst, formatForPrompt, GLOBAL, type MemoryRow } from './agentMemoryService';

const row = (over: Partial<MemoryRow>): MemoryRow => ({
  id: Math.random().toString(36).slice(2),
  agent: GLOBAL,
  user_id: 'u',
  kind: 'fact',
  key: null,
  content: 'x',
  category: null,
  tags: null,
  symbol: null,
  importance: null,
  confidence: null,
  source: 'test',
  created_at: '2026-01-01T00:00:00Z',
  ...over,
});

describe('what an agent sees first', () => {
  it('puts a newer global fact above the agent\'s own older note', () => {
    const own = [row({ agent: 'axe_trader', content: 'old own', created_at: '2026-08-01T00:00:00Z' })];
    const global = [row({ content: 'new global', created_at: '2026-08-23T00:00:00Z' })];
    expect(mergeNewestFirst(own, global, {}, 10).map(r => r.content))
      .toEqual(['new global', 'old own']);
  });

  it('puts the agent\'s newer note above an older global one', () => {
    const own = [row({ agent: 'axe_trader', content: 'new own', created_at: '2026-08-23T00:00:00Z' })];
    const global = [row({ content: 'old global', created_at: '2026-08-01T00:00:00Z' })];
    expect(mergeNewestFirst(own, global, {}, 10).map(r => r.content))
      .toEqual(['new own', 'old global']);
  });

  it('keeps both namespaces — global does not crowd the agent out', () => {
    const own = [row({ agent: 'axe_trader', content: 'mine' })];
    const global = Array.from({ length: 50 }, (_, i) => row({ content: `g${i}` }));
    const out = mergeNewestFirst(own, global, {}, 60);
    expect(out).toHaveLength(51);
    expect(out.some(r => r.content === 'mine')).toBe(true);
  });

  it('honours the limit after merging, not before', () => {
    const own = Array.from({ length: 5 }, (_, i) => row({ agent: 'axe_trader', content: `o${i}` }));
    const global = Array.from({ length: 5 }, (_, i) => row({ content: `g${i}` }));
    expect(mergeNewestFirst(own, global, {}, 3)).toHaveLength(3);
  });

  it('filters by symbol across both namespaces', () => {
    const own = [row({ agent: 'axe_trader', content: 'btc note', symbol: 'BTCUSD' })];
    const global = [
      row({ content: 'eth note', symbol: 'ETHUSD' }),
      row({ content: 'btc global', symbol: 'BTCUSD' }),
    ];
    expect(mergeNewestFirst(own, global, { symbol: 'BTCUSD' }, 10).map(r => r.content).sort())
      .toEqual(['btc global', 'btc note']);
  });

  it('filters by kind', () => {
    const rows = [row({ content: 'a', kind: 'lesson' }), row({ content: 'b', kind: 'doc' })];
    expect(mergeNewestFirst([], rows, { kind: 'lesson' }, 10).map(r => r.content)).toEqual(['a']);
  });

  it('survives rows with no timestamp instead of throwing', () => {
    const rows = [row({ content: 'a', created_at: undefined as unknown as string }), row({ content: 'b' })];
    expect(() => mergeNewestFirst([], rows, {}, 10)).not.toThrow();
  });
});

describe('rendering for a prompt', () => {
  it('marks which namespace each line came from', () => {
    const out = formatForPrompt([
      row({ agent: 'axe_trader', content: 'own thing' }),
      row({ content: 'shared thing' }),
    ]);
    expect(out).toContain('[axe_trader] own thing');
    expect(out).toContain('[global] shared thing');
  });

  it('names the symbol when there is one, so the model need not infer it', () => {
    expect(formatForPrompt([row({ agent: 'axe_trader', content: 'held', symbol: 'XAUUSD' })]))
      .toContain('[axe_trader XAUUSD] held');
  });

  it('drops whole lines at the budget rather than cutting one in half', () => {
    const rows = Array.from({ length: 40 }, (_, i) => row({ content: `line ${i} ${'x'.repeat(50)}` }));
    const out = formatForPrompt(rows, 300);
    expect(out.length).toBeLessThanOrEqual(300);
    // Every surviving line is whole: none ends mid-run of the padding.
    for (const l of out.split('\n')) expect(l.startsWith('- [')).toBe(true);
  });

  it('collapses newlines so one memory cannot fake several', () => {
    expect(formatForPrompt([row({ content: 'a\n\nb' })])).toBe('- [global] a b');
  });
});

/**
 * Team memory, and the line that keeps namespaces meaningful.
 *
 * Observations stay private; outcomes are shared. Without that split the team
 * store becomes a second copy of everything and the namespaces stop meaning
 * anything — which is the pile this whole migration existed to undo.
 */
describe('shared team memory', () => {
  it('reaches every agent, because it is written to the global namespace', () => {
    const shared = [row({ agent: GLOBAL, content: '[axe_intel] flow turned put-heavy' })];
    // Any agent reading its own plus global sees it, whichever namespace it is.
    for (const who of ['axe_trader', 'axe_companion', 'axe_research']) {
      const seen = mergeNewestFirst([row({ agent: who, content: 'mine' })], shared, {}, 10);
      expect(seen.some(r => r.content.includes('flow turned put-heavy'))).toBe(true);
    }
  });

  it('keeps the author visible in the text, not only in metadata', () => {
    // formatForPrompt renders content. A shared lesson whose author is
    // invisible there reads as received wisdom rather than one agent's record,
    // and you cannot tell which agent to distrust next time.
    const out = formatForPrompt([row({ agent: GLOBAL, content: '[axe_companion] said buy, it cost 1.2R' })]);
    expect(out).toContain('[axe_companion]');
  });

  it('does not let a shared row masquerade as the reader\'s own', () => {
    const out = formatForPrompt([row({ agent: GLOBAL, content: '[axe_intel] x' })]);
    // The lane prefix is global, so nobody can mistake it for their own note.
    expect(out).toContain('[global]');
  });
});
