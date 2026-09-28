import { describe, expect, it } from 'vitest';
import { blokkadeToon, conceptHerkomst, eigenaarLabel, termenRegels } from './engine';

describe('P1 engine-weergave', () => {
  it('kleurt bekende blokkades en laat onbekende grijs', () => {
    expect(blokkadeToon('channel_bounced')).toBe('rood');
    expect(blokkadeToon('contact_policy_review')).toBe('oranje');
    expect(blokkadeToon('iets_nieuws')).toBe('grijs');
    expect(blokkadeToon(null)).toBe('grijs');
  });

  it('noemt eigenaars en laat onbekende staan', () => {
    expect(eigenaarLabel('luka')).toBe('Luka');
    expect(eigenaarLabel('broker')).toBe('broker');
    expect(eigenaarLabel(undefined)).toBe('—');
  });

  it('toont alleen gevonden termen, in vaste volgorde', () => {
    const r = termenRegels({ incoterms: ['FOB', 'CIF'], quantity_mt: 800, origin: null, prices: [{ value: 9150, currency: 'USD', unit: 'MT' }], recurring: false, validity: [] });
    expect(r).toEqual(['Quantity (MT): 800', 'Recurring: no', 'Incoterms: FOB, CIF', 'Prices: USD 9150 MT']);
    expect(termenRegels(null)).toEqual([]);
  });

  it('verzint geen menselijk akkoord', () => {
    expect(conceptHerkomst({ gemaakt_door: 'northsea-engine' })).toBe('Prepared by the engine');
    expect(conceptHerkomst({ akkoord_door_soort: 'human', akkoord_door: 'luka' })).toBe('approved by luka');
    expect(conceptHerkomst({ akkoord_door_soort: 'service' })).toBe('approval actor: service');
  });
});
