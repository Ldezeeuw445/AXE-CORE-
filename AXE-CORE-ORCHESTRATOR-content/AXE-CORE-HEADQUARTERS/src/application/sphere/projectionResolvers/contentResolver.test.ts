import { describe, it, expect } from 'vitest';
import { subjectOfShow, wantsShownContent } from './contentResolver';

/* "Hey AXE, open Google en zoek dit op" moet op de bol eindigen, net als
   "laat New York zien". Voor 7 okt zag de regisseur alleen laat/toon/show. */
describe('opzoeken is ook laten zien', () => {
  it.each([
    ['open google en zoek de beste pizza in amsterdam op', 'beste pizza in amsterdam'],
    ['kan je google openen en dit opzoeken: bitcoin koers', 'bitcoin koers'],
    ['google het weer in Rotterdam', 'weer in Rotterdam'],
    ['can you look up the Fed rate decision', 'Fed rate decision'],
    ['search for Tauri 2 release notes', 'Tauri 2 release notes'],
  ])('%s', (zin, onderwerp) => {
    expect(wantsShownContent(zin)).toBe(true);
    expect(subjectOfShow(zin)).toBe(onderwerp);
  });

  it('zoeken in eigen spullen is geen webzoekopdracht', () => {
    expect(wantsShownContent('zoek die mail van Jan op')).toBe(false);
    expect(wantsShownContent('search my files for the invoice')).toBe(false);
  });

  it('laat X zien werkt nog', () => {
    expect(subjectOfShow('laat het nieuws over Ajax zien')).toBe('nieuws over Ajax');
  });
});
