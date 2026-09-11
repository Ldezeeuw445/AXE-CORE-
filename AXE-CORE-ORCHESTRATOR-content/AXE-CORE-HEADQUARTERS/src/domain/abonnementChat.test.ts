import { describe, it, expect } from 'vitest';
import {
  motorVanSlot, bouwPrompt, kiesRepo, ABONNEMENT_MODUS, STANDAARD_MOTOR,
} from '@/domain/abonnementChat';

describe('welke motor', () => {
  it('leest de motornaam uit het modelveld', () => {
    expect(motorVanSlot('codex')).toBe('codex');
    expect(motorVanSlot('cursor')).toBe('cursor');
  });

  it('valt terug op de standaardmotor bij iets onbekends', () => {
    // Een oude opgeslagen keuze of een typefout hoort een werkende chat te
    // geven, niet een foutmelding waar de lezer niets aan kan doen.
    //
    // Tegen de CONSTANTE en niet tegen een uitgeschreven naam: deze test pinde
    // 'claude' vast en viel om zodra de standaard naar codex ging -- terwijl
    // het gedrag dat hij bewaakt (onbekend valt terug, niet weigeren) precies
    // hetzelfde was gebleven. Een test die breekt op een keuze in plaats van op
    // een regel, leert je alleen dat je iets hebt aangepast.
    expect(motorVanSlot('gpt-4o')).toBe(STANDAARD_MOTOR);
    expect(motorVanSlot(undefined)).toBe(STANDAARD_MOTOR);
    expect(motorVanSlot('')).toBe(STANDAARD_MOTOR);
  });

  it('de standaard is een motor die bestaat', () => {
    // De regel die er wél toe doet. 'gpt-4o' als standaard zou door elke test
    // hierboven komen en pas bij de eerste echte aanroep stuk gaan.
    expect(['claude', 'codex', 'cursor']).toContain(STANDAARD_MOTOR);
  });

  it('trekt zich niets aan van hoofdletters of spaties', () => {
    expect(motorVanSlot('  Codex ')).toBe('codex');
  });
});

describe('de prompt', () => {
  it('houdt vraag en antwoord uit elkaar', () => {
    // Zonder labels loopt wat Luka vroeg over in wat AXE antwoordde, en dan
    // leest de motor zijn eigen vorige antwoord als een instructie.
    const p = bouwPrompt([
      { role: 'user', content: 'eerste vraag' },
      { role: 'assistant', content: 'eerste antwoord' },
      { role: 'user', content: 'tweede vraag' },
    ]);
    expect(p).toContain('Luka: eerste vraag');
    expect(p).toContain('AXE: eerste antwoord');
  });

  it('zet de laatste vraag aan het eind, zonder label', () => {
    const p = bouwPrompt([
      { role: 'user', content: 'oud' },
      { role: 'assistant', content: 'antwoord' },
      { role: 'user', content: 'waar staat de pairRegistry?' },
    ]);
    expect(p.endsWith('waar staat de pairRegistry?')).toBe(true);
  });

  it('zet het systeembericht bovenaan en niet als beurt', () => {
    // Het is de staande opdracht, geen beurt; halverwege een gesprek lijken
    // maakt hem zwakker dan hij hoort te zijn.
    const p = bouwPrompt([
      { role: 'system', content: 'Je bent AXE.' },
      { role: 'user', content: 'hoi' },
    ]);
    expect(p.startsWith('Je bent AXE.')).toBe(true);
    expect(p).not.toContain('Luka: hoi');
  });

  it('werkt met alleen een vraag', () => {
    expect(bouwPrompt([{ role: 'user', content: 'hoi' }])).toBe('hoi');
  });

  it('geeft een lege tekst bij een leeg gesprek', () => {
    expect(bouwPrompt([])).toBe('');
  });
});

describe('welke repo', () => {
  it('respecteert je keuze', () => {
    expect(kiesRepo('b', { a: { runnable: true }, b: { runnable: true } })).toBe('b');
  });

  it('negeert een keuze die niet kan draaien', () => {
    // Bijvoorbeeld een checkout die op main staat. Weigeren terwijl er een
    // werkend alternatief naast ligt, maakt de chat onbruikbaar.
    expect(kiesRepo('b', { a: { runnable: true }, b: { runnable: false } })).toBe('a');
  });

  it('kiest stabiel, niet willekeurig', () => {
    // Alfabetisch en niet "de eerste uit het object": objectvolgorde hangt af
    // van hoe de host antwoordde, en dan praat de chat de ene keer vanuit de
    // ene repo en de andere keer vanuit een andere.
    expect(kiesRepo(null, { zeta: { runnable: true }, alfa: { runnable: true } })).toBe('alfa');
  });

  it('geeft null als er niets bruikbaars is', () => {
    // De aanroeper moet dit mélden. Waar deze chat draait bepaalt welke code
    // hij leest, en dat mag nooit een gok zijn.
    expect(kiesRepo('a', { a: { runnable: false } })).toBeNull();
    expect(kiesRepo(null, {})).toBeNull();
  });
});

describe('de modus', () => {
  it('is alleen-lezen', () => {
    // De hele reden dat dit een constante is: een chatvenster mag nooit
    // bestanden herschrijven omdat je een vraag stelde.
    expect(ABONNEMENT_MODUS).toBe('plan');
  });
});
