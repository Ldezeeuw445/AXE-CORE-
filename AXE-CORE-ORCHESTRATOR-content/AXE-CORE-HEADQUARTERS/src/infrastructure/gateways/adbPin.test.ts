/**
 * De pin zoals de bridge hem afdwingt.
 *
 * De echte grens zit in `adb.mjs`, niet in de browser — een limiet die alleen
 * in de UI staat kan iedereen wegklikken. Deze test bewaakt de matcher dáár,
 * inclusief het verbreden via `AXE_PHONE_MODELS`, want dat is de enige knop die
 * een tweede toestel bewust toelaat.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { isA17Model } from '../../../infra/axe-local-bridge/adb.mjs';

const saved = process.env.AXE_PHONE_MODELS;
afterEach(() => {
  if (saved === undefined) delete process.env.AXE_PHONE_MODELS;
  else process.env.AXE_PHONE_MODELS = saved;
});

describe('adb.mjs isA17Model', () => {
  it('pins to the A17 family and ignores everything else', () => {
    delete process.env.AXE_PHONE_MODELS;
    expect(isA17Model('SM_A175F')).toBe(true);
    expect(isA17Model('SM-A546B')).toBe(false);
    expect(isA17Model(null)).toBe(false);
  });

  it('widens the pin only when AXE_PHONE_MODELS says so', () => {
    process.env.AXE_PHONE_MODELS = 'SM-A546B';
    expect(isA17Model('SM-A546B')).toBe(true);
    expect(isA17Model('Pixel 8')).toBe(false);
  });
});
