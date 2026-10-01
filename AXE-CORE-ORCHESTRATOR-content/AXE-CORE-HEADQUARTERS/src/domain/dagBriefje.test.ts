/**
 * Het dagbriefje, op de vormen die echt voorkomen.
 *
 * Dit wordt HARDOP voorgelezen bij de eerste groet van de dag, dus de vormen die
 * hier getest worden zijn de vormen die Luka te horen krijgt: niets te laat,
 * alles te laat, minder dan drie taken, geen agenda, en helemaal leeg. Die
 * laatste is de belangrijkste -- een briefje dat "de top 0" zegt is erger dan
 * geen briefje.
 */
import { describe, it, expect } from 'vitest';
import { TOP_AANTAL, briefjeSlug, dagBriefjeTekst, topDrie, type DagKijk } from './dagBriefje';

const kijk = (over: Partial<DagKijk> = {}): DagKijk => ({
  teLaat: [], open: [], agenda: [], openTaken: 0, teLateTaken: 0, ...over,
});

describe('topDrie', () => {
  it('zet wat over tijd is vooraan', () => {
    expect(topDrie(kijk({
      teLaat: ['Factuur sturen'],
      open: ['Trading desk opschonen', 'Bouwlijst bijwerken'],
      openTaken: 3,
      teLateTaken: 1,
    }))).toEqual(['Factuur sturen', 'Trading desk opschonen', 'Bouwlijst bijwerken']);
  });

  it('houdt het op drie, ook met meer te laat', () => {
    const veel = ['a', 'b', 'c', 'd', 'e'];
    expect(topDrie(kijk({ teLaat: veel, openTaken: 5, teLateTaken: 5 }))).toEqual(['a', 'b', 'c']);
    expect(TOP_AANTAL).toBe(3);
  });

  it('noemt niets twee keer, ook als het in beide lijsten staat', () => {
    // De te-late lijst komt uit core_tasks en de open lijst uit de planner;
    // dezelfde taak staat dus vaak in beide.
    expect(topDrie(kijk({
      teLaat: ['Factuur sturen'],
      open: ['factuur sturen', 'Iets anders'],
      openTaken: 2,
      teLateTaken: 1,
    }))).toEqual(['Factuur sturen', 'Iets anders']);
  });

  it('minder dan drie is geen fout', () => {
    expect(topDrie(kijk({ open: ['Eén ding'], openTaken: 1 }))).toEqual(['Eén ding']);
    expect(topDrie(kijk())).toEqual([]);
  });

  it('slaat lege titels over in plaats van ze op te lezen', () => {
    expect(topDrie(kijk({ open: ['', '   ', 'Echt iets'], openTaken: 3 }))).toEqual(['Echt iets']);
  });
});

describe('dagBriefjeTekst', () => {
  it('zegt hoeveel er over tijd staat, en wat de top is', () => {
    const t = dagBriefjeTekst(kijk({
      teLaat: ['Factuur sturen'],
      open: ['Trading desk opschonen'],
      agenda: ['14:00 call met de bank'],
      openTaken: 2,
      teLateTaken: 1,
    }));
    expect(t).toContain('één taak over tijd');
    expect(t).toContain('Factuur sturen');
    expect(t).toContain('14:00 call met de bank');
  });

  it('is leeg als er niets is -- geen opgewekte zin over een leeg briefje', () => {
    expect(dagBriefjeTekst(kijk())).toBe('');
  });

  it('zegt het gewoon als er niets open staat maar er wel een agenda is', () => {
    const t = dagBriefjeTekst(kijk({ agenda: ['09:30 tandarts'] }));
    expect(t).toContain('geen open taken');
    expect(t).toContain('09:30 tandarts');
  });

  it('noemt de rest als een getal in plaats van alles op te lezen', () => {
    const t = dagBriefjeTekst(kijk({
      open: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      openTaken: 7,
    }));
    expect(t).toContain('4 open taken');
    expect(t).not.toContain('"g"');
  });

  it('kapt een lange agenda af', () => {
    const t = dagBriefjeTekst(kijk({
      agenda: ['een', 'twee', 'drie', 'vier', 'vijf'],
      openTaken: 0,
    }));
    expect(t).toContain('en nog 2');
  });

  /* Het gaat door TTS. Een opsommingsteken of een kop wordt letterlijk
     voorgelezen, en dat is precies waarom de stemregels in prompts.ts ze
     verbieden -- dan hoort deze tekst ze ook niet te bevatten. */
  it('bevat niets wat alleen op papier werkt', () => {
    const t = dagBriefjeTekst(kijk({
      teLaat: ['Factuur sturen'],
      open: ['Iets', 'Nog iets'],
      agenda: ['14:00 call'],
      openTaken: 5,
      teLateTaken: 1,
    }));
    expect(t).not.toMatch(/[*#•\n]|^- /);
    expect(t.length).toBeLessThan(400);
  });

  it('gebruikt enkelvoud en meervoud waar het hoort', () => {
    expect(dagBriefjeTekst(kijk({ open: ['a', 'b', 'c', 'd'], openTaken: 4 }))).toContain('1 open taak');
    expect(dagBriefjeTekst(kijk({ teLaat: ['a', 'b'], openTaken: 2, teLateTaken: 2 }))).toContain('2 taken over tijd');
  });
});

describe('briefjeSlug', () => {
  it('is één sleutel per dag, zodat het briefje niet elke keer een nieuwe rij wordt', () => {
    const ochtend = new Date('2026-10-01T07:12:00Z');
    const avond = new Date('2026-10-01T21:48:00Z');
    expect(briefjeSlug(ochtend)).toBe('briefje-2026-10-01');
    expect(briefjeSlug(avond)).toBe(briefjeSlug(ochtend));
    expect(briefjeSlug(new Date('2026-10-02T07:12:00Z'))).not.toBe(briefjeSlug(ochtend));
  });
});
