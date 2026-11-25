import { describe, expect, it } from 'vitest';
import { VRAGEN, idUitSleutel, interviewOpdracht, profielBlok, verwerk } from './interview';

describe('Interview', () => {
  it('herkent de opdrachten en niets anders', () => {
    expect(interviewOpdracht('interview me')).toBe('start');
    expect(interviewOpdracht('leer me kennen')).toBe('start');
    expect(interviewOpdracht('AXE, start het interview')).toBe('start');
    expect(interviewOpdracht('ga verder met het interview')).toBe('verder');
    expect(interviewOpdracht('stop interview')).toBe('stop');
    expect(interviewOpdracht('sla over')).toBe('overslaan');
    expect(interviewOpdracht('hoe gaat het met het interview van gisteren?')).toBeNull();
  });

  it('gewone berichten zonder lopend interview gaan gewoon door', () => {
    expect(verwerk('wat is het weer', { open: null })).toBeNull();
    expect(verwerk('sla over', { open: null })).toBeNull();
    expect(verwerk('stop interview', { open: null })).toBeNull();
  });

  it('vraagt, bewaart en gaat door', () => {
    const b1 = verwerk('interview me', { open: null })!;
    expect(b1.stand.open).toBe(0);
    expect(b1.antwoord).toContain('Vraag 1 van 10');
    const b2 = verwerk('Ik bouw AXE CORE en handel in metalen via NorthSea', b1.stand)!;
    expect(b2.bewaar).toMatchObject({ id: 'werk', antwoord: 'Ik bouw AXE CORE en handel in metalen via NorthSea' });
    expect(b2.antwoord).toMatch(/^Genoteerd\. Vraag 2 van 10/);
    const b3 = verwerk('sla over', b2.stand)!;
    expect(b3.bewaar).toBeUndefined();
    expect(b3.stand.open).toBe(2);
    const b4 = verwerk('stop interview', b3.stand)!;
    expect(b4.stand.open).toBeNull();
  });

  it('verder slaat beantwoorde vragen over; laatste vraag sluit af', () => {
    const bekend = new Set(VRAGEN.slice(0, 9).map((v) => v.id));
    const b = verwerk('ga verder met het interview', { open: null }, bekend)!;
    expect(b.stand.open).toBe(9);
    const eind = verwerk('Ik hou van zeilen', b.stand, bekend)!;
    expect(eind.stand.open).toBeNull();
    expect(eind.antwoord).toContain('10 van de 10');
  });

  it('alles al beantwoord: opnieuw langs', () => {
    const alles = new Set(VRAGEN.map((v) => v.id));
    const b = verwerk('interview me', { open: null }, alles)!;
    expect(b.stand).toEqual({ open: 0, opnieuw: true });
    const n = verwerk('sla over', b.stand, alles)!;
    expect(n.stand).toEqual({ open: 1, opnieuw: true });
  });

  it('profielblok en sleutels', () => {
    expect(profielBlok([])).toBe('');
    const blok = profielBlok([{ id: 'stijl', antwoord: 'Kort  en direct' }, { id: 'werk', antwoord: 'AXE CORE' }]);
    expect(blok).toContain('## Wie Luka is');
    expect(blok.indexOf('Werk: AXE CORE')).toBeLessThan(blok.indexOf('Hoe AXE praat: Kort en direct'));
    expect(idUitSleutel('profiel:werk')).toBe('werk');
    expect(idUitSleutel('profiel:onzin')).toBeNull();
  });
});
