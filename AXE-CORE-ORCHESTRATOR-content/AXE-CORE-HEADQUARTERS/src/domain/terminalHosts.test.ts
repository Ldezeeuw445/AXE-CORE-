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
    const lijst = alleHosts([{ id: 'vps-strato', naam: 'Nep', waarvoor: '', wsUrl: 'ws://kwaad:1/t' }]);
    expect(lijst.filter(h => h.id === 'vps-strato')).toHaveLength(1);
    expect(lijst.find(h => h.id === 'vps-strato')?.wsUrl).toBe(
      INGEBOUWDE_HOSTS.find(h => h.id === 'vps-strato')?.wsUrl,
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
    expect(kiesHost('vps-strato', alleHosts([])).id).toBe('vps-strato');
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

  it('een deploy stopt als de pull mislukt', () => {
    // && en niet ; -- met een puntkomma herstart je de oude code en ziet het
    // eruit alsof de deploy lukte. Dat is de faalwijze waar deze codebase een
    // naam voor heeft: iets ziet er van buiten uit alsof het draait.
    const deploy = snelactiesVoor('vps-strato').find(a => a.label === 'Deploy');
    expect(deploy).toBeDefined();
    expect(deploy!.cmd).toContain('&&');
    expect(deploy!.cmd).not.toMatch(/git pull\s*;/);
    // En hij is NIET leestAlleen: hij verandert de draaiende dienst, dus hij
    // hoort in de prompt te komen en niet vanzelf te draaien.
    expect(deploy!.leestAlleen).toBeFalsy();
  });

  it('geeft de VPS zijn eigen acties', () => {
    const a = snelactiesVoor('vps-strato').map(x => x.cmd).join(' ');
    expect(a).toContain('systemctl');
    expect(a).not.toContain('npm run bijwerken');
  });

  it('geeft een onbekende machine geen commando van een andere machine', () => {
    // De regel die ertoe doet is NIET "alles alleen-lezen" -- die stond hier
    // eerst, en hij hield geen stand zodra de agents en git erbij kwamen:
    // `claude auth login` en `git pull` veranderen iets, zijn niet
    // machinegebonden, en horen overal te staan.
    //
    // Wat wél moet gelden: een machine die we niet kennen krijgt nooit een
    // commando dat op een ANDERE machine slaat. Geen systemctl (dat is een
    // VPS), geen pad naar ~/AXE-CORE- (dat is een Mac). Dat is de fout die
    // schade doet.
    const a = snelactiesVoor('iets-onbekends');
    const alles = a.map(x => x.cmd).join(' ');
    expect(alles).not.toContain('systemctl');
    expect(alles).not.toContain('AXE-CORE-ORCHESTRATOR');
    expect(alles).not.toContain('/opt/axe-core-api');
  });

  it('elke machine krijgt de agents en git, want die zijn niet machinegebonden', () => {
    // Luka's vraag: "cursor subscription erop claude codex, ssh in git alles
    // gewoon ff makkelijk onder elke terminal".
    for (const id of ['deze-mac', 'vps-strato', 'iets-onbekends']) {
      const labels = snelactiesVoor(id).map(x => x.label);
      expect(labels).toContain('Claude login');
      expect(labels).toContain('Codex login');
      expect(labels).toContain('Cursor login');
      expect(labels).toContain('Status');
    }
  });

  it('alles wat vanzelf draait, verandert niets', () => {
    // Dit is de regel die het gevaarlijk-zijn wegneemt: alleen lezende acties
    // mogen meteen uitgevoerd worden, de rest komt in de prompt te staan.
    for (const id of ['deze-mac', 'vps-strato', 'onbekend']) {
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
