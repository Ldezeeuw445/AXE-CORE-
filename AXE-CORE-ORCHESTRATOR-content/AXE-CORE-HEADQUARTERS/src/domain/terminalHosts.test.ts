import { describe, it, expect } from 'vitest';
import {
  alleHosts, kiesHost, maakHost, geldigWsAdres, INGEBOUWDE_HOSTS,
} from '@/domain/terminalHosts';
import { snelactiesVoor } from '@/domain/terminalSnelacties';

describe('adressen', () => {
  it('accepteert ws en wss', () => {
    expect(geldigWsAdres('ws://127.0.0.1:4022/terminal')).toBe(true);
    expect(geldigWsAdres('wss://api.axecompanion.com/terminal')).toBe(true);
  });

  it('weigert http', () => {
    // Een http:// hier levert een verbinding op die stil mislukt, en dan zoek je
    // bij de server terwijl het adres fout was.
    expect(geldigWsAdres('http://127.0.0.1:4022')).toBe(false);
    expect(geldigWsAdres('127.0.0.1:4022')).toBe(false);
    expect(geldigWsAdres('')).toBe(false);
  });
});

describe('een machine toevoegen', () => {
  it('maakt een host met een id uit de naam', () => {
    const h = maakHost('iMac boven', 'Rendered video', 'ws://10.0.0.5:4022/terminal');
    expect(h?.id).toBe('imac-boven');
    expect(h?.naam).toBe('iMac boven');
  });

  it('weigert een lege naam of een fout adres', () => {
    expect(maakHost('', 'x', 'ws://a:1/t')).toBeNull();
    expect(maakHost('iMac', 'x', 'http://a')).toBeNull();
  });

  it('vult een ontbrekende omschrijving in plaats van hem leeg te laten', () => {
    // Het waarvoor staat op elke knop; leeg zou een gat in de rij geven.
    expect(maakHost('iMac', '', 'ws://a:1/t')?.waarvoor).toBe('Geen omschrijving');
  });
});

describe('de lijst', () => {
  it('zet de ingebouwde hosts voorop', () => {
    const lijst = alleHosts([{ id: 'x', naam: 'X', waarvoor: 'y', wsUrl: 'ws://a:1/t' }]);
    expect(lijst.slice(0, INGEBOUWDE_HOSTS.length).map(h => h.id))
      .toEqual(INGEBOUWDE_HOSTS.map(h => h.id));
  });

  it('laat een eigen host een ingebouwde NIET overschrijven', () => {
    // Anders vervang je per ongeluk het adres van de VPS en merk je dat pas als
    // je commando ergens anders landt.
    const lijst = alleHosts([{ id: 'vps-axe', naam: 'Nep', waarvoor: '', wsUrl: 'ws://kwaad:1/t' }]);
    expect(lijst.filter(h => h.id === 'vps-axe')).toHaveLength(1);
    expect(lijst.find(h => h.id === 'vps-axe')?.wsUrl).toBe(
      INGEBOUWDE_HOSTS.find(h => h.id === 'vps-axe')?.wsUrl,
    );
  });

  it('negeert een eigen host met een kapot adres', () => {
    const lijst = alleHosts([{ id: 'stuk', naam: 'Stuk', waarvoor: '', wsUrl: 'nonsens' }]);
    expect(lijst.find(h => h.id === 'stuk')).toBeUndefined();
  });

  it('overleeft null', () => {
    expect(alleHosts(null).length).toBe(INGEBOUWDE_HOSTS.length);
  });
});

describe('welke host geselecteerd is', () => {
  it('neemt de bewaarde keuze', () => {
    expect(kiesHost('vps-axe', alleHosts([])).id).toBe('vps-axe');
  });

  it('valt terug als de bewaarde host niet meer bestaat', () => {
    // Een verwijderde host hoort geen leeg scherm te geven.
    expect(kiesHost('weg', alleHosts([])).id).toBe(INGEBOUWDE_HOSTS[0].id);
    expect(kiesHost(null, alleHosts([])).id).toBe(INGEBOUWDE_HOSTS[0].id);
  });
});

describe('de shortlist hoort bij de machine', () => {
  it('geeft de Mac zijn eigen acties', () => {
    const a = snelactiesVoor('deze-mac').map(x => x.cmd).join(' ');
    expect(a).toContain('run-local.sh');
    // En NOOIT systemctl: die diensten bestaan daar niet, en een knop die op de
    // verkeerde machine landt is erger dan geen knop.
    expect(a).not.toContain('systemctl');
  });

  it('geeft de VPS zijn eigen acties', () => {
    const a = snelactiesVoor('vps-axe').map(x => x.cmd).join(' ');
    expect(a).toContain('systemctl');
    expect(a).not.toContain('npm run bijwerken');
  });

  it('geeft een onbekende machine het veilige minimum', () => {
    // Niet de lijst van een andere machine.
    const a = snelactiesVoor('imac-boven');
    expect(a.every(x => x.leestAlleen)).toBe(true);
  });

  it('alles wat vanzelf draait, verandert niets', () => {
    // Dit is de regel die het gevaarlijk-zijn wegneemt: alleen lezende acties
    // mogen meteen uitgevoerd worden, de rest komt in de prompt te staan.
    for (const id of ['deze-mac', 'vps-axe', 'onbekend']) {
      for (const a of snelactiesVoor(id)) {
        if (!a.leestAlleen) continue;
        // /dev/null is per definitie een prullenbak en geen bestand dat je
        // overschrijft; die uitzondering is smal en met opzet uitgeschreven.
        // Zonder hem zou een onschuldige `2>/dev/null` deze regel breken, en
        // een test die op het verkeerde slaat wordt uitgezet in plaats van
        // gerepareerd.
        const zonderPrullenbak = a.cmd.replace(/\d?>\s*\/dev\/null/g, '');
        expect(zonderPrullenbak).not.toMatch(/\brestart\b|\bkill\b|\brm\b|>\s*\/|\bmv\b/);
      }
    }
  });
});
