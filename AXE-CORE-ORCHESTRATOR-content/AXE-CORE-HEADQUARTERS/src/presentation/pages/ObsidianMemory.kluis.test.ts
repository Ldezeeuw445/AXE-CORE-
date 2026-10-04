import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const bron = readFileSync(join(__dirname, 'ObsidianMemory.tsx'), 'utf8');

describe('Obsidian-tab is de kluis, geen radar', () => {
  it('heeft geen neural-graph en geen Awareness-radar', () => {
    expect(bron).not.toMatch(/ObsidianNeuralGraph/);
    expect(bron).not.toMatch(/Vault not linked/);
    expect(bron).not.toMatch(/REFLECTIONS/);
    expect(bron).toMatch(/data-axe-kluis-bord/);
    expect(bron).toMatch(/Kaart/);
    expect(bron).toMatch(/SectieBlok/);
    expect(bron).toMatch(/kluisKaartenVan/);
  });

  it('toont de echte takken als openbare notities', () => {
    expect(bron).toMatch(/workplaces/);
    expect(bron).toMatch(/agents/);
    expect(bron).toMatch(/tasks/);
    expect(bron).toMatch(/repos/);
    expect(bron).toMatch(/AXE vault/);
  });
});
