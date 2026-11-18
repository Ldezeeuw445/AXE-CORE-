import { afterEach, describe, expect, it, vi } from 'vitest';
import { laadRegels, zetCategorieVrij } from './beleidOpslag';

const mem = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
});

afterEach(() => { mem.clear(); });

describe('zetCategorieVrij', () => {
  it('zet price op auto_approve als Luka de schakelaar aanzet', () => {
    const aan = zetCategorieVrij('northseamgr', 'price', true);
    expect(aan.find((r) => r.category === 'price')).toMatchObject({
      mode: 'auto_approve',
      axeMayApproveAll: true,
    });
  });

  it('zet price terug naar escalate als hij hem uitzet, niet op auto_approve laten staan', () => {
    zetCategorieVrij('northseamgr', 'price', true);
    const uit = zetCategorieVrij('northseamgr', 'price', false);
    expect(uit.find((r) => r.category === 'price')).toMatchObject({
      mode: 'escalate',
      axeMayApproveAll: false,
    });
    expect(laadRegels().find((r) => r.category === 'price')?.mode).toBe('escalate');
  });

  it('laat chase op auto_approve staan als Luka de extra-vrijgave uitzet', () => {
    zetCategorieVrij('northseamgr', 'chase', true);
    const uit = zetCategorieVrij('northseamgr', 'chase', false);
    expect(uit.find((r) => r.category === 'chase')).toMatchObject({
      mode: 'auto_approve',
      axeMayApproveAll: false,
    });
  });
});
