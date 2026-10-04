import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { kluisPadVoorTaak, kluisTakVan } from '@/domain/obsidian/kluisBoom';

const bron = readFileSync(
  join(__dirname, 'ObsidianMemoryPanel.tsx'),
  'utf8',
);

describe('Obsidian-tab toont de kluisboom', () => {
  it('de view groepeert workplaces, agents, tasks en repos — geen platte bak', () => {
    expect(bron).toMatch(/kluisTakVan/);
    expect(bron).toMatch(/data-axe-kluis-takken/);
    expect(bron).toMatch(/Workplaces/);
    expect(bron).toMatch(/Agents/);
    expect(bron).toMatch(/Tasks/);
    expect(bron).toMatch(/repos/);
  });

  it('faalt als een taakmap niet als tasks in de view landt', () => {
    const pad = kluisPadVoorTaak('task-mac-mini-1', 'northsea');
    expect(kluisTakVan(pad)).toBe('tasks');
    expect(bron).toMatch(/data-axe-kluis-tak=\{kluisTakVan\(n\.path\)\}/);
  });
});
