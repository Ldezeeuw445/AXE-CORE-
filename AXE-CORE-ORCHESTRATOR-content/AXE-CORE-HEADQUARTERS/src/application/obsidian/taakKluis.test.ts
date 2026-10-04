import { describe, it, expect } from 'vitest';
import { kluisPadVoorTaak, kluisTakVan, taakKluisTekst } from '@/domain/obsidian/kluisBoom';

/**
 * De schrijf-aanroep zelf zit achter writeObsidianNote (netwerk). Wat hier
 * faalt als de taakmap uit de kluis/Obsidian-view verdwijnt, is het pad:
 * zonder AXE/Tasks/{id}/task.md is hij niet zichtbaar als taak.
 */
describe('taakmap in de kluis', () => {
  it('faalt als het taakpad niet onder AXE/Tasks/ staat', () => {
    const pad = kluisPadVoorTaak('task-mac-mini-1');
    expect(pad.startsWith('AXE/Tasks/')).toBe(true);
    expect(pad.endsWith('/task.md')).toBe(true);
    expect(kluisTakVan(pad)).toBe('tasks');
    expect(kluisTakVan('AXE/Notes/task-mac-mini-1.md')).not.toBe('tasks');
  });

  it('de notitie die de view toont bevat de opdracht', () => {
    const tekst = taakKluisTekst({
      taskId: 'task-mac-mini-1',
      title: 'Check NorthSea deals',
      goal: 'check northsea deals on the Mac mini',
      agent: 'northsea',
      device: 'mac-mini',
      tab: 'home',
    });
    expect(tekst).toMatch(/check northsea deals on the Mac mini/);
    expect(tekst).toMatch(/device: mac-mini/);
  });
});
