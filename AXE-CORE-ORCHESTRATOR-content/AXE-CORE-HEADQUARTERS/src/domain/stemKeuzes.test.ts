import { describe, it, expect } from 'vitest';
import { STEMMEN, STANDAARD_STEM, stemVan } from './stemKeuzes';

describe('stemKeuzes', () => {
  it('houdt het op vier', () => {
    // Groeit deze lijst weer, dan is de reden om hem in te korten vergeten: een
    // keuzelijst die je niet kunt beantwoorden is geen keuze maar werk.
    expect(STEMMEN).toHaveLength(4);
  });

  it('heeft precies één stem per motor, plus een tweede ElevenLabs', () => {
    const motoren = STEMMEN.map(s => s.motor);
    expect(motoren.filter(m => m === 'fish')).toHaveLength(1);
    expect(motoren.filter(m => m === 'browser')).toHaveLength(1);
    expect(motoren.filter(m => m === 'elevenlabs')).toHaveLength(2);
  });

  it('geeft elke ElevenLabs-stem een stemId en de rest niet', () => {
    // Een ElevenLabs-keuze zonder id valt terug op wat er toevallig opgeslagen
    // staat, en dan klinkt "Vrouw" als de vorige keuze.
    for (const s of STEMMEN) {
      if (s.motor === 'elevenlabs') expect(s.stemId, s.id).toBeTruthy();
      else expect(s.stemId, s.id).toBeUndefined();
    }
  });

  it('geeft elke keuze een eigen id en een uitleg', () => {
    expect(new Set(STEMMEN.map(s => s.id)).size).toBe(STEMMEN.length);
    for (const s of STEMMEN) expect(s.uitleg.trim().length).toBeGreaterThan(0);
  });

  it('kent de standaard', () => {
    expect(STEMMEN.some(s => s.id === STANDAARD_STEM)).toBe(true);
  });

  it('valt terug op de standaard bij een onbekende opgeslagen keuze', () => {
    // Er staat nu nog een ElevenLabs-stem-id in localStorage van de oude lijst.
    // Die mag geen stille stem opleveren.
    expect(stemVan('pNInz6obpgDQGcFmaJgB')).toBe(STEMMEN[0]);
    expect(stemVan('')).toBe(STEMMEN[0]);
  });
});
