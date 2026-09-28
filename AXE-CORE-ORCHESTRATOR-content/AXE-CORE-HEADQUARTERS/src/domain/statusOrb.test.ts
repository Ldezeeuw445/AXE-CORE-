import { describe, expect, it } from 'vitest';
import { statusTeken, tekenLabel } from './statusOrb';

describe('statusTeken', () => {
  it('praten is de equalizer, niet een tiende orb', () => {
    expect(statusTeken('speaking')).toEqual({ soort: 'equalizer' });
    expect(tekenLabel(statusTeken('speaking'))).toBe('Speaking');
  });

  it('luisteren wint van werk dat op de achtergrond loopt', () => {
    expect(statusTeken('listening', { zoekt: true })).toEqual({ soort: 'orb', stand: 'listening' });
  });

  it('zegt wát er gebeurt in plaats van alleen "bezig"', () => {
    expect(statusTeken('processing', { zoekt: true })).toEqual({ soort: 'orb', stand: 'searching' });
    expect(statusTeken('processing', { verbindt: true })).toEqual({ soort: 'orb', stand: 'connecting' });
    expect(statusTeken('processing', { schrijft: true })).toEqual({ soort: 'orb', stand: 'composing' });
    expect(statusTeken('processing')).toEqual({ soort: 'orb', stand: 'working' });
  });

  it('stil is ademen, en dat heet Ready', () => {
    expect(statusTeken('idle')).toEqual({ soort: 'orb', stand: 'breathing' });
    expect(tekenLabel(statusTeken('idle'))).toBe('Ready');
  });

  it('fout wint van de rest', () => {
    expect(statusTeken('listening', { fout: true })).toEqual({ soort: 'fout' });
    expect(tekenLabel(statusTeken('idle', { fout: true }))).toBe('Error');
  });
});
