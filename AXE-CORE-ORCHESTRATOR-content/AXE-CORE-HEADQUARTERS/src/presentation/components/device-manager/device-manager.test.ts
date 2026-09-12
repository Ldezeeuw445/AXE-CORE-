import { describe, it, expect } from 'vitest';
import { DEVICE_TAB_PADEN, DEVICE_TABS, groepeerTabs, zoekTabs } from './tabs';
import { macKijk, macOpdracht, macVraagtToestemming, machineNaam } from './gebruik';
import { schilZonderChroom } from '@/presentation/components/layout/zweef/ingebed';

describe('de tabs van de device manager', () => {
  it('heeft elke tab die de onderbalk kent, één keer', () => {
    const onderbalk = [
      '/', '/thinkthanks', '/apps', '/ai-core', '/memory', '/obsidian',
      '/knowledge', '/mcp', '/infrastructure', '/control-plane', '/table-editor',
      '/cron-manager', '/browser', '/agents', '/crewai', '/calendar', '/tasks',
      '/finance', '/trading-intel', '/maps-3d', '/code-editor', '/terminals',
      '/eve', '/settings',
    ];
    expect([...DEVICE_TAB_PADEN].sort()).toEqual([...onderbalk].sort());
    expect(new Set(DEVICE_TABS.map((t) => t.path)).size).toBe(DEVICE_TABS.length);
  });

  it('elke tab zit in een groep, en groepeeren verliest er geen', () => {
    const groepen = groepeerTabs();
    expect(groepen.every((g) => g.tabs.length > 0)).toBe(true);
    expect(groepen.flatMap((g) => g.tabs).length).toBe(DEVICE_TABS.length);
  });

  it('zoeken op browser vindt de browser-tab', () => {
    expect(zoekTabs('browser').map((t) => t.path)).toEqual(['/browser']);
    expect(zoekTabs('').length).toBe(DEVICE_TABS.length);
  });
});

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
