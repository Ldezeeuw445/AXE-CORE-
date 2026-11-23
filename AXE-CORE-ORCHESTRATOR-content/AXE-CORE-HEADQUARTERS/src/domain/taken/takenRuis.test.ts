import { describe, expect, it } from 'vitest';
import { isMacStap, isVoorLuka, zonderRuis, type RuisRij } from './takenRuis';

const r = (id: string, title: string, status: string, uur: number, extra: Partial<RuisRij> = {}): RuisRij => ({
  id, title, status, created_at: new Date(Date.UTC(2026, 10, 22, uur)).toISOString(), ...extra,
});

describe('zonderRuis (gemeten 22 nov)', () => {
  it('Mac-stapjes, geannuleerd en afgewezen weg', () => {
    const uit = zonderRuis([
      r('a', 'codex.run · AXE Core · mini-van-luka-6', 'failed', 10, { capability: 'computer_use' }),
      r('b', 'Testtaak', 'cancelled', 10),
      r('c', 'Echte taak', 'pending', 10),
      r('d', 'git.create_branch · AXE Core · mini-van-luka-6', 'blocked', 10, { capability: 'agentic' }),
    ]);
    expect(uit.map((x) => x.id)).toEqual(['c']);
  });

  it('mislukt maar daarna gelukt of opnieuw bezig = weg; dubbel mislukt = alleen de nieuwste', () => {
    const uit = zonderRuis([
      r('m1', 'Fix feed', 'failed', 8),
      r('g1', 'Fix feed', 'completed', 9),
      r('m2', 'Onderzoek marketTide', 'failed', 8),
      r('m3', 'Onderzoek marketTide', 'failed', 11),
      r('m4', 'Herstart', 'failed', 8),
      r('q4', 'Herstart', 'queued', 12),
    ]);
    expect(uit.map((x) => x.id)).toEqual(['g1', 'm3', 'q4']);
  });
});

describe('isVoorLuka', () => {
  it('alleen sleutel, login, tegoed of een besluit', () => {
    expect(isVoorLuka(r('1', 'Build', 'failed', 1, { error: { message: 'Warning: The provided API key is invalid.' } }))).toBe(true);
    expect(isVoorLuka(r('2', 'Fix', 'failed', 1, { error: { message: 'used all 40 steps without a verified result' } }))).toBe(false);
    expect(isVoorLuka(r('3', 'Ok?', 'waiting_approval', 1))).toBe(true);
    expect(isVoorLuka(r('4', 'Open', 'pending', 1))).toBe(false);
  });

  it('isMacStap herkent een Mac-stap, geen gewone taak', () => {
    expect(isMacStap('claude_code.run · AXE Core · imac-3')).toBe(true);
    expect(isMacStap('git.create_branch · AXE Core · mini-van-luka-6')).toBe(true);
    expect(isMacStap('Projects Manager: Controleer de orchestrator')).toBe(false);
  });
});
