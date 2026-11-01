import { describe, expect, it } from 'vitest';

/** Labels must match the v3 settings mockup left rail. */
export const SETTINGS_V3_NAV = [
  'Accounts',
  'Usage',
  'Providers',
  'Voice',
  'Trust',
  'Routing',
  'System',
] as const;

describe('settings v3 nav', () => {
  it('has the seven mockup sections in order', () => {
    expect([...SETTINGS_V3_NAV]).toEqual([
      'Accounts', 'Usage', 'Providers', 'Voice', 'Trust', 'Routing', 'System',
    ]);
  });
});
