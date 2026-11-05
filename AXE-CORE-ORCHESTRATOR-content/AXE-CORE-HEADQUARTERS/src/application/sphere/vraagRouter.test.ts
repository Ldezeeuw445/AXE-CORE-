import { describe, expect, it } from 'vitest';
import { looksLikeChart, looksLikeMap } from './vraagRouter';

/**
 * Wat herkent AXE als "laat me iets zien", en wat juist niet.
 *
 * De router zelf (`projectieUitVraag`) geocodeert en gaat dus het net op; die
 * is hier niet te draaien zonder Nominatim te bellen. Wat wél te toetsen is,
 * en waar de fouten zitten, is de herkenning: een vraag die geen kaart wil en
 * er toch een krijgt, en omgekeerd.
 *
 * Het tweede geval is het belangrijkste. Elke notch-vraag loopt hier langs,
 * dus "wat staat er in mijn agenda" mag geen geocode van het woord "agenda"
 * worden.
 */

describe('een vraag die om een kaart vraagt', () => {
  const ja = [
    'laat me de kaart van LA zien',
    'AXE, laat de kaart van Los Angeles zien',
    'waar is Rotterdam',
    'show me New York',
    'toon Amsterdam',
    'ga naar Tokyo',
    'locatie van het kantoor',
    'Los Angeles',
    'NYC',
  ];
  for (const vraag of ja) {
    it(`herkent: ${vraag}`, () => {
      expect(looksLikeMap(vraag)).toBe(true);
    });
  }
});

describe('een gewone vraag krijgt geen kaart', () => {
  const nee = [
    'wat staat er in mijn agenda',
    'hoe staat de build van companion ervoor',
    'schrijf een mail naar de klant',
    'wat zijn mijn approvals',
    'maak een samenvatting van dit document',
    'hoeveel heb ik deze maand uitgegeven',
  ];
  for (const vraag of nee) {
    it(`laat staan: ${vraag}`, () => {
      expect(looksLikeMap(vraag)).toBe(false);
    });
  }
});

describe('een grafiek is geen kaart', () => {
  it('een koersvraag is een grafiek', () => {
    expect(looksLikeChart('laat de BTC koers zien')).toBe(true);
  });

  it('en een plaatsnaam blijft een kaart, ook als er "open" bij staat', () => {
    expect(looksLikeMap('open Tokyo')).toBe(true);
    expect(looksLikeChart('open Tokyo')).toBe(false);
  });

  it('"laat de kaart van LA zien" telt niet als grafiek', () => {
    // Beide waar zou betekenen dat de volgorde in projectieUitVraag bepaalt
    // wat je krijgt, en dan is "kaart" afhankelijk van een if-reeks.
    expect(looksLikeChart('laat de kaart van LA zien')).toBe(false);
  });
});
