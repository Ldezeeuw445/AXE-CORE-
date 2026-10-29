import { describe, it, expect, afterEach } from 'vitest';
import {
  matchesDemo500kLabel,
  isForbiddenAccount,
  resolveAllowedAccount,
  parseIdList,
} from './accountAllowlist';

afterEach(() => {
  delete process.env.AXE_TRADING_TEAM_ALLOWED_METAAPI_ACCOUNT_IDS;
  delete process.env.AXE_TRADING_TEAM_ALLOWED_BROKER_ACCOUNT_IDS;
  delete process.env.AXE_TRADING_TEAM_ALLOWED_LABEL_REGEX;
});

describe('matchesDemo500kLabel', () => {
  it('matches Companion verify fixture label', () => {
    expect(matchesDemo500kLabel('MT5 DEMO 500K')).toBe(true);
    expect(matchesDemo500kLabel('500k MT5 Demo')).toBe(true);
  });
  it('rejects live / prop labels', () => {
    expect(matchesDemo500kLabel('Upcomers 50k')).toBe(false);
    expect(matchesDemo500kLabel('Live 50k')).toBe(false);
  });
});

describe('isForbiddenAccount', () => {
  it('blocks upcomers and live environment', () => {
    expect(isForbiddenAccount({ label: 'Upcomers challenge' }).forbidden).toBe(true);
    expect(isForbiddenAccount({ label: 'Personal', environment: 'live' }).forbidden).toBe(true);
  });
  it('allows demo 500k', () => {
    expect(isForbiddenAccount({ label: 'MT5 DEMO 500K', environment: 'demo' }).forbidden).toBe(false);
  });
});

describe('resolveAllowedAccount', () => {
  const demo = {
    accountId: 'meta-demo-1',
    label: 'MT5 DEMO 500K',
    environment: 'demo' as const,
  };
  const live = {
    accountId: 'meta-live-1',
    label: 'Live personal',
    environment: 'live' as const,
  };
  const prop = {
    accountId: 'meta-prop-1',
    label: 'Upcomers 50k',
    environment: 'demo' as const,
  };

  it('fail closed with empty candidates', () => {
    const g = resolveAllowedAccount([]);
    expect(g.status).toBe('rejected');
  });

  it('picks unique demo 500k without env', () => {
    const g = resolveAllowedAccount([demo, live, prop]);
    expect(g.status).toBe('allowed');
    expect(g.accountId).toBe('meta-demo-1');
  });

  it('rejects ambiguous demo matches without env', () => {
    const g = resolveAllowedAccount([
      demo,
      { ...demo, accountId: 'meta-demo-2', label: 'MT5 DEMO 500K (copy)' },
    ]);
    expect(g.status).toBe('rejected');
    expect(g.reason).toMatch(/ambiguous/i);
  });

  it('honours explicit MetaAPI allowlist and still rejects live', () => {
    process.env.AXE_TRADING_TEAM_ALLOWED_METAAPI_ACCOUNT_IDS = 'meta-live-1';
    const g = resolveAllowedAccount([live], { metaApiIds: ['meta-live-1'] });
    expect(g.status).toBe('rejected');
  });

  it('allows explicit demo id on allowlist', () => {
    const g = resolveAllowedAccount([demo, live], { metaApiIds: ['meta-demo-1'] });
    expect(g.status).toBe('allowed');
    expect(g.accountId).toBe('meta-demo-1');
  });

  it('parseIdList splits commas', () => {
    expect(parseIdList('a, b ,c')).toEqual(['a', 'b', 'c']);
  });
});
