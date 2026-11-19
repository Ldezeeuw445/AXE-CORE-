import { describe, expect, it } from 'vitest';
import { managerStaat } from './managerStaat';

const rust = { wachtOpJou: 0, luistert: false, taak: null, denkt: false };

describe('managerStaat: één regel, volgorde = belang', () => {
  it('rust als er niets speelt', () => {
    expect(managerStaat(rust)).toEqual({ staat: 'rust', label: 'Ready', tekst: 'Ready' });
  });

  it('wacht op jou gaat altijd voor, ook boven luisteren en een taak', () => {
    expect(managerStaat({ ...rust, wachtOpJou: 2, luistert: true, taak: 'x', denkt: true }))
      .toEqual({ staat: 'wacht', label: 'Needs you', tekst: 'Waiting on you (2)' });
  });

  it('luistert gaat voor een draaiende taak', () => {
    expect(managerStaat({ ...rust, luistert: true, taak: 'Bouwen' }).staat).toBe('luistert');
  });

  it('taak gaat voor denken, met een korte titel', () => {
    const r = managerStaat({ ...rust, taak: 'Een heel lange titel die echt veel te lang is voor één regel bovenin', denkt: true });
    expect(r.staat).toBe('taak');
    expect(r.tekst.length).toBeLessThanOrEqual('Task running: '.length + 48);
  });

  it('mislukt alleen als er verder niets speelt', () => {
    expect(managerStaat({ ...rust, mislukt: 'tests rood' }).tekst).toBe('Failed: tests rood');
    expect(managerStaat({ ...rust, denkt: true, mislukt: 'tests rood' }).staat).toBe('denkt');
  });
});
