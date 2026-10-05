import { describe, it, expect } from 'vitest';
import { kluisPadVoorTaak, kluisTakVan, taakKluisTekst } from '@/domain/obsidian/kluisBoom';

/**
 * De schrijf-aanroep zelf zit achter writeObsidianNote (netwerk). Wat hier
 * faalt als de taakmap uit de kluis/Obsidian-view verdwijnt, is het pad:
 * zonder Agents/{naam}/Tasks/{id}/task.md zit hij niet onder de agent.
 */
describe('taakmap in de kluis', () => {
  it('faalt als het taakpad niet onder de agent staat', () => {
    const pad = kluisPadVoorTaak('task-mac-mini-1', 'northsea');
    expect(pad).toBe('AXE/Agents/NorthSea Desk Manager/Tasks/task-mac-mini-1/task.md');
    expect(pad.endsWith('/task.md')).toBe(true);
    expect(kluisTakVan(pad)).toBe('tasks');
    expect(kluisTakVan('AXE/Notes/task-mac-mini-1.md')).not.toBe('tasks');
  });

  it('de notitie die de view toont bevat de opdracht', () => {
    const tekst = taakKluisTekst({
      taskId: 'task-mac-mini-1',
      title: 'Check NorthSea deals',
      goal: 'doe dit aan Northsea Desk',
      agent: 'northsea',
      device: 'mac-mini',
      tab: 'home',
    });
    expect(tekst).toMatch(/doe dit aan Northsea Desk/);
    expect(tekst).toMatch(/device: mac-mini/);
    expect(tekst).toMatch(/agent: NorthSea Desk Manager/);
  });
});
