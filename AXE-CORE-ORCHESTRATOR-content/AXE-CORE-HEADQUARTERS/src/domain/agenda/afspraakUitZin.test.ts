import { describe, expect, it } from 'vitest';
import { afspraakUitZin, isAfspraakOpdracht } from './afspraakUitZin';

describe('afspraakUitZin', () => {
  it('leest de zin uit FUNCTIES.md', () => {
    expect(afspraakUitZin('zet vrijdag 19:30 diner in mijn agenda')).toEqual({ titel: 'Diner', datum: 'vrijdag', tijd: '19:30' });
  });

  it('Engels met pm', () => {
    expect(afspraakUitZin('add dinner with Sam to my calendar friday at 7pm')).toEqual({ titel: 'Dinner with Sam', datum: 'friday', tijd: '19:00' });
  });

  it('"om 10 uur" en een afspraak', () => {
    expect(afspraakUitZin('plan morgen om 10 uur een afspraak met de tandarts')).toEqual({ titel: 'Met de tandarts', datum: 'morgen', tijd: '10:00' });
  });

  it('zonder dag is het vandaag', () => {
    expect(afspraakUitZin('zet 15:00 bellen met Jan in mijn agenda')).toEqual({ titel: 'Bellen met Jan', datum: 'vandaag', tijd: '15:00' });
  });

  it('zonder tijd blijft de tijd leeg (maakAfspraak zegt dan wat er mist)', () => {
    expect(afspraakUitZin('zet vrijdag diner in mijn agenda')?.tijd).toBe('');
  });

  it('een vraag over de agenda is geen opdracht', () => {
    expect(isAfspraakOpdracht('wat staat er vandaag in mijn agenda?')).toBe(false);
    expect(isAfspraakOpdracht('wat staat er in mijn agenda')).toBe(false);
    expect(isAfspraakOpdracht('open de agenda')).toBe(false);
    expect(isAfspraakOpdracht('zet een taak voor morgen')).toBe(false);
  });
});
