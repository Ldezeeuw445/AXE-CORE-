import { describe, it, expect } from 'vitest';
import type { OhlcBar } from '@/domain/tradingIntel/demoTypes';
import {
  publicatieMoment, meetVenster, impactGeschiedenis, impactVoorAgent,
  MIN_METINGEN, RELEASE_UUR_ET,
} from '@/domain/tradingIntel/gebeurtenisImpact';

const MIN = 60_000;

/** Balken van een kwartier vanaf `start`, met opgegeven slotkoersen. */
function balken(start: number, sloten: number[], stapMin = 15): OhlcBar[] {
  return sloten.map((c, i) => ({
    t: start + i * stapMin * MIN, o: c, h: c, l: c, c, v: 0,
  }));
}

describe('publicatieMoment', () => {
  it('zet 08:30 New York om naar UTC in de winter', () => {
    // Januari: EST, UTC-5 → 13:30 UTC.
    const t = publicatieMoment('2026-01-09')!;
    expect(new Date(t).toISOString()).toBe('2026-01-09T13:30:00.000Z');
  });

  it('zet 08:30 New York om naar UTC in de zomer', () => {
    // Juli: EDT, UTC-4 → 12:30 UTC. Een vast verschil aanhouden schuift het
    // meetvenster hier een uur, precies over de publicatie heen.
    const t = publicatieMoment('2026-07-02')!;
    expect(new Date(t).toISOString()).toBe('2026-07-02T12:30:00.000Z');
  });

  it('klopt ook op de dag dat de klok verspringt', () => {
    // De VS gaan over op de tweede zondag van maart; 2026 is dat 8 maart.
    // De vrijdag ervoor is nog EST, de vrijdag erna al EDT.
    expect(new Date(publicatieMoment('2026-03-06')!).toISOString()).toBe('2026-03-06T13:30:00.000Z');
    expect(new Date(publicatieMoment('2026-03-13')!).toISOString()).toBe('2026-03-13T12:30:00.000Z');
  });

  it('geeft null op een datum die niet bestaat', () => {
    expect(publicatieMoment('geen-datum')).toBeNull();
  });

  it('gebruikt het publicatie-uur uit de constante', () => {
    // Zodat het uur niet stiekem ergens anders nog eens hardgecodeerd staat.
    const t = publicatieMoment('2026-01-09')!;
    const uurUtc = new Date(t).getUTCHours();
    expect(uurUtc).toBe(RELEASE_UUR_ET + 5); // EST = UTC-5
  });
});

describe('meetVenster', () => {
  const T = Date.UTC(2026, 0, 9, 13, 30); // 08:30 ET

  it('meet vanaf de balk die vóór de publicatie sluit, niet die erop opent', () => {
    // Balken vanaf 13:00. De balk van 13:30 ópent op de publicatie: zijn slot
    // bevat de sprong al. De beginprijs is dus 13:15, slot 100.
    const bars = balken(T - 30 * MIN, [99, 100, 101, 102, 103, 104, 105]);
    const m = meetVenster(bars, T, 60)!;
    expect(m.voor).toBe(100);
  });

  it('rekent de verandering over het venster, niet over de hele reeks', () => {
    const bars = balken(T - 15 * MIN, [100, 101, 102, 103, 104, 200]);
    // Venster van 60 min: 13:30, 13:45, 14:00, 14:15, 14:30 → slot 104.
    const m = meetVenster(bars, T, 60)!;
    expect(m.voor).toBe(100);
    expect(m.na).toBe(104);
    expect(m.procent).toBeCloseTo(4, 6);
  });

  it('ziet een duik die het slot niet laat zien', () => {
    // Sluit vlak op +0,1%, maar dook onderweg 1,2% weg — dat raakt een stop.
    const bars: OhlcBar[] = [
      { t: T - 15 * MIN, o: 100, h: 100, l: 100, c: 100, v: 0 },
      { t: T + 15 * MIN, o: 100, h: 100, l: 98.8, c: 99, v: 0 },
      { t: T + 45 * MIN, o: 99, h: 100.1, l: 99, c: 100.1, v: 0 },
      // Draagt niets bij aan het venster; bewijst dat de reeks doorliep.
      { t: T + 60 * MIN, o: 100.1, h: 100.1, l: 100.1, c: 100.1, v: 0 },
    ];
    const m = meetVenster(bars, T, 60)!;
    expect(m.procent).toBeCloseTo(0.1, 6);
    expect(m.uitslag).toBeCloseTo(1.2, 6);
  });

  it('laat een balk die precies op het venstereinde opent buiten beschouwing', () => {
    // Die balk gaat over wat ná het uur gebeurde. Meetellen zou een uur meten
    // en er anderhalf rapporteren.
    const bars: OhlcBar[] = [
      { t: T - 15 * MIN, o: 100, h: 100, l: 100, c: 100, v: 0 },
      { t: T + 30 * MIN, o: 100, h: 101, l: 100, c: 101, v: 0 },
      { t: T + 60 * MIN, o: 101, h: 150, l: 101, c: 150, v: 0 },
    ];
    const m = meetVenster(bars, T, 60)!;
    expect(m.na).toBe(101);
    expect(m.uitslag).toBeCloseTo(1, 6);
  });

  it('weigert te meten zonder beginprijs', () => {
    // Reeks begint pas ná de publicatie: er is geen prijs van ervoor.
    const bars = balken(T + 15 * MIN, [100, 101, 102, 103, 104, 105]);
    expect(meetVenster(bars, T, 60)).toBeNull();
  });

  it('weigert te meten als de reeks het venster niet dekt', () => {
    // Houdt op om 14:00, het venster loopt tot 14:30. Nul teruggeven zou van
    // ontbrekende data een rustige markt maken.
    const bars = balken(T - 15 * MIN, [100, 101, 102]);
    expect(meetVenster(bars, T, 60)).toBeNull();
  });

  it('geeft null bij een lege reeks', () => {
    expect(meetVenster([], T, 60)).toBeNull();
  });
});

describe('impactGeschiedenis', () => {
  /** Zes maandelijkse publicaties met een vaste beweging erna. */
  function metZes(bewegingPct: number[]) {
    const data = ['2026-01-09', '2026-02-06', '2026-03-06', '2026-04-03', '2026-05-08', '2026-06-05'];
    const bars: OhlcBar[] = [];
    data.forEach((d, i) => {
      const T = publicatieMoment(d)!;
      const na = 100 * (1 + bewegingPct[i] / 100);
      bars.push({ t: T - 15 * MIN, o: 100, h: 100, l: 100, c: 100, v: 0 });
      bars.push({ t: T + 30 * MIN, o: 100, h: Math.max(100, na), l: Math.min(100, na), c: na, v: 0 });
      bars.push({ t: T + 60 * MIN, o: na, h: Math.max(100, na), l: Math.min(100, na), c: na, v: 0 });
      bars.push({ t: T + 75 * MIN, o: na, h: na, l: na, c: na, v: 0 });
    });
    return {
      bars,
      gebeurtenissen: data.map(d => ({ datum: d, naam: 'Employment Situation' })),
    };
  }

  it('meet elke publicatie apart en zet de nieuwste bovenaan', () => {
    const { bars, gebeurtenissen } = metZes([0.8, -0.4, 0.9, 0.6, 1.1, 0.5]);
    const g = impactGeschiedenis({ symbool: 'XAUUSD', naam: 'Employment Situation', gebeurtenissen, bars });

    expect(g.metingen).toHaveLength(6);
    expect(g.metingen[0].datum).toBe('2026-06-05');
    expect(g.metingen[0].procent).toBeCloseTo(0.5, 6);
  });

  it('gebruikt de mediaan, zodat één uitschieter de verwachting niet zet', () => {
    // Vijf rustige prints en één van 5%. Een gemiddelde zou ~1,2% zeggen.
    const { bars, gebeurtenissen } = metZes([0.4, 0.5, 0.4, 0.6, 0.5, 5.0]);
    const s = impactGeschiedenis({ symbool: 'XAUUSD', naam: 'Employment Situation', gebeurtenissen, bars }).samenvatting;

    expect(s.medianeBeweging!).toBeLessThan(1);
    expect(s.grootste!.uitslag).toBeCloseTo(5, 6);
  });

  it('telt de richting en zegt hoe vast die is', () => {
    const { bars, gebeurtenissen } = metZes([0.8, -0.4, 0.9, 0.6, 1.1, 0.5]);
    const s = impactGeschiedenis({ symbool: 'XAUUSD', naam: 'Employment Situation', gebeurtenissen, bars }).samenvatting;

    expect(s.richting).toBe('omhoog');
    expect(s.richtingVastheid).toBeCloseTo(5 / 6, 6);
  });

  it('laat publicaties van een andere release links liggen', () => {
    const { bars, gebeurtenissen } = metZes([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const g = impactGeschiedenis({
      symbool: 'XAUUSD', naam: 'Consumer Price Index',
      gebeurtenissen, bars,
    });
    expect(g.metingen).toHaveLength(0);
  });

  it('vat niets samen onder de drempel — en telt wat het miste', () => {
    const { bars, gebeurtenissen } = metZes([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const weinig = gebeurtenissen.slice(0, MIN_METINGEN - 1);
    const s = impactGeschiedenis({ symbool: 'XAUUSD', naam: 'Employment Situation', gebeurtenissen: weinig, bars }).samenvatting;

    expect(s.gemeten).toBe(MIN_METINGEN - 1);
    expect(s.medianeBeweging).toBeNull();
  });

  it('telt publicaties zonder koersdata als ongemeten, niet als rustig', () => {
    const { bars, gebeurtenissen } = metZes([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const extra = [...gebeurtenissen, { datum: '2026-07-02', naam: 'Employment Situation' }];
    const s = impactGeschiedenis({ symbool: 'XAUUSD', naam: 'Employment Situation', gebeurtenissen: extra, bars }).samenvatting;

    expect(s.gemeten).toBe(6);
    expect(s.ongemeten).toBe(1);
  });

  it('valt niet om zonder balken', () => {
    const g = impactGeschiedenis({
      symbool: 'XAUUSD', naam: 'Employment Situation',
      gebeurtenissen: [{ datum: '2026-01-09', naam: 'Employment Situation' }],
      bars: null,
    });
    expect(g.metingen).toHaveLength(0);
    expect(g.samenvatting.ongemeten).toBe(1);
  });
});

describe('impactVoorAgent', () => {
  function geschiedenis(bewegingen: number[]) {
    const data = ['2026-01-09', '2026-02-06', '2026-03-06', '2026-04-03', '2026-05-08', '2026-06-05']
      .slice(0, bewegingen.length);
    const bars: OhlcBar[] = [];
    data.forEach((d, i) => {
      const T = publicatieMoment(d)!;
      const na = 100 * (1 + bewegingen[i] / 100);
      bars.push({ t: T - 15 * MIN, o: 100, h: 100, l: 100, c: 100, v: 0 });
      bars.push({ t: T + 30 * MIN, o: 100, h: Math.max(100, na), l: Math.min(100, na), c: na, v: 0 });
      bars.push({ t: T + 60 * MIN, o: na, h: na, l: na, c: na, v: 0 });
    });
    return impactGeschiedenis({
      symbool: 'XAUUSD', naam: 'Employment Situation',
      gebeurtenissen: data.map(d => ({ datum: d, naam: 'Employment Situation' })),
      bars,
    });
  }

  it('noemt de uitslag apart van de verandering', () => {
    const tekst = impactVoorAgent(geschiedenis([0.8, -0.4, 0.9, 0.6, 1.1, 0.5]));
    expect(tekst).toContain('XAUUSD');
    expect(tekst).toContain('stop');
  });

  it('zegt "onbekend, niet rustig" wanneer er te weinig is', () => {
    const tekst = impactVoorAgent(geschiedenis([0.5, 0.5]));
    expect(tekst).toContain('onbekend, niet rustig');
  });

  it('waarschuwt niet voor een richting om op te handelen', () => {
    // Zes van de zes omhoog is opvallend, en nog steeds geen handelssignaal.
    const tekst = impactVoorAgent(geschiedenis([0.5, 0.6, 0.4, 0.7, 0.5, 0.6]));
    expect(tekst).toContain('te weinig om op te handelen');
  });
});
