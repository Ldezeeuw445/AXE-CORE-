import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('de zwevende iPhone', () => {
  const lees = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

  it('heeft geen kopbalk en geen chip meer: alleen het toestel', () => {
    const bron = lees('./ZwevendeTelefoon.tsx');
    expect(bron).not.toMatch(/axe-telefoon__kop/);
    expect(bron).not.toMatch(/axe-zwever__chip/);
  });

  it('wordt aangezet door het telefoon-icoon in het radiaal dok, niet door naar /mobile te gaan', () => {
    const dok = lees('../layout/RadiaalDok.tsx');
    expect(dok).toMatch(/id: 'telefoon'[^\n]*wisselTelefoon\(\)/);
    expect(dok).not.toMatch(/id: 'telefoon'[^\n]*navigate\('\/mobile'\)/);
  });

  it('laat het scherm tikbaar: slepen alleen aan de rand', () => {
    expect(lees('./IphoneFrame.tsx')).toMatch(/axe-iphone__scherm" data-geen-greep/);
    expect(lees('../layout/zweef/Zwever.tsx')).toMatch(/NIET_SLEPEN = '[^']*\[data-geen-greep\]/);
  });
});

