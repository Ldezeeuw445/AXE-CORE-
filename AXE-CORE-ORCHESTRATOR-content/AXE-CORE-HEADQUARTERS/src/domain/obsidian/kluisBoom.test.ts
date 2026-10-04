import { describe, it, expect } from 'vitest';
import {
  kluisPadVoorAgent,
  kluisPadVoorTaak,
  kluisPadVoorTab,
  kluisTakVan,
  tabVanPad,
  tabsDelenMap,
  taakKluisTekst,
} from './kluisBoom';

describe('kluisboom', () => {
  it('elke tab heeft een eigen workplace, niet één gedeelde bak', () => {
    expect(tabVanPad('/')).toBe('home');
    expect(tabVanPad('/browser')).toBe('browser');
    expect(tabVanPad('/obsidian?note=x')).toBe('obsidian');
    expect(kluisPadVoorTab('home')).toBe('AXE/Workplaces/home/context.md');
    expect(kluisPadVoorTab('browser')).toBe('AXE/Workplaces/browser/context.md');
    expect(tabsDelenMap('home', 'browser')).toBe(false);
    expect(tabsDelenMap('home', 'home')).toBe(true);
  });

  it('een taakmap ontbreekt niet in de boom — pad + tak zijn vast', () => {
    const pad = kluisPadVoorTaak('abc-123');
    expect(pad).toBe('AXE/Tasks/abc-123/task.md');
    expect(kluisTakVan(pad)).toBe('tasks');
    expect(kluisTakVan(kluisPadVoorAgent('northsea'))).toBe('agents');
    expect(kluisTakVan(kluisPadVoorTab('home'))).toBe('workplaces');
    expect(kluisTakVan('AXE/Reflections/foo.md')).toBe('memory');
  });

  it('de taaknotitie noemt device en tab, zodat "op de Mac mini" zichtbaar blijft', () => {
    const tekst = taakKluisTekst({
      taskId: 't1',
      title: 'Check NorthSea deals',
      goal: 'check northsea deals on the Mac mini',
      agent: 'northsea',
      device: 'mac-mini',
      tab: 'home',
    });
    expect(tekst).toMatch(/device: mac-mini/);
    expect(tekst).toMatch(/tab: home/);
    expect(tekst).toMatch(/agent: northsea/);
  });
});
