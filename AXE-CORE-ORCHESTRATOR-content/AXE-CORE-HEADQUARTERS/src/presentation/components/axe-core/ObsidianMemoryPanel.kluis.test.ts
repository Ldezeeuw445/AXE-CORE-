import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { kluisPadVoorTaak, kluisTakVan } from '@/domain/obsidian/kluisBoom';

const bron = readFileSync(
  join(__dirname, 'ObsidianMemoryPanel.tsx'),
  'utf8',
);

describe('Obsidian-tab toont de kluisboom', () => {
  it('de view groepeert workplaces, agents en tasks — geen platte bak', () => {
    expect(bron).toMatch(/kluisTakVan/);
    expect(bron).toMatch(/data-axe-kluis-takken/);
    expect(bron).toMatch(/Workplaces/);
    expect(bron).toMatch(/Agents/);
    expect(bron).toMatch(/Tasks/);
  });

  it('faalt als een taakmap niet als tasks in de view landt', () => {
    const pad = kluisPadVoorTaak('task-mac-mini-1');
    expect(kluisTakVan(pad)).toBe('tasks');
    expect(bron).toMatch(/data-axe-kluis-tak=\{kluisTakVan\(n\.path\)\}/);
  });
});
