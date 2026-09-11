import { describe, it, expect } from 'vitest';
import { chatModelKeuzes, providersMetSleutel, modelLabel, isActief } from '@/domain/chatModelKeuzes';
import type { ProviderId } from '@/domain/providers';

const ALLE = ['anthropic', 'openai', 'google', 'ollama', 'groq'] as ProviderId[];

describe('welke providers meedoen', () => {
  it('alleen die een sleutel hebben', () => {
    // Een keuze zonder sleutel valt stil door de cascade naar iets anders, en
    // dan zegt het scherm het ene terwijl het andere antwoordt.
    const p = providersMetSleutel({ anthropic: { key: 'x' } }, ALLE);
    expect(p).toContain('anthropic');
    expect(p).not.toContain('openai');
  });

  it('ollama telt mee zonder sleutel', () => {
    expect(providersMetSleutel({}, ALLE)).toContain('ollama');
  });

  it('een lege sleutel telt niet als een sleutel', () => {
    expect(providersMetSleutel({ openai: { key: '' } }, ALLE)).not.toContain('openai');
  });

  it('overleeft null', () => {
    expect(() => providersMetSleutel(null, ALLE)).not.toThrow();
  });
});

describe('de lijst', () => {
  it('zet het abonnement bovenaan', () => {
    // De enige weg die niets per token kost hoort bovenaan bij een keuze die je
    // vaak maakt.
    const lijst = chatModelKeuzes({ anthropic: { key: 'x' } }, ALLE);
    expect(lijst[0].opAbonnement).toBe(true);
  });

  it('biedt het abonnement ook zonder enige sleutel aan', () => {
    // Die weg HEEFT geen sleutel, dus hij kan er ook niet een missen.
    const lijst = chatModelKeuzes({}, ALLE);
    expect(lijst.some(k => k.opAbonnement)).toBe(true);
  });

  it('laat een provider zonder sleutel weg', () => {
    const lijst = chatModelKeuzes({}, ALLE);
    expect(lijst.some(k => k.provider === 'anthropic')).toBe(false);
  });

  it('neemt de modellen mee van een provider die wél een sleutel heeft', () => {
    const lijst = chatModelKeuzes({ openai: { key: 'x' } }, ALLE);
    expect(lijst.some(k => k.provider === 'openai' && k.model.startsWith('gpt'))).toBe(true);
  });

  it('geeft elke keuze een toelichting', () => {
    // Een lijst met twintig model-ids zonder uitleg is geen keuze maar een test.
    for (const k of chatModelKeuzes({ anthropic: { key: 'x' } }, ALLE)) {
      expect(k.toelichting.length).toBeGreaterThan(0);
    }
  });
});

describe('labels', () => {
  it('maakt van een motornaam iets leesbaars', () => {
    expect(modelLabel('abonnement' as ProviderId, 'codex')).toContain('ChatGPT');
    expect(modelLabel('abonnement' as ProviderId, 'claude')).toContain('Claude');
  });

  it('laat een echt model-id staan zoals het is', () => {
    // Dat is wat de provider verwacht; er iets moois van maken zou betekenen dat
    // je het ergens weer terug moet vertalen.
    expect(modelLabel('openai' as ProviderId, 'gpt-4o-mini')).toBe('gpt-4o-mini');
  });
});

describe('welke actief is', () => {
  const keuze = { provider: 'openai' as ProviderId, model: 'gpt-4o-mini', label: 'x', toelichting: 'y' };

  it('kijkt naar provider én model', () => {
    // Hetzelfde model-id kan bij twee providers voorkomen -- openrouter draagt
    // er veel van anderen.
    expect(isActief(keuze, { provider: 'openai', model: 'gpt-4o-mini' })).toBe(true);
    expect(isActief(keuze, { provider: 'openrouter', model: 'gpt-4o-mini' })).toBe(false);
  });

  it('behandelt een ontbrekend model als leeg', () => {
    expect(isActief(keuze, { provider: 'openai', model: null })).toBe(false);
    expect(isActief(keuze, null)).toBe(false);
  });
});
