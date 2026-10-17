import { describe, expect, it } from 'vitest';
import { amsterdamKlok, amsterdamRelatief, mensTekst, nextTekst } from './tijd';

const NU = Date.parse('2026-10-17T13:39:00Z'); // 15:39 Amsterdam (CEST)

describe('amsterdam tijd', () => {
  it('zet UTC om naar Europe/Amsterdam zonder ISO te laten staan', () => {
    expect(amsterdamKlok('2026-10-17T13:39:50.498309+00:00')).toBe('15:39');
    expect(nextTekst('2026-10-17T13:45:00+00:00', NU)).toBe('next 15:45 · in 6 min');
    expect(amsterdamRelatief('2026-10-17T13:33:00Z', NU)).toBe('6 min ago');
  });

  it('maakt JSON tot mensentekst, nooit een dump', () => {
    const ruw = '{"at": "2026-10-17T13:40:02.798367+00:00", "ok": 4, "enabled": 4}';
    const uit = mensTekst(ruw, NU);
    expect(uit).not.toMatch(/T\d{2}:\d{2}/);
    expect(uit).not.toMatch(/\{/);
    expect(uit).toMatch(/15:40/);
    expect(uit).toMatch(/ok 4/);
  });

  it('veegt ISO uit een zin zoals Next cycle at …', () => {
    const uit = mensTekst('Next cycle at 2026-10-17T15:39:50.498309+00:00.', NU);
    expect(uit).toBe('Next cycle at 17:39.');
    expect(uit).not.toMatch(/2026-10-17T/);
  });
});
