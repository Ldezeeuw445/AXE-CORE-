import { describe, expect, it } from 'vitest';

/** Labels must match the v3 settings mockup left rail. */
export const SETTINGS_V3_NAV = [
  'Agents',
  'Accounts',
  'Usage',
  'Providers',
  'Keys per app',
  'Voice',
  'Trust',
  'Routing',
  'System',
] as const;

describe('settings v3 nav', () => {
  it('has the sections in order (Agents first since 20 nov)', () => {
    expect([...SETTINGS_V3_NAV]).toEqual([
      'Agents', 'Accounts', 'Usage', 'Providers', 'Keys per app', 'Voice', 'Trust', 'Routing', 'System',
    ]);
  });
});
