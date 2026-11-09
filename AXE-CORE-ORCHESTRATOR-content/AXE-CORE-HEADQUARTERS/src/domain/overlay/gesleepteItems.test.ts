import { describe, expect, it } from 'vitest';
import {
  BESTEMMING_PER_GROEP,
  GROEP_VOLGORDE,
  MAX_PER_SLEEP,
  bestandSoort,
  isLink,
  linkLabel,
  groepVoor,
  groepeerSleep,
  isScreenshot,
  sorteerSleep,
  urlsUitUriList,
} from './gesleepteItems';

describe('wat er in de notch valt', () => {
  it('herkent waar een bestand voor doorgaat', () => {
    expect(bestandSoort('vakantie.HEIC')).toBe('image');
    expect(bestandSoort('contract.pdf')).toBe('doc');
    expect(bestandSoort('posities.csv')).toBe('sheet');
    expect(bestandSoort('archief.zip')).toBe('file');
    // Geen extensie is geen reden om te gokken.
    expect(bestandSoort('Makefile')).toBe('file');
  });

  it('neemt een link aan die je uit de browser sleept', () => {
    // Dit deed de notch tot 5 nov niet: alleen dataTransfer.files werd gelezen,
    // dus een gesleepte link verdween zonder spoor.
    const uit = sorteerSleep({ uriList: 'https://tradingosapp.com/chart?symbol=XAUUSD' });
    expect(uit).toHaveLength(1);
    expect(uit[0]?.soort).toBe('link');
    expect(uit[0]?.waarde).toBe('https://tradingosapp.com/chart?symbol=XAUUSD');
  });

  it('maakt van één sleep één chip, ook als de browser hem twee keer aanlevert', () => {
    // Sleep een plaatje of een link van een webpagina en je krijgt zowel een
    // uri-list als een text/plain met dezelfde URL. Zonder ontdubbelen staan
    // er twee chips voor één handeling.
    const url = 'https://axecompanion.com/chat';
    const uit = sorteerSleep({ uriList: url, tekst: url });
    expect(uit).toHaveLength(1);
    expect(uit[0]?.soort).toBe('link');
  });

  it('leest een uri-list met meerdere regels en slaat commentaar over', () => {
    // RFC 2483: regels die met # beginnen zijn commentaar. Wie de hele blob
    // als één URL pakt, krijgt een chip met een commentaarregel erin.
    const blob = '# dit is commentaar\nhttps://een.nl\n\nhttps://twee.nl\n';
    expect(urlsUitUriList(blob)).toEqual(['https://een.nl', 'https://twee.nl']);
    expect(sorteerSleep({ uriList: blob })).toHaveLength(2);
  });

  it('houdt een alinea met een url erin een notitie, geen link', () => {
    // De val: alles met http erin voor een link aanzien. Wie een stuk tekst
    // sleept waar toevallig een adres in staat, bedoelt de tekst.
    const alinea = 'Kijk morgen naar https://example.com en zeg wat je ervan vindt';
    expect(isLink(alinea)).toBe(false);
    const uit = sorteerSleep({ tekst: alinea });
    expect(uit).toHaveLength(1);
    expect(uit[0]?.soort).toBe('text');
    expect(uit[0]?.waarde).toBe(alinea);
  });

  it('laat alleen http en https door als link', () => {
    expect(isLink('https://ok.nl')).toBe(true);
    expect(isLink('http://ok.nl')).toBe(true);
    // Deze parsen wél met new URL(), maar leveren een chip op die nergens
    // heen gaat. Als tekst zijn ze bruikbaarder.
    expect(isLink('mailto:luka@example.com')).toBe(false);
    expect(isLink('file:///Users/luka/geheim.txt')).toBe(false);
    expect(isLink('javascript:alert(1)')).toBe(false);
    expect(isLink('zomaar wat woorden')).toBe(false);
    expect(isLink('')).toBe(false);
  });

  it('toont een link als herkenbare naam in plaats van de hele url', () => {
    expect(linkLabel('https://www.axecompanion.com/')).toBe('axecompanion.com');
    expect(linkLabel('https://github.com/Ldezeeuw445/AXE-CORE-')).toBe('github.com/Ldezeeuw445/AXE-CORE-');
    // Een lang pad wordt afgekapt, want een chip van een halve regel breed
    // maakt de rij onleesbaar — precies wat we hier juist oplossen.
    expect(linkLabel('https://github.com/Ldezeeuw445/AXE-COMPANION-OS-/pull/144/files')).toBe(
      'github.com/Ldezeeuw445/AXE-COMPANI…',
    );
  });

  it('zet bestanden voor links en links voor tekst', () => {
    // Een vaste volgorde, zodat de chips niet per sleep verspringen.
    const uit = sorteerSleep({
      bestanden: [{ name: 'grafiek.png', size: 1024 }],
      uriList: 'https://een.nl',
      tekst: 'een losse notitie',
    });
    expect(uit.map((i) => i.soort)).toEqual(['image', 'link', 'text']);
  });

  it('neemt er hooguit acht in één keer aan', () => {
    // Een map erin slepen is zo vierhonderd bestanden.
    const veel = Array.from({ length: 30 }, (_, i) => ({ name: `f${i}.png`, size: 1 }));
    expect(sorteerSleep({ bestanden: veel })).toHaveLength(MAX_PER_SLEEP);
  });

  it('levert niets op bij een lege sleep in plaats van een lege chip', () => {
    expect(sorteerSleep({})).toEqual([]);
    expect(sorteerSleep({ tekst: '   ', uriList: '' })).toEqual([]);
  });
});

describe('de bakjes', () => {
  it('kent een screenshot van een bewaarde foto', () => {
    // Allebei een png; het verschil zit in de naam. Zonder dit beland je
    // weer in één grote bak waarin je moet zoeken.
    expect(isScreenshot('Screenshot 2026-11-05 at 10.23.45.png')).toBe(true);
    expect(isScreenshot('Schermafbeelding 2026-11-05 om 10.23.45.png')).toBe(true);
    expect(isScreenshot('Screen Shot 2019-02-01.png')).toBe(true);
    expect(isScreenshot('CleanShot 2026-11-05.png')).toBe(true);
    expect(isScreenshot('IMG_4821.HEIC')).toBe(false);
    expect(isScreenshot('vakantie-kreta.jpg')).toBe(false);
  });

  it('legt elk soort in zijn eigen bakje', () => {
    expect(groepVoor('image', 'Screenshot 2026-11-05.png')).toBe('screenshots');
    expect(groepVoor('image', 'IMG_4821.HEIC')).toBe('fotos');
    expect(groepVoor('doc', 'contract.pdf')).toBe('documenten');
    expect(groepVoor('sheet', 'posities.csv')).toBe('documenten');
    expect(groepVoor('link', 'github.com')).toBe('links');
    expect(groepVoor('text', 'een notitie')).toBe('notities');
    // Alles wat we niet thuisbrengen valt in downloads, niet in een gat.
    expect(groepVoor('file', 'installer.dmg')).toBe('downloads');
  });

  it('groepeert een gemengde sleep en laat lege bakjes weg', () => {
    const items = sorteerSleep({
      bestanden: [
        { name: 'Screenshot 2026-11-05 at 10.23.45.png', size: 120 },
        { name: 'IMG_4821.HEIC', size: 900 },
        { name: 'contract.pdf', size: 400 },
        { name: 'axe.dmg', size: 10 },
      ],
      uriList: 'https://axecompanion.com',
    });
    const groepen = groepeerSleep(items);
    expect(groepen.map((g) => g.groep)).toEqual(['screenshots', 'fotos', 'documenten', 'downloads', 'links']);
    // Geen kopje "Notities" boven niets.
    expect(groepen.some((g) => g.items.length === 0)).toBe(false);
    expect(groepen[0]?.label).toBe('Screenshots');
  });

  it('stuurt iets om over te praten naar de chat en iets om te onthouden naar AXON', () => {
    // De scheiding die ertoe doet: een screenshot sleep je erin omdat je er
    // een vraag over hebt, een notitie omdat je hem terug wilt vinden.
    const [screenshot] = sorteerSleep({ bestanden: [{ name: 'Screenshot 1.png', size: 1 }] });
    const [link] = sorteerSleep({ uriList: 'https://example.com' });
    const [notitie] = sorteerSleep({ tekst: 'niet vergeten: Harcros bellen' });
    expect(screenshot?.bestemming).toBe('chat');
    expect(link?.bestemming).toBe('axon');
    expect(notitie?.bestemming).toBe('axon');
    // Elk bakje heeft een bestemming; geen enkel item komt zonder te weten
    // waar het heen moet.
    for (const groep of GROEP_VOLGORDE) {
      expect(BESTEMMING_PER_GROEP[groep]).toMatch(/^(chat|axon)$/);
    }
  });
});
