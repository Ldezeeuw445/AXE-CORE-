import { beforeEach, describe, expect, it, vi } from 'vitest';

const kv = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => kv.get(k) ?? null,
  setItem: (k: string, v: string) => { kv.set(k, v); },
  removeItem: (k: string) => { kv.delete(k); },
});

import { focusStand, inFocus, startFocus, stopFocus, telVastgehouden } from './focusOpslag';

describe('focusOpslag', () => {
  beforeEach(() => kv.clear());

  it('telt alleen tijdens de focus en geeft het terug bij stoppen', () => {
    expect(inFocus()).toBe(false);
    telVastgehouden('meldingen');
    expect(focusStand()).toBeNull();
    startFocus(25);
    expect(inFocus()).toBe(true);
    telVastgehouden('meldingen', 2);
    telVastgehouden('berichten');
    expect(stopFocus()).toMatchObject({ minuten: 25, meldingen: 2, berichten: 1 });
    expect(inFocus()).toBe(false);
  });

  it('een verlopen focus telt niet', () => {
    startFocus(1, Date.now() - 120_000);
    expect(inFocus()).toBe(false);
  });
});
