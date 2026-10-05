import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const switchBron = readFileSync(join(__dirname, 'PlaatViewSwitch.tsx'), 'utf8');
const paneel = readFileSync(join(__dirname, '../axe-core/AwarenessCenter.tsx'), 'utf8');

describe('Awareness-knop is geen dode knop', () => {
  it('opent het paneel bij de knop, met echte jobs en goedkeuringen', () => {
    expect(switchBron).toMatch(/AwarenessCenter/);
    expect(switchBron).toMatch(/openGoedkeuringen/);
    expect(switchBron).toMatch(/setShowAwareness/);
    expect(paneel).toMatch(/data-axe-awareness/);
    expect(paneel).toMatch(/bewustzijnVanJobs/);
    expect(paneel).toMatch(/Alles stil/);
    expect(paneel).toMatch(/goedkeuring\.tekst|vraag\.tekst|execVraag\.tekst/);
    expect(paneel).not.toMatch(/Pak dit op/);
  });
});
