/**
 * Wat er op het slotscherm komt te staan.
 *
 * Wat hier echt kapot kan: dezelfde zin twee keer onder elkaar (titel ook als
 * body), een bui van dezelfde waarschuwing die het scherm vult (geen tag), een
 * tik die je nergens brengt (geen url), en trillen voor een leeg bericht.
 */
import { describe, it, expect } from 'vitest';
import { pushBerichtVan, verbergInhoud } from './pushBericht';

const rij = (message: string, over = {}) => ({ id: 'n1', type: 'warning', message, ...over });

describe('pushBerichtVan', () => {
  it('splitst onderwerp en detail, zoals de bel dat ook doet', () => {
    const p = pushBerichtVan(rij('OpenAI (Primair) is niet meer bereikbaar: AXE valt terug op Groq.'))!;
    expect(p.titel).toBe('OpenAI (Primair) is niet meer bereikbaar');
    expect(p.body).toBe('AXE valt terug op Groq.');
  });

  it('herhaalt de titel niet als body als er geen detail is', () => {
    // Twee keer dezelfde zin onder elkaar is wat een slotscherm onleesbaar maakt.
    const p = pushBerichtVan(rij('Backup klaar'))!;
    expect(p.titel).toBe('Backup klaar');
    expect(p.body).toBe('');
  });

  it('geeft een bui van dezelfde waarschuwing één tag', () => {
    // 173 van de 186 rijen waren dezelfde zin. Zonder gelijke tag stapelen die
    // zich op het slotscherm op.
    const a = pushBerichtVan(rij('Provider weggevallen: 3 van de 5 modellen antwoorden niet'))!;
    const b = pushBerichtVan(rij('Provider weggevallen: 4 van de 5 modellen antwoorden niet'))!;
    expect(a.tag).toBe(b.tag);
  });

  it('ook als de cijfers in het onderwerp zelf staan', () => {
    // De bui hierboven heeft zijn cijfers in het DETAIL, dat nooit in de tag komt;
    // hier staan ze in het onderwerp dat de tag wordt.
    const a = pushBerichtVan(rij('3 van de 5 modellen antwoorden niet'))!;
    const b = pushBerichtVan(rij('4 van de 5 modellen antwoorden niet'))!;
    expect(a.tag).toBe(b.tag);
  });

  it('maar een ander onderwerp krijgt een andere tag', () => {
    const a = pushBerichtVan(rij('Provider weggevallen: iets'))!;
    const b = pushBerichtVan(rij('Taak klaar: iets anders'))!;
    expect(a.tag).not.toBe(b.tag);
  });

  it('springt naar de plek waar de melding over gaat', () => {
    expect(pushBerichtVan(rij('Agent gestopt: de crew gaf een fout'))!.url).toBe('/agents');
  });

  it('en anders naar de app zelf, nooit nergens heen', () => {
    const p = pushBerichtVan(rij('Zomaar iets zonder bekend onderwerp'))!;
    expect(p.url).toBe('/');
  });

  it('meldt niets bij een leeg bericht', () => {
    // Trillen zonder reden leert je om meldingen weg te vegen zonder te kijken.
    expect(pushBerichtVan(rij(''))).toBeNull();
    expect(pushBerichtVan(rij('   '))).toBeNull();
    expect(pushBerichtVan({ id: 'n1', message: null })).toBeNull();
  });

  it('houdt de tag leesbaar en begrensd', () => {
    const p = pushBerichtVan(rij('x'.repeat(200)))!;
    expect(p.tag.length).toBeLessThanOrEqual(45);
    expect(p.tag.startsWith('axe-')).toBe(true);
  });
});

describe('verbergInhoud', () => {
  // Zelfde gevallen als test_push_meldingen.py.
  it('toont geen inhoud', () => {
    const p = verbergInhoud(pushBerichtVan(rij('OpenAI is niet meer bereikbaar: AXE valt terug op Groq.'))!);
    expect(p.titel).toBe('AXE has something');
    expect(p.body).toBe('');
    // Niets van het origineel mag nog in de tekst staan.
    expect(JSON.stringify(p)).not.toContain('OpenAI');
  });

  it('laat verborgen meldingen elkaar vervangen', () => {
    const a = verbergInhoud(pushBerichtVan(rij('Provider weggevallen: iets'))!);
    const b = verbergInhoud(pushBerichtVan(rij('Taak klaar: iets anders'))!);
    expect(a.tag).toBe(b.tag);
  });

  it('houdt de route, zodat een tik nog ergens heen gaat', () => {
    expect(verbergInhoud(pushBerichtVan(rij('Agent gestopt: de crew gaf een fout'))!).url).toBe('/agents');
  });
});
