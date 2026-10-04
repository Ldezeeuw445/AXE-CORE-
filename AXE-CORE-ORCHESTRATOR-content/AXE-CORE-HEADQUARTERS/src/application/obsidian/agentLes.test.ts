import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kluisPadVoorAgent } from '@/domain/obsidian/kluisBoom';

const h = vi.hoisted(() => ({
  notes: new Map<string, { path: string; title: string; content: string }>(),
}));

vi.mock('@/infrastructure/persistence/obsidianMemoryService', () => ({
  getObsidianNoteByPath: async (path: string) => h.notes.get(path) ?? null,
  writeObsidianNote: async (n: { path: string; title: string; content: string }) => {
    h.notes.set(n.path, n);
  },
}));

const { algoVolgendeDagTekst, schrijfAlgoVolgendeDag } = await import('./agentLes');

beforeEach(() => {
  h.notes.clear();
});

describe('AXE Algo volgende-dag les', () => {
  it('zegt dat er geen order is gegaan als het account niet bevestigd is', () => {
    const tekst = algoVolgendeDagTekst([
      'XAUUSD: HOLD XAUUSD — no broker price for XAUUSD',
      'ETHUSD: HOLD ETHUSD — no broker price for ETHUSD',
    ]);
    expect(tekst).toMatch(/sent no order/);
    expect(tekst).not.toMatch(/auto_send|mailto|raise risk/i);
    expect(tekst).toMatch(/same account|same decision log|risk limits/i);
  });

  it('schrijft die les in de Trading-werkplek, niet in Home', async () => {
    await schrijfAlgoVolgendeDag(['XAUUSD: HOLD XAUUSD — no broker price for XAUUSD']);
    const pad = kluisPadVoorAgent('trading');
    expect(pad).toMatch(/Agents\/Trading Agent\/workspace\.md/);
    expect(pad).not.toMatch(/Home|Workplaces\/Home/);
    const note = h.notes.get(pad);
    expect(note?.content).toMatch(/## Next day /);
    expect(note?.content).toMatch(/no broker price/);
    expect(note?.content).not.toMatch(/auto_send/);
  });
});
