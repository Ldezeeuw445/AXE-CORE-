/**
 * De vier standen van een leeg chatvak.
 *
 * Wat hier echt kapot kan: "nog niets gezegd" tonen terwijl het opslaan stuk is
 * (dan lijkt alles in orde en gaat het gesprek verloren), eeuwig "ophalen..."
 * tonen, en een fout melden vóór er één poging gedaan is.
 */
import { describe, it, expect } from 'vitest';
import { gesprekStand, type GesprekStandKijk } from './gesprekStand';

const kijk = (over: Partial<GesprekStandKijk> = {}): GesprekStandKijk => ({
  berichten: 0, laadt: false, opslaanOk: true, opslaanFouten: 0,
  ladenOk: true, ladenGeprobeerd: true, ...over,
});

describe('gesprekStand', () => {
  it('zwijgt zodra er een gesprek in beeld staat', () => {
    expect(gesprekStand(kijk({ berichten: 3 }))).toBe('stil');
  });

  it('zegt dat er niets bewaard wordt -- ook met een vol gesprek in beeld', () => {
    // Dit is het geval dat zes weken onzichtbaar was: de chat werkt, de
    // antwoorden komen, en niets wordt vastgelegd.
    expect(gesprekStand(kijk({ berichten: 12, opslaanOk: false, opslaanFouten: 4 })))
      .toBe('bewaart-niet');
  });

  it('gaat vóór de laadmeldingen -- wat je nu doet weegt zwaarder dan wat er was', () => {
    expect(gesprekStand(kijk({ opslaanOk: false, opslaanFouten: 1, laadt: true })))
      .toBe('bewaart-niet');
    expect(gesprekStand(kijk({ opslaanOk: false, opslaanFouten: 1, ladenOk: false })))
      .toBe('bewaart-niet');
  });

  it('meldt het ophalen zolang dat loopt', () => {
    expect(gesprekStand(kijk({ laadt: true, ladenGeprobeerd: false }))).toBe('laadt');
  });

  it('meldt een mislukte poging, in plaats van een leeg vak', () => {
    expect(gesprekStand(kijk({ ladenOk: false }))).toBe('niet-geladen');
  });

  it('meldt niets over laden vóór de eerste poging', () => {
    // Anders staat er bij het opstarten een fout die nog niet gebeurd is.
    expect(gesprekStand(kijk({ ladenOk: false, ladenGeprobeerd: false }))).toBe('leeg');
  });

  it('zegt gewoon dat er niets gezegd is als dat zo is', () => {
    expect(gesprekStand(kijk())).toBe('leeg');
  });

  it('laat één hik geen kapotte app worden', () => {
    // `ok: false` zonder een getelde poging bestaat niet, maar als het ooit zo
    // gezet wordt hoort het niet als "wordt niet bewaard" op het scherm.
    expect(gesprekStand(kijk({ opslaanOk: false, opslaanFouten: 0 }))).toBe('leeg');
  });
});
