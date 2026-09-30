/**
 * Wat de chat aan motoren krijgt voorgeschoteld.
 *
 * De reden voor dit bestand: ronde 2 van `collectAllSlots` las
 * `axe_llm_connections` zelf en duwde `c.model` er rauw in. Die ronde staat
 * vóór de ronde die `getProviderKeySlot` gebruikt, dus voor elke provider die
 * je ooit in Settings intypte won de opgeslagen modelnaam van de gemigreerde.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const opslag = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => opslag.get(k) ?? null,
  setItem: (k: string, v: string) => { opslag.set(k, v); },
  removeItem: (k: string) => { opslag.delete(k); },
});

/* voiceStore trekt de halve UI-laag mee. collectAllSlots leest er maar twee
   dingen uit: de vier gekozen slots, en de oplosser -- en die oplosser is
   sinds 16c1971a gewoon die uit providerSleutels. */
vi.mock('@/presentation/store/voiceStore', async () => {
  const echt = await import('@/infrastructure/config/providerSleutels');
  return {
    getProviderKeySlot: echt.getProviderKeySlot,
    useVoiceStore: {
      getState: () => ({
        primarySlot: null, fallback1Slot: null, fallback2Slot: null, fallback3Slot: null,
      }),
    },
  };
});

const { collectAllSlots } = await import('./chatSlots');

const zetVerbindingen = (v: Record<string, unknown>) =>
  opslag.set('axe_llm_connections', JSON.stringify(v));

describe('collectAllSlots', () => {
  beforeEach(() => opslag.clear());

  /* gemini-2.5-flash is geen verzonnen voorbeeld: Google zet het op
     16 oktober 2026 uit, en nieuwe sleutels mogen er sinds juli niet meer bij.
     Wie het ooit in Settings koos hield het tot deze fix in zijn cascade. */
  it('geeft de gemigreerde modelnaam door, niet de opgeslagen dode', () => {
    zetVerbindingen({ google: { key: 'AIza-een-sleutel', model: 'gemini-2.5-flash' } });
    const google = collectAllSlots().find(s => s.provider === 'google');
    expect(google).toBeTruthy();
    expect(google?.model).toBe('gemini-3.5-flash');
  });

  it('laat een provider die providers.ts niet kent staan zoals hij staat', () => {
    zetVerbindingen({ eigenserver: { key: 'sleutel-1234', model: 'iets-eigens' } });
    const eigen = collectAllSlots().find(s => s.provider === 'eigenserver');
    expect(eigen?.model).toBe('iets-eigens');
  });

  /* Een half ingetypte sleutel haalt ronde 2 niet en krijgt dus geen
     voorrang. Hij verdwijnt niet: ronde 3 loopt PROVIDERS af en pakt hem
     alsnog op -- achteraan, waar hij hoort. */
  it('een half ingevulde sleutel krijgt geen voorrang', () => {
    zetVerbindingen({ openai: { key: 'ab' }, google: { key: 'AIza-een-sleutel' } });
    const ids = collectAllSlots().map(s => s.provider);
    // Zonder de lengtecontrole zou openai hier eerst staan: Object.entries
    // houdt de volgorde van de opslag aan, en PROVIDERS zet openai voor google.
    expect(ids.indexOf('google')).toBeLessThan(ids.indexOf('openai'));
  });

  it('noemt elke provider hoogstens één keer', () => {
    zetVerbindingen({
      google: { key: 'AIza-x', model: 'gemini-2.5-flash' },
      openai: { key: 'sk-xxxx', model: 'gpt-4o' },
    });
    const ids = collectAllSlots().map(s => s.provider);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('overleeft kapotte opslag', () => {
    opslag.set('axe_llm_connections', 'geen json');
    expect(Array.isArray(collectAllSlots())).toBe(true);
  });
});
