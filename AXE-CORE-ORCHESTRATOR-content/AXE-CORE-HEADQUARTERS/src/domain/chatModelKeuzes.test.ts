import { describe, it, expect } from 'vitest';
import {
  chatModelKeuzes, providersMetSleutel, modelLabel, isActief,
  merkVan, merkenMetKeuzes, keuzesVanMerk, actiefMerk,
} from '@/domain/chatModelKeuzes';
import type { ProviderId } from '@/domain/providers';

const ALLE = ['anthropic', 'openai', 'google', 'ollama', 'groq', 'abonnement'] as ProviderId[];

describe('welke providers meedoen', () => {
  it('alleen die een sleutel hebben', () => {
    // Een keuze zonder sleutel valt stil door de cascade naar iets anders, en
    // dan zegt het scherm het ene terwijl het andere antwoordt.
    const p = providersMetSleutel({ anthropic: { key: 'x' } }, ALLE);
    expect(p).toContain('anthropic');
    expect(p).not.toContain('openai');
  });

  it('nooit Ollama, ook niet als het ergens een "sleutel" heeft', () => {
    // AXE's brein-keuze mag nooit Ollama zijn (CONFIRMED ARCHITECTURE, 17 sep) --
    // een dode lokale default maakte AXE eerder stil "unavailable" (zie
    // commit 4a01aa70 op providers.ts).
    expect(providersMetSleutel({ ollama: { key: 'x' } }, ALLE)).not.toContain('ollama');
    expect(providersMetSleutel({}, ALLE)).not.toContain('ollama');
  });

  it('nooit de abonnementsweg, ook niet als het een "sleutel" heeft', () => {
    // De abonnementsweg is voor de tier-1 managers (agentMotoren.ts), niet
    // voor AXE's eigen model-antwoord.
    expect(providersMetSleutel({ abonnement: { key: 'x' } }, ALLE)).not.toContain('abonnement');
  });

  it('een lege sleutel telt niet als een sleutel', () => {
    expect(providersMetSleutel({ openai: { key: '' } }, ALLE)).not.toContain('openai');
  });

  it('overleeft null', () => {
    expect(() => providersMetSleutel(null, ALLE)).not.toThrow();
  });
});

describe('de lijst', () => {
  it('biedt nooit de abonnementsweg aan', () => {
    const lijst = chatModelKeuzes({}, ALLE);
    expect(lijst.some(k => k.provider === 'abonnement')).toBe(false);
  });

  it('biedt nooit Ollama aan, met of zonder sleutel', () => {
    expect(chatModelKeuzes({}, ALLE).some(k => k.provider === 'ollama')).toBe(false);
    expect(chatModelKeuzes({ ollama: { key: 'x' } }, ALLE).some(k => k.provider === 'ollama')).toBe(false);
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

describe('merken', () => {
  const alles = chatModelKeuzes({ anthropic: { key: 'x' }, openai: { key: 'x' } }, ALLE);

  it('zet de API-providers onder hun eigen merk', () => {
    expect(merkVan({ provider: 'anthropic' as ProviderId, model: 'claude-sonnet-5', label: '', toelichting: '' })).toBe('claude');
    expect(merkVan({ provider: 'openai' as ProviderId, model: 'gpt-4o-mini', label: '', toelichting: '' })).toBe('chatgpt');
    expect(merkVan({ provider: 'google' as ProviderId, model: 'gemini', label: '', toelichting: '' })).toBe('overig');
  });

  it('native staat er altijd bij, ook zonder een enkele sleutel', () => {
    expect(merkenMetKeuzes(chatModelKeuzes({}, ALLE))).toContain('native');
  });

  it('laat een merk weg dat niets te kiezen heeft', () => {
    // Een knop die niets oplevert probeer je één keer en wantrouw je daarna.
    // Zonder Ollama-uitzondering blijft 'overig' nu ook gewoon leeg zonder
    // sleutel.
    const m = merkenMetKeuzes(chatModelKeuzes({ anthropic: { key: 'x' } }, ALLE));
    expect(m).not.toContain('overig');
    expect(m).toContain('claude');
  });

  it('geeft elke keuze binnen een merk terug', () => {
    const claude = keuzesVanMerk(alles, 'claude');
    expect(claude.every(k => k.provider === 'anthropic')).toBe(true);
  });

  it('geen primair slot betekent native', () => {
    // Dat IS de betekenis van geen keuze, en het hoort zo op het scherm te staan
    // in plaats van als een leeg veld.
    expect(actiefMerk(null)).toBe('native');
    expect(actiefMerk({ provider: null, model: null })).toBe('native');
    expect(actiefMerk({ provider: 'openai', model: 'gpt-4o-mini' })).toBe('chatgpt');
  });
});
