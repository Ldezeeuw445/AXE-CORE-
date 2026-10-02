import { describe, it, expect, beforeEach, vi } from 'vitest';

const opslag = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => opslag.get(k) ?? null,
  setItem: (k: string, v: string) => { opslag.set(k, v); },
  removeItem: (k: string) => { opslag.delete(k); },
});

const { ollamaHeaders, isExterneOllama } = await import('./ollamaSleutel');

describe('de sleutel voor de Ollama-box', () => {
  beforeEach(() => opslag.clear());

  it('gaat alleen mee naar ollama.axecompanion.com', () => {
    opslag.set('axe_llm_connections', JSON.stringify({ ollama: { key: 'geheim' } }));
    expect(ollamaHeaders('https://ollama.axecompanion.com/api/tags')).toEqual({ Authorization: 'Bearer geheim' });
    expect(ollamaHeaders('http://localhost:11434')).toEqual({});
    expect(ollamaHeaders('https://api.axecompanion.com/proxy/ollama')).toEqual({});
    expect(isExterneOllama('https://ollama.axecompanion.com.kwaadaardig.nl')).toBe(false);
  });

  it('stuurt niets zonder ingevulde sleutel, en overleeft onzin', () => {
    expect(ollamaHeaders('https://ollama.axecompanion.com')).toEqual({});
    opslag.set('axe_llm_connections', 'kapot');
    expect(ollamaHeaders('https://ollama.axecompanion.com')).toEqual({});
    expect(ollamaHeaders('geen url')).toEqual({});
  });
});

/* ── Niemand bouwt een tiende plek zonder sleutel (2 okt 2026) ───────────────
   Gemeten vlak voor het slot op de modelbox aanging: negen plekken stuurden
   `ollamaHeaders` mee, twee niet -- `Infrastructure.tsx` (de modellenlijst en
   de testknop). Die zouden dus 401 geven op het moment dat nginx dichtgaat, en
   dat merk je pas als je die tab opent.

   Deze test leest de bron, net als de andere wiring-tests: een bestand dat
   ZELF fetcht én het adres van de externe box noemt, moet ook `ollamaHeaders`
   noemen. Dat is grover dan nagaan of de header bij de juiste fetch hoort, maar
   het vangt wat er echt gebeurt -- iemand kopieert een fetch en vergeet de
   header.

   Bestanden die het adres alleen NOEMEN (providerConnectionDefaults, de
   hostenlijst, tests) vallen er bewust buiten: die halen niets op. Wie de URL
   doorgeeft aan een module die wél fetcht, wordt daar gevangen. */
describe('elke aanroep naar de externe box stuurt de sleutel mee', () => {
  it('geen bestand in src/ noemt het adres zonder ollamaHeaders', async () => {
    const { readdirSync, statSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');

    /* Een adres in een comment is geen aanroep. `apiUrl.ts` noemt de box in
       een stuk geschiedenis ("tot 28 sep was dat Hetzner") en haalt er niets
       op. Alleen blokcommentaar en regels die met // of * beginnen eruit: een
       `https://` in een string heeft ook twee slashes, en die moet blijven. */
    const zonderCommentaar = (bron: string) => bron
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((r) => !/^\s*(\/\/|\*)/.test(r))
      .join('\n');

    const bestanden: string[] = [];
    const loop = (map: string) => {
      for (const naam of readdirSync(map)) {
        const pad = join(map, naam);
        if (statSync(pad).isDirectory()) loop(pad);
        else if (/\.tsx?$/.test(naam)) bestanden.push(pad);
      }
    };
    loop('src');

    const vergeten = bestanden.filter((pad) => {
      if (pad.includes('ollamaSleutel')) return false;
      if (/\.test\.tsx?$/.test(pad)) return false;
      const bron = readFileSync(pad, 'utf8');
      if (!bron.includes('fetch(')) return false;
      if (!zonderCommentaar(bron).includes('ollama.axecompanion.com')) return false;
      return !bron.includes('ollamaHeaders');
    });

    expect(vergeten, `deze bestanden praten met de modelbox zonder sleutel:\n${vergeten.join('\n')}`)
      .toEqual([]);
  });
});
