import { describe, expect, it } from 'vitest';
import { taakIsAfgerond, taakIsVastgelopen, taakMeldingVan, zichtbareTaakMeldingen } from './taakMelding';

describe('taakmelding zonder verzenden', () => {
  it('maakt een zichtbare melding als een taak klaar of vastloopt, en stuurt niets', () => {
    const klaar = taakMeldingVan(
      { id: 'a', title: 'Check deals', status: 'completed' },
      { id: 'a', title: 'Check deals', status: 'in_progress' },
    );
    expect(klaar).toMatchObject({ titel: 'Check deals', mislukt: false, stuurde: false, tekst: 'Done: Check deals' });
    expect(JSON.stringify(klaar)).not.toMatch(/mailto|whatsapp|auto_send|send mail/i);

    const vast = taakMeldingVan(
      { id: 'b', title: 'Stuck job', status: 'failed' },
      { id: 'b', title: 'Stuck job', status: 'running' },
    );
    expect(vast).toMatchObject({ mislukt: true, stuurde: false, tekst: 'Stuck: Stuck job' });
  });

  it('zwijgt bij de eerste meting, zodat een herstart geen storm geeft', () => {
    expect(taakMeldingVan({ id: 'a', title: 'Old', status: 'completed' }, null)).toBeNull();
    expect(taakMeldingVan({ id: 'a', title: 'Old', status: 'completed' })).toBeNull();
  });

  it('toont klaar en vastgelopen op het bord zonder te verzenden', () => {
    const lijst = zichtbareTaakMeldingen([
      { id: '1', title: 'Done deal', status: 'completed' },
      { id: '2', title: 'Blocked', status: 'blocked' },
      { id: '3', title: 'Still open', status: 'queued' },
    ]);
    expect(lijst.map((m) => m.tekst)).toEqual(['Done: Done deal', 'Stuck: Blocked']);
    expect(lijst.every((m) => m.stuurde === false)).toBe(true);
    expect(taakIsAfgerond('completed')).toBe(true);
    expect(taakIsVastgelopen('blocked')).toBe(true);
  });
});
