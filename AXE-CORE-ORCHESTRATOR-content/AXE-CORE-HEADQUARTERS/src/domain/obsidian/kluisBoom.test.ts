import { describe, it, expect } from 'vitest';
import {
  kluisGroepVan,
  kluisKaartenVan,
  kluisPadVoorAgent,
  kluisPadVoorRepo,
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
    expect(kluisPadVoorTab('home')).toBe('AXE/Workplaces/Home/context.md');
    expect(kluisPadVoorTab('browser')).toBe('AXE/Workplaces/Browser/context.md');
    expect(kluisPadVoorTab('maps-3d')).toBe('AXE/Workplaces/Northsea Desk/context.md');
    expect(tabsDelenMap('home', 'browser')).toBe(false);
    expect(tabsDelenMap('maps-3d', 'Northsea Desk')).toBe(true);
  });

  it('een taakmap zit onder de agent, met een leesbare naam', () => {
    const pad = kluisPadVoorTaak('abc-123', 'northsea');
    expect(pad).toBe('AXE/Agents/NorthSea Desk Manager/Tasks/abc-123/task.md');
    expect(kluisTakVan(pad)).toBe('tasks');
    expect(kluisGroepVan(pad)).toBe('NorthSea Desk Manager');
    expect(kluisTakVan(kluisPadVoorAgent('northsea'))).toBe('agents');
    expect(kluisPadVoorAgent('northsea')).toBe('AXE/Agents/NorthSea Desk Manager/workspace.md');
    expect(kluisTakVan(kluisPadVoorTab('home'))).toBe('workplaces');
    expect(kluisTakVan('AXE/Reflections/foo.md')).toBe('memory');
  });

  it('elk repo heeft een eigen workspace in de kluis', () => {
    const pad = kluisPadVoorRepo('axe-core');
    expect(pad).toBe('AXE/Repos/AXE CORE/workspace.md');
    expect(kluisTakVan(pad)).toBe('repos');
    expect(kluisGroepVan(pad)).toBe('AXE CORE');
  });

  it('de taaknotitie noemt tab, agent, taak, repo, wie en device', () => {
    const tekst = taakKluisTekst({
      taskId: 't1',
      title: 'Check NorthSea deals',
      goal: 'doe dit aan Northsea Desk',
      agent: 'northsea',
      device: 'mac-mini',
      tab: 'maps-3d',
      repo: 'axe-core',
      who: 'Luka',
    });
    expect(tekst).toMatch(/tab: Northsea Desk/);
    expect(tekst).toMatch(/agent: NorthSea Desk Manager/);
    expect(tekst).toMatch(/task: t1/);
    expect(tekst).toMatch(/repo: AXE CORE/);
    expect(tekst).toMatch(/who: Luka/);
    expect(tekst).toMatch(/device: mac-mini/);
  });

  it('het bord groepeert notities zoals de kluismappen, geen Reflections-radar', () => {
    const groepen = kluisKaartenVan([
      { path: 'AXE/Workplaces/Northsea Desk/context.md', title: 'Northsea Desk', content: 'tab' },
      { path: 'AXE/Agents/NorthSea Desk Manager/workspace.md', title: 'NorthSea', content: 'agent' },
      { path: 'AXE/Agents/NorthSea Desk Manager/Tasks/t1/task.md', title: 'Task', content: 'task' },
      { path: 'AXE/Repos/AXE CORE/workspace.md', title: 'AXE CORE', content: 'repo' },
    ]);
    expect(groepen.workplaces).toHaveLength(1);
    expect(groepen.agents).toHaveLength(1);
    expect(groepen.tasks).toHaveLength(1);
    expect(groepen.repos).toHaveLength(1);
    expect(groepen.tasks[0].groep).toBe('NorthSea Desk Manager');
  });
});
