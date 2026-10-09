import { describe, it, expect } from 'vitest';
import { platUitHtml, titelUit, fragmentUit, zoek, groepeer, datumLabel, NIEUWE_TITEL, type Notitie } from './notities';

const n = (id: string, inhoud: string, aangepast: string): Notitie => ({ id, titel: titelUit(inhoud), inhoud, gemaakt: aangepast, aangepast });

// Luka, 9 okt: een echt notitiesvenster, zoals Apple Notes, over het hele bureaublad.
describe('notities', () => {
  it('leest HTML als platte tekst met regeleinden en entiteiten', () => {
    expect(platUitHtml('<div>Eerste</div><div>Tweede&nbsp;regel &amp; meer</div>')).toBe('Eerste\nTweede regel & meer\n');
    expect(platUitHtml('a<br>b')).toBe('a\nb');
  });

  it('de titel is de eerste regel, ingekort; een lege notitie heet New note', () => {
    expect(titelUit('<div>Boodschappen</div><div>melk</div>')).toBe('Boodschappen');
    expect(titelUit('<div></div>')).toBe(NIEUWE_TITEL);
    expect(titelUit(`<div>${'x'.repeat(80)}</div>`)).toBe(`${'x'.repeat(53)}…`);
  });

  it('het fragment is de tekst na de titel op één regel', () => {
    expect(fragmentUit('<div>Titel</div><div>een</div><div>twee</div>')).toBe('een twee');
    expect(fragmentUit('<div>Alleen titel</div>')).toBe('');
  });

  it('zoeken: elk woord moet voorkomen, in titel of tekst, zonder hoofdletters', () => {
    const lijst = [n('a', '<div>Idee</div><div>Restaurant boeken Amsterdam</div>', '2026-10-09T10:00:00'), n('b', '<div>Taken</div>', '2026-10-09T09:00:00')];
    expect(zoek(lijst, 'amsterdam RESTAURANT').map(x => x.id)).toEqual(['a']);
    expect(zoek(lijst, 'taken amsterdam')).toEqual([]);
    expect(zoek(lijst, '  ')).toHaveLength(2);
  });

  it('groepeert op vandaag, gisteren, laatste 7 dagen en eerder, nieuwste bovenaan, zonder lege groepen', () => {
    const nu = new Date('2026-10-09T12:00:00');
    const lijst = [
      n('oud', '<div>Oud</div>', '2026-09-01T10:00:00'),
      n('ochtend', '<div>Ochtend</div>', '2026-10-09T08:00:00'),
      n('middag', '<div>Middag</div>', '2026-10-09T11:00:00'),
      n('gisteren', '<div>Gisteren</div>', '2026-10-08T23:00:00'),
      n('week', '<div>Week</div>', '2026-10-05T10:00:00'),
    ];
    const g = groepeer(lijst, nu);
    expect(g.map(x => x.kop)).toEqual(['Today', 'Yesterday', 'Previous 7 days', 'Earlier']);
    expect(g[0].items.map(x => x.id)).toEqual(['middag', 'ochtend']);
    expect(groepeer([lijst[0]], nu).map(x => x.kop)).toEqual(['Earlier']);
  });

  it('het datumlabel zegt de tijd vandaag en een woord daarna', () => {
    const nu = new Date('2026-10-09T12:00:00');
    expect(datumLabel('2026-10-09T08:05:00', nu)).toMatch(/08:05/);
    expect(datumLabel('2026-10-08T08:05:00', nu)).toBe('Yesterday');
    expect(datumLabel('2026-10-06T08:05:00', nu)).toBe('Tuesday');
  });
});
