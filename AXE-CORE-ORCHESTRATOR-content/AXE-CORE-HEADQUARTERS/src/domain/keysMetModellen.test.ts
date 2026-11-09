import { describe, expect, it } from 'vitest';
import { metModelTest } from './keysMetModellen';
import type { KeyRow } from '@/infrastructure/gateways/axeCoreApiService';

const rij = (x: Partial<KeyRow>): KeyRow => ({
  name: 'X', purpose: 'p', where: 'VPS', status: 'missing', detail: 'Not set on the VPS', feeds: [], ...x,
});

describe('keys + Models & Tests', () => {
  it('Exa in Instellingen telt als werkend', () => {
    expect(metModelTest(rij({ provider: 'exa', status: 'optional' }), 'ok').status).toBe('works');
  });
  it('een mislukte key die je niet nodig hebt blijft Not used', () => {
    expect(metModelTest(rij({ provider: 'anthropic', need: 'unused', status: 'unused' }), 'fail').status).toBe('unused');
  });
  it('een mislukte nodige key is Broken', () => {
    expect(metModelTest(rij({ provider: 'groq', need: 'required', status: 'present' }), 'fail').status).toBe('broken');
  });
  it('zonder test verandert er niets', () => {
    const r = rij({ provider: 'groq', status: 'present' });
    expect(metModelTest(r, undefined)).toBe(r);
  });
});
