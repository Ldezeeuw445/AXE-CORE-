/*
 * `tabs.ts` stond hier ook in, en is op 4 okt 2026 weggehaald.
 *
 * Het was een VIJFDE lijst van alle tabs, naast navRegistry, BottomNav,
 * OPENABLE_PAGES en TAB_SHORTCUTS -- en de enige die nergens gerenderd werd:
 * `DEVICE_TABS` had buiten dit bestand geen enkele aanroeper. De echte
 * /device-pagina (pages/DeviceManager.tsx) gaat over de Android-brug en raakte
 * hem niet aan.
 *
 * Zijn kop zei: "Een tab toevoegen aan BottomNav zonder hem hier te zetten laat
 * de test falen." Dat was niet waar. De test hieronder vergeleek DEVICE_TABS met
 * een hardgecodeerde kopie van de onderbalk IN DE TEST ZELF, dus hij faalde pas
 * als je tabs.ts wijzigde -- precies andersom. Een bron van waarheid die niemand
 * leest en een test die zichzelf bevestigt.
 *
 * Wat de routes echt bewaakt staat in navBereikbaar.test.ts: die leest App.tsx
 * en houdt de balk, de sneltoetsen en de vensterlijst daar tegenaan.
 */
import { describe, it, expect } from 'vitest';
import { macKijk, macOpdracht, macVraagtToestemming, machineNaam } from './gebruik';
import { schilZonderChroom } from '@/presentation/components/layout/zweef/ingebed';

describe('wat de telefoon naar de Mac stuurt', () => {
  it('een lege host toont de device-id, geen komma-rij', () => {
    expect(machineNaam({ id: 'mac-mini', label: '' })).toBe('mac-mini');
    expect(machineNaam({ id: '', label: '' })).toBe('Mac');
  });
  it('kijken is observe en verandert niets', () => {
    const c = macKijk('mac-mini');
    expect(c.tool).toBe('system.info');
    expect(c.tier).toBe('observe');
    expect(c.device).toBe('mac-mini');
    expect(macVraagtToestemming(c)).toBe(false);
  });
  it('een vrije opdracht is consequential — altijd vragen', () => {
    const c = macOpdracht('mac-mini', 'ls ~/Projects');
    expect(c.tool).toBe('terminal.free');
    expect(c.tier).toBe('consequential');
    expect(c.args.command).toBe('ls ~/Projects');
    expect(macVraagtToestemming(c)).toBe(true);
  });
});

describe('wanneer de schil haar chroom verbergt', () => {
  it('op #/mobile, in de Android-schil, en in het telefoon-iframe', () => {
    expect(schilZonderChroom('/', { android: false, ingebed: false })).toBe(false);
    expect(schilZonderChroom('/mobile', { android: false, ingebed: false })).toBe(true);
    expect(schilZonderChroom('/browser', { android: true, ingebed: false })).toBe(true);
    expect(schilZonderChroom('/browser', { android: false, ingebed: true })).toBe(true);
  });
});
