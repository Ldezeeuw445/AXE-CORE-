import { describe, it, expect } from 'vitest';
import { daxWerkLabel, type DaxWerk } from './serverStatus';

const w = (stand: DaxWerk['stand']): DaxWerk => ({ open: 0, wacht: 0, mislukt_24u: 0, klaar_24u: 0, laatste_klaar: null, stand, regel: '' });

describe('daxWerkLabel: status uit echt werk', () => {
  it('wacht op jou gaat voor alles', () => expect(daxWerkLabel(w('needs_you'), false)).toEqual({ label: 'Needs you', tone: 'wait' }));
  it('werkt / faalt', () => {
    expect(daxWerkLabel(w('working'), true).label).toBe('Working');
    expect(daxWerkLabel(w('failing'), true).label).toBe('Failing');
  });
  it('niets te doen: slapende computer zegt Asleep, nooit een vast Ready', () => {
    expect(daxWerkLabel(w('idle'), false).label).toBe('Asleep');
    expect(daxWerkLabel(w('idle'), true).label).toBe('Idle');
    expect(daxWerkLabel(w('idle'), null).label).toBe('Idle');
  });
});
