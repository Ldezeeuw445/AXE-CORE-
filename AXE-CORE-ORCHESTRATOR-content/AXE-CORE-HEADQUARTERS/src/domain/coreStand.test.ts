import { describe, it, expect } from 'vitest';
import { coreStand, coreDraait, coreLabel, CORE_VERS_MS } from './coreStand';

const NU = 1_700_000_000_000;

describe('coreStand', () => {
  it('zonder meting is het onbekend, niet offline', () => {
    expect(coreStand({ online: null, laatsteOkAt: null, bezig: true }, NU)).toBe('unknown');
    expect(coreDraait({ online: null, laatsteOkAt: null, bezig: true }, NU)).toBe(false);
  });

  it('een verse meting telt gewoon', () => {
    expect(coreStand({ online: true, laatsteOkAt: NU - 5_000, bezig: false }, NU)).toBe('online');
    expect(coreStand({ online: false, laatsteOkAt: NU - 5_000, bezig: false }, NU)).toBe('offline');
  });

  // Dit is het derde antwoord dat ontbrak: hoor je al twee en een halve ronde
  // niets, dan weet je het niet meer. Doorgaan met "online" omdat het vijf
  // minuten geleden nog goed ging, is precies de leugen die je niet wil.
  it('een oude meting zegt niets meer', () => {
    const oud = { online: true, laatsteOkAt: NU - CORE_VERS_MS - 1, bezig: false };
    expect(coreStand(oud, NU)).toBe('unknown');
    expect(coreDraait(oud, NU)).toBe(false);
  });

  it('precies op de grens telt nog wel', () => {
    expect(coreStand({ online: true, laatsteOkAt: NU - CORE_VERS_MS, bezig: false }, NU)).toBe('online');
  });

  it('online zonder tijdstempel is onbekend -- een stand zonder meting bestaat niet', () => {
    expect(coreStand({ online: true, laatsteOkAt: null, bezig: false }, NU)).toBe('unknown');
  });
});

describe('coreLabel', () => {
  it('zegt wat er aan de hand is, ook als er niets gemeten is', () => {
    expect(coreLabel('online', false)).toBe('Online');
    expect(coreLabel('offline', false)).toBe('Offline');
    expect(coreLabel('unknown', true)).toBe('Checking…');
    expect(coreLabel('unknown', false)).toBe('Not measured');
  });
});
