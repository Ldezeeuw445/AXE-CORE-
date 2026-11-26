import { describe, expect, it } from 'vitest';
import { kernTegelToon, systeemTegelToon } from './homeKernToon';

describe('kerntegels: geel alleen als er iets te doen is', () => {
  it('AI core: aan het werk is groen', () => {
    for (const l of ['Online', 'Thinking', 'Speaking', 'Listening']) expect(kernTegelToon({ label: l, fout: false }), l).toBe('ok');
    expect(kernTegelToon({ label: 'Approval', fout: false })).toBe('let-op');
    expect(kernTegelToon({ label: 'Offline', fout: true })).toBe('fout');
    expect(kernTegelToon(null)).toBe('uit');
  });

  it('System: op het aandeel geslaagde runs', () => {
    expect(systeemTegelToon({ gemeten: true, totaal: 1000, fouten: 6, takenMislukt: 0 })).toBe('ok');
    expect(systeemTegelToon({ gemeten: true, totaal: 100, fouten: 5, takenMislukt: 0 })).toBe('let-op');
    expect(systeemTegelToon({ gemeten: true, totaal: 100, fouten: 20, takenMislukt: 0 })).toBe('fout');
    expect(systeemTegelToon({ gemeten: true, totaal: 0, fouten: 0, takenMislukt: 2 })).toBe('let-op');
    expect(systeemTegelToon({ gemeten: false, totaal: 0, fouten: 0, takenMislukt: 0 })).toBe('uit');
  });
});
