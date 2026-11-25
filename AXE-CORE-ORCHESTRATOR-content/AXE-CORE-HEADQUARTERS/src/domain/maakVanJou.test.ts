import { describe, expect, it } from 'vitest';
import { antwoord, hexNaarRgb, leesVoorkeur, maakVanJouOpdracht as o, pasToe } from './maakVanJou';

describe('Maak het van jou', () => {
  it('verbergt en toont een tab in gewone taal', () => {
    expect(o('verberg Trading')).toEqual({ soort: 'verberg', pad: '/trading', label: 'Trading' });
    expect(o('haal de calendar tab weg')).toEqual({ soort: 'verberg', pad: '/calendar', label: 'Calendar' });
    expect(o('hide the code editor tab')).toMatchObject({ soort: 'verberg', pad: '/code-editor' });
    expect(o('toon Trading weer')).toEqual({ soort: 'toon', pad: '/trading', label: 'Trading' });
    expect(o('laat de calendar weer zien')).toMatchObject({ soort: 'toon', pad: '/calendar' });
    expect(o('laat alle tabs weer zien')).toEqual({ soort: 'toon-alles' });
  });

  it('Home en Settings blijven altijd staan', () => {
    expect(o('verberg settings')).toEqual({ soort: 'verberg-niet', label: 'Settings' });
    expect(o('verberg home')).toMatchObject({ soort: 'verberg-niet' });
  });

  it('pakt geen gewone zinnen op', () => {
    expect(o('haal koffie')).toBeNull();
    expect(o('verberg je gevoelens niet')).toBeNull();
    expect(o('maak het af')).toBeNull();
    expect(o('wat is de stand van trading vandaag en waarom ging het mis')).toBeNull();
    expect(o('verberg de foobar tab')).toEqual({ soort: 'onbekend-tab', naam: 'foobar' });
  });

  it('kleuren', () => {
    expect(o('maak het groen')).toEqual({ soort: 'kleur', kleur: 'groen' });
    expect(o('make it purple')).toEqual({ soort: 'kleur', kleur: 'paars' });
    expect(o('accentkleur oranje')).toEqual({ soort: 'kleur', kleur: 'oranje' });
    expect(o('andere kleuren')).toEqual({ soort: 'volgende-kleur' });
    expect(o('standaard kleuren')).toEqual({ soort: 'standaard-kleur' });
  });

  it('pasToe en antwoord', () => {
    let v = pasToe({ verborgen: [] }, { soort: 'verberg', pad: '/trading', label: 'Trading' });
    expect(v.verborgen).toEqual(['/trading']);
    v = pasToe(v, { soort: 'volgende-kleur' });
    expect(v.kleur).toBe('blauw');
    expect(antwoord({ soort: 'volgende-kleur' }, v)).toContain('blauw');
    v = pasToe(v, { soort: 'toon-alles' });
    expect(v).toEqual({ verborgen: [], kleur: 'blauw' });
    expect(pasToe(v, { soort: 'standaard-kleur' })).toEqual({ verborgen: [] });
  });

  it('leest alleen geldige opslag', () => {
    expect(leesVoorkeur('{"verborgen":["/trading","/settings",3],"kleur":"groen"}'))
      .toEqual({ verborgen: ['/trading'], kleur: 'groen' });
    expect(leesVoorkeur('kapot')).toEqual({ verborgen: [] });
    expect(leesVoorkeur({ kleur: 'zwart' })).toEqual({ verborgen: [] });
    expect(hexNaarRgb('#22D3EE')).toBe('34, 211, 238');
  });
});
