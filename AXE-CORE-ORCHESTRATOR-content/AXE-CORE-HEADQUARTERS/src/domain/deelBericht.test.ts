import { describe, it, expect } from 'vitest';
import { deelBerichtVan, deelBerichtUitZoek } from '@/domain/deelBericht';

describe('deelBerichtVan', () => {
  it('geeft null als er niets gedeeld is', () => {
    expect(deelBerichtVan({})).toBeNull();
    expect(deelBerichtVan({ title: '  ', text: '', url: null })).toBeNull();
  });

  it('alleen tekst blijft alleen tekst', () => {
    expect(deelBerichtVan({ text: 'kijk hier eens naar' })).toBe('kijk hier eens naar');
  });

  it('onderwerp en tekst komen onder elkaar', () => {
    expect(deelBerichtVan({ title: 'Rapport Q3', text: 'de cijfers kloppen niet' }))
      .toBe('Rapport Q3\n\nde cijfers kloppen niet');
  });

  it('herhaalt de titel niet als de app hem ook als tekst stuurt', () => {
    expect(deelBerichtVan({ title: 'Rapport Q3', text: 'Rapport Q3' })).toBe('Rapport Q3');
  });

  it('zet de link erbij als die nergens anders staat', () => {
    expect(deelBerichtVan({ title: 'Een artikel', url: 'https://nos.nl/x' }))
      .toBe('Een artikel\n\nhttps://nos.nl/x');
  });

  it('zet de link NIET nog een keer als hij al in de tekst staat', () => {
    // Dit is het echte geval: Chrome deelt de url in text EN in url.
    const uit = deelBerichtVan({
      title: 'Een artikel',
      text: 'https://nos.nl/x',
      url: 'https://nos.nl/x',
    });
    expect(uit).toBe('Een artikel\n\nhttps://nos.nl/x');
    expect(uit!.split('https://nos.nl/x').length - 1).toBe(1);
  });

  it('herkent een link die middenin een zin staat', () => {
    const uit = deelBerichtVan({
      text: 'moet je zien: https://nos.nl/x echt goed',
      url: 'https://nos.nl/x',
    });
    expect(uit).toBe('moet je zien: https://nos.nl/x echt goed');
  });
});

describe('deelBerichtUitZoek', () => {
  it('leest de velden uit de zoekreeks', () => {
    expect(deelBerichtUitZoek('?title=Hallo&text=wereld'))
      .toBe('Hallo\n\nwereld');
  });

  it('gecodeerde tekens komen er leesbaar uit', () => {
    expect(deelBerichtUitZoek('?text=twee%20regels%20%26%20een%20ampersand'))
      .toBe('twee regels & een ampersand');
  });

  it('een gewone paginabezoek zonder deling geeft null', () => {
    expect(deelBerichtUitZoek('')).toBeNull();
    expect(deelBerichtUitZoek('?utm_source=iets')).toBeNull();
  });
});
