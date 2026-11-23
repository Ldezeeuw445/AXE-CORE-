import { describe, expect, it } from 'vitest';

/** Labels must match the v3 settings mockup left rail. */
export const SETTINGS_V3_NAV = [
  'Agents',
  'Accounts',
  'Keys per app',
  'Usage & costs',
  'Providers',
  'Voice',
  'Trust',
  'Routing',
  'System',
] as const;

describe('settings v3 nav', () => {
  it('has the sections in order (Agents first since 20 nov; Keys next to Accounts since 23 nov)', () => {
    expect([...SETTINGS_V3_NAV]).toEqual([
      'Agents', 'Accounts', 'Keys per app', 'Usage & costs', 'Providers', 'Voice', 'Trust', 'Routing', 'System',
    ]);
  });
});
