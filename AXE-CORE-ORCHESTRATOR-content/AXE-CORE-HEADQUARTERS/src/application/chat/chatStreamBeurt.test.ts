import { describe, it, expect } from 'vitest';
import { volgendeAxeBericht } from './chatStreamBeurt';

describe('volgendeAxeBericht — first token zichtbaar vóór het antwoord klaar is', () => {
  const user = [{ role: 'user' as const, text: 'hoi', timestamp: 1 }];
  const slot = { provider: 'google', model: 'gemini-2.5-flash' };
  const axeTs = 2;

  it('zet de eerste tokens in de conversatie zonder te wachten op de rest', () => {
    const naEerste = volgendeAxeBericht(user, 'Hel', slot, axeTs);
    const axe = naEerste.filter(m => m.role === 'axe');
    expect(axe).toHaveLength(1);
    expect(axe[0].text).toBe('Hel');
  });

  it('groeit hetzelfde bericht, in plaats van een tweede bubble te stapelen', () => {
    const naEerste = volgendeAxeBericht(user, 'Hel', slot, axeTs);
    const naMeer = volgendeAxeBericht(naEerste, 'Hello Luka', slot, axeTs);
    expect(naMeer.filter(m => m.role === 'axe')).toHaveLength(1);
    expect(naMeer[naMeer.length - 1].text).toBe('Hello Luka');
  });

  it('laat het user-bericht met rust', () => {
    const na = volgendeAxeBericht(user, 'ok', slot, axeTs);
    expect(na[0]).toEqual(user[0]);
  });
});
