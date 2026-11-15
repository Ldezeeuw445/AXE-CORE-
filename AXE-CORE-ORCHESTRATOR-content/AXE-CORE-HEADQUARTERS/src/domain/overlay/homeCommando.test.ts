import { describe, expect, it } from 'vitest';
import { homeCommando } from './homeCommando';

describe('homeCommando', () => {
  it('wisselt de Home-weergave op een kort commando', () => {
    expect(homeCommando('laat het brein zien')).toEqual({ soort: 'weergave', weergave: 'neural' });
    expect(homeCommando('Zet Home op terrein.')).toEqual({ soort: 'weergave', weergave: 'terrain' });
    expect(homeCommando('switch to runtime')).toEqual({ soort: 'weergave', weergave: 'runtime' });
    expect(homeCommando('terug naar de bol')).toEqual({ soort: 'weergave', weergave: 'axe' });
  });
  it('opent en sluit de notch', () => {
    expect(homeCommando('open de notch')).toEqual({ soort: 'notch', open: true });
    expect(homeCommando('notch weg')).toEqual({ soort: 'notch', open: false });
    expect(homeCommando('sluit de notchi')).toEqual({ soort: 'notch', open: false });
  });
  it('laat vragen en lange zinnen met rust', () => {
    expect(homeCommando('wat is een neural network')).toBeNull();
    expect(homeCommando('laat het brein zien?')).toBeNull();
    expect(homeCommando('kun je de notch code aanpassen zodat hij bovenaan het scherm hangt')).toBeNull();
    expect(homeCommando('open de browser')).toBeNull();
    expect(homeCommando('hoe werkt de notch')).toBeNull();
    expect(homeCommando('open AXE Companion')).toBeNull();
  });
});
