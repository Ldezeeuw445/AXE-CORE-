import { describe, it, expect } from 'vitest';
import { describeFailure, maakMeldingsfilter } from './globalFailure';

describe('describeFailure', () => {
  it('noemt een stille fetch bij naam in plaats van "Load failed"', () => {
    const f = describeFailure(new TypeError('Load failed'));
    expect(f.kind).toBe('onbereikbaar');
    expect(f.message).not.toMatch(/load failed/i);
    expect(f.message).toMatch(/server/i);
  });

  it('herkent ook de Chromium-tekst voor dezelfde storing', () => {
    expect(describeFailure(new TypeError('Failed to fetch')).kind).toBe('onbereikbaar');
  });

  it('scheidt een antwoordende server van een zwijgende', () => {
    expect(describeFailure({ status: 500 }).kind).toBe('server');
    expect(describeFailure(new TypeError('Load failed')).kind).toBe('onbereikbaar');
  });

  it('laat een echte appfout ongemoeid, want die tekst helpt wel', () => {
    const f = describeFailure(new Error('cannot read property id of undefined'));
    expect(f.kind).toBe('app');
    expect(f.message).toContain('cannot read property');
  });

  it('verzint niets bij een lege reden', () => {
    expect(describeFailure(undefined).kind).toBe('app');
    expect(describeFailure(undefined).message).toBeTruthy();
  });
});

describe('maakMeldingsfilter', () => {
  it('toont één storing één keer, hoeveel verzoeken er ook sneuvelen', () => {
    const mag = maakMeldingsfilter(8000);
    const m = 'AXE API antwoordt niet — de server is even weg.';
    // Twaalf verzoeken lopen binnen een halve seconde stuk.
    const getoond = Array.from({ length: 12 }, (_, i) => mag(m, 1000 + i * 40)).filter(Boolean);
    expect(getoond).toHaveLength(1);
  });

  it('laat dezelfde melding weer toe als de storing later terugkomt', () => {
    const mag = maakMeldingsfilter(8000);
    const m = 'AXE API antwoordt niet — de server is even weg.';
    expect(mag(m, 0)).toBe(true);
    expect(mag(m, 7999)).toBe(false);
    expect(mag(m, 8001)).toBe(true);
  });

  it('onderdrukt geen andere fout die toevallig tegelijk optreedt', () => {
    const mag = maakMeldingsfilter(8000);
    expect(mag('server weg', 0)).toBe(true);
    expect(mag('iets anders stuk', 10)).toBe(true);
  });

  it('geeft elke test een eigen geschiedenis', () => {
    expect(maakMeldingsfilter()('x', 0)).toBe(true);
    expect(maakMeldingsfilter()('x', 0)).toBe(true);
  });
});

describe('describeFailure — vormen die de app werkelijk oplevert', () => {
  it('graaft de Supabase-fout uit zijn omhulsel', () => {
    const f = describeFailure({ error: { message: 'column notifications.title does not exist' } });
    expect(f.message).toContain('does not exist');
  });

  it('leest de detail-tekst van de Python-API', () => {
    expect(describeFailure({ detail: 'account not found' }).message).toBe('account not found');
  });

  it('valt terug op statusText als er niets beters is', () => {
    expect(describeFailure({ statusText: 'Bad Gateway' }).message).toBe('Bad Gateway');
  });

  it('herkent een zwijgende server ook als die diep genest zit', () => {
    expect(describeFailure({ error: { message: 'Failed to fetch' } }).kind).toBe('onbereikbaar');
  });
});
