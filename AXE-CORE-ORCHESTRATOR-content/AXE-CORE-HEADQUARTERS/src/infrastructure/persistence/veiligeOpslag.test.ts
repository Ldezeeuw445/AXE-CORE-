import { describe, it, expect } from 'vitest';
import { zetItem, zetJson, isVolleOpslag, OPOFFERBAAR } from '@/infrastructure/persistence/veiligeOpslag';

/** Een opslag met een plafond, zodat "vol" echt vol is en niet nagespeeld. */
function opslag(maxTekens = Infinity): Storage {
  const bak = new Map<string, string>();
  const grootte = () => [...bak.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    getItem: (k: string) => bak.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const zonder = grootte() - (bak.has(k) ? k.length + (bak.get(k)?.length ?? 0) : 0);
      if (zonder + k.length + v.length > maxTekens) {
        const e = new Error('The quota has been exceeded.');
        e.name = 'QuotaExceededError';
        throw e;
      }
      bak.set(k, v);
    },
    removeItem: (k: string) => { bak.delete(k); },
    clear: () => bak.clear(),
    key: () => null,
    get length() { return bak.size; },
  } as Storage;
}

describe('een volle opslag herkennen', () => {
  it('kent de naam van elke motor', () => {
    // Op één ervan controleren is hetzelfde als op geen: Chromium, WebKit en
    // Firefox noemen het alle drie anders.
    expect(isVolleOpslag(Object.assign(new Error('x'), { name: 'QuotaExceededError' }))).toBe(true);
    expect(isVolleOpslag(Object.assign(new Error('x'), { name: 'NS_ERROR_DOM_QUOTA_REACHED' }))).toBe(true);
    expect(isVolleOpslag(Object.assign(new Error('x'), { code: 1014 }))).toBe(true);
    expect(isVolleOpslag(new Error('The quota has been exceeded.'))).toBe(true);
  });

  it('houdt een gewone fout erbuiten', () => {
    expect(isVolleOpslag(new Error('iets anders'))).toBe(false);
    expect(isVolleOpslag(null)).toBe(false);
  });
});

describe('wegschrijven', () => {
  it('schrijft gewoon als er ruimte is', () => {
    const o = opslag();
    expect(zetItem('a', 'hallo', o).gelukt).toBe(true);
    expect(o.getItem('a')).toBe('hallo');
  });

  it('gooit nooit, ook niet als de opslag vol zit', () => {
    // Dit is de hele reden dat dit bestand bestaat: een onbeschermde setItem in
    // een effect sloopte de pagina van Settings en EVE.
    const o = opslag(5);
    expect(() => zetItem('sleutel', 'een lange waarde', o)).not.toThrow();
    expect(zetItem('sleutel', 'een lange waarde', o).gelukt).toBe(false);
  });

  it('maakt ruimte door opofferbare sleutels te wissen en probeert opnieuw', () => {
    // Alleen vangen zou betekenen dat de opslag vol BLIJFT, en dan landt er
    // vanaf dat moment niets meer -- je voorkeuren verdwijnen stilletjes.
    // 50 en niet 40: de sleutel zelf telt mee (19 + 25 = 44 tekens), dus bij 40
    // klapte de OPZET al om en testte dit niets.
    const o = opslag(50);
    o.setItem('axe_browser_history', '0123456789012345678901234');
    const r = zetItem('voorkeur', 'ja', o);
    expect(r.gelukt).toBe(true);
    expect(r.opgeruimd).toContain('axe_browser_history');
    expect(o.getItem('voorkeur')).toBe('ja');
  });

  it('gooit nooit gegevens weg die niet opofferbaar zijn', () => {
    const o = opslag(40);
    o.setItem('axe_api_key', '0123456789012345678901234');
    const r = zetItem('voorkeur', 'ja', o);
    expect(r.gelukt).toBe(false);
    // De sleutel staat er nog. Gegevens weggooien om ruimte te maken voor een
    // voorkeur is een ruil die niemand heeft gevraagd.
    expect(o.getItem('axe_api_key')).not.toBeNull();
  });

  it('wist niet het ding dat je aan het schrijven bent', () => {
    const o = opslag(50);
    o.setItem('axe_browser_history', '012345678901234567890123456');
    const r = zetItem('axe_browser_history', 'nieuw', o);
    expect(r.opgeruimd).not.toContain('axe_browser_history');
    expect(r.gelukt).toBe(true);
  });

  it('werkt zonder opslag in plaats van te klappen', () => {
    // Privémodus, of een omgeving zonder localStorage.
    expect(zetItem('a', 'b', null).gelukt).toBe(false);
    expect(() => zetItem('a', 'b', undefined as unknown as Storage)).not.toThrow();
  });

  it('de opofferlijst is niet leeg en bevat geen sleutels', () => {
    expect(OPOFFERBAAR.length).toBeGreaterThan(0);
    for (const k of OPOFFERBAAR) {
      expect(k).not.toMatch(/key|slot|connection|setting|note|memor(y|ie)/i);
    }
  });
});

describe('zetJson', () => {
  it('serialiseert en schrijft', () => {
    const o = opslag();
    expect(zetJson('x', { a: 1 }, o).gelukt).toBe(true);
    expect(o.getItem('x')).toBe('{"a":1}');
  });

  it('strandt een kringverwijzing hier en niet bij de aanroeper', () => {
    const kring: Record<string, unknown> = {};
    kring.zelf = kring;
    const r = zetJson('x', kring, opslag());
    expect(r.gelukt).toBe(false);
    expect(r.reden).toContain('niet te serialiseren');
  });
});
