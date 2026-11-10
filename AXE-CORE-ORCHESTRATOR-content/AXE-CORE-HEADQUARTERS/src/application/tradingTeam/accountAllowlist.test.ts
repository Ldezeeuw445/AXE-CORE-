import { describe, it, expect, afterEach } from 'vitest';
import {
  matchesDemo500kLabel,
  isForbiddenAccount,
  resolveAllowedAccount,
  parseIdList,
  demoTradeModeGuard,
  candidatesFromTradingAccounts,
  brokerBindingFromAllowlistEnv,
  indexCompanionBrokersByMetaApiId,
} from './accountAllowlist';
import type { TradingAccount } from '@/infrastructure/persistence/tradingAccountsService';

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

describe('demoTradeModeGuard', () => {
  it('allows ACCOUNT_TRADE_MODE_DEMO', () => {
    const g = demoTradeModeGuard('ACCOUNT_TRADE_MODE_DEMO');
    expect(g.ok).toBe(true);
  });
  it('allows contest as demo-equivalent', () => {
    const g = demoTradeModeGuard('ACCOUNT_TRADE_MODE_CONTEST');
    expect(g.ok).toBe(true);
  });
  it('rejects ACCOUNT_TRADE_MODE_REAL and live-like values', () => {
    expect(demoTradeModeGuard('ACCOUNT_TRADE_MODE_REAL').ok).toBe(false);
    expect(demoTradeModeGuard('REAL').ok).toBe(false);
    if (!demoTradeModeGuard('ACCOUNT_TRADE_MODE_REAL').ok) {
      expect(demoTradeModeGuard('ACCOUNT_TRADE_MODE_REAL').reason).toMatch(/not demo/i);
    }
  });
  it('rejects missing or unknown tradeMode (fail closed)', () => {
    expect(demoTradeModeGuard(undefined).ok).toBe(false);
    expect(demoTradeModeGuard(null).ok).toBe(false);
    expect(demoTradeModeGuard('').ok).toBe(false);
    expect(demoTradeModeGuard('SOMETHING_ELSE').ok).toBe(false);
  });
});

describe('candidatesFromTradingAccounts broker mapping', () => {
  const demoId = '650f4f7a-f4b5-4869-8f94-8adbb961be2b';
  const brokerId = '0364372e-eb51-4902-9697-08d55b62f295';
  const otherId = '08c9aa65-6013-428d-87a0-5ca122f88064';

  function acct(partial: Partial<TradingAccount> & Pick<TradingAccount, 'accountId' | 'label'>): TradingAccount {
    return {
      id: 'local-1',
      token: 'x',
      region: 'london',
      enabled: true,
      addedAt: '2026-11-10T00:00:00.000Z',
      ...partial,
    };
  }

  it('maps companionBrokerAccountId from the account row', () => {
    const c = candidatesFromTradingAccounts([
      acct({ accountId: demoId, label: 'MT5 DEMO 500K', companionBrokerAccountId: brokerId, serverOrProvider: 'MetaQuotes-Demo', environment: 'demo' }),
    ]);
    expect(c[0]?.companionBrokerAccountId).toBe(brokerId);
    expect(c[0]?.serverOrProvider).toBe('MetaQuotes-Demo');
  });

  it('maps companionBrokerAccountId from a Companion index', () => {
    const index = indexCompanionBrokersByMetaApiId([
      { id: brokerId, external_connection_id: demoId, mt5_server: 'MetaQuotes-Demo' },
    ]);
    const c = candidatesFromTradingAccounts([
      acct({ accountId: demoId, label: 'MT5 DEMO 500K', environment: 'demo' }),
    ], index);
    expect(c[0]?.companionBrokerAccountId).toBe(brokerId);
    expect(c[0]?.serverOrProvider).toBe('MetaQuotes-Demo');
  });

  it('maps the 1:1 env allowlist binding so the desktop tab passes the broker gate', () => {
    process.env.AXE_TRADING_TEAM_ALLOWED_METAAPI_ACCOUNT_IDS = demoId;
    process.env.AXE_TRADING_TEAM_ALLOWED_BROKER_ACCOUNT_IDS = brokerId;
    expect(brokerBindingFromAllowlistEnv(demoId)?.companionBrokerAccountId).toBe(brokerId);
    expect(brokerBindingFromAllowlistEnv(otherId)).toBeNull();
    const c = candidatesFromTradingAccounts([
      acct({ accountId: demoId, label: 'MT5 DEMO 500K', environment: 'demo' }),
      acct({ accountId: otherId, label: 'OANDA DEMO 50K', environment: 'demo' }),
    ]);
    expect(c.find(x => x.accountId === demoId)?.companionBrokerAccountId).toBe(brokerId);
    expect(c.find(x => x.accountId === otherId)?.companionBrokerAccountId).toBeNull();
    const g = resolveAllowedAccount(c);
    expect(g.status).toBe('allowed');
    expect(g.accountId).toBe(demoId);
    expect(g.companionBrokerAccountId).toBe(brokerId);
  });

  it('rejects a non-allowlisted account even when a broker id is attached', () => {
    process.env.AXE_TRADING_TEAM_ALLOWED_METAAPI_ACCOUNT_IDS = demoId;
    process.env.AXE_TRADING_TEAM_ALLOWED_BROKER_ACCOUNT_IDS = brokerId;
    const g = resolveAllowedAccount(candidatesFromTradingAccounts([
      acct({ accountId: otherId, label: 'OANDA DEMO 50K', environment: 'demo', companionBrokerAccountId: 'not-the-allowlist' }),
    ]));
    expect(g.status).toBe('rejected');
    expect(g.reason).toMatch(/ALLOWED_METAAPI/i);
  });
});

describe('resolveAllowedAccount forbidden and allowlist gates', () => {
  const demo = {
    accountId: '650f4f7a-f4b5-4869-8f94-8adbb961be2b',
    label: 'MT5 DEMO 500K',
    environment: 'demo' as const,
    companionBrokerAccountId: '0364372e-eb51-4902-9697-08d55b62f295',
    serverOrProvider: 'MetaQuotes-Demo',
  };

  it('rejects Upcomers even if someone put it on the MetaAPI allowlist', () => {
    const g = resolveAllowedAccount([
      { accountId: '689de1f0-751a-4dad-9026-4e7f639c7e72', label: '200K INSTANT UPCOMERS', environment: 'demo', companionBrokerAccountId: '5fe85c93-b210-4819-8cc6-d372cf6c8b14' },
    ], { metaApiIds: ['689de1f0-751a-4dad-9026-4e7f639c7e72'] });
    expect(g.status).toBe('rejected');
  });

  it('rejects prop / evaluation labels', () => {
    const g = resolveAllowedAccount([
      { accountId: 'meta-prop-1', label: 'FTMO 100k challenge', environment: 'demo' },
    ]);
    expect(g.status).toBe('rejected');
    expect(isForbiddenAccount({ label: 'FTMO 100k challenge' }).forbidden).toBe(true);
  });

  it('rejects when the broker allowlist is set but the candidate has no Companion id', () => {
    const g = resolveAllowedAccount(
      [{ ...demo, companionBrokerAccountId: null }],
      { metaApiIds: [demo.accountId], brokerIds: [demo.companionBrokerAccountId] },
    );
    expect(g.status).toBe('rejected');
    expect(g.reason).toMatch(/ALLOWED_BROKER/i);
  });

  it('allows the mapped 500k demo against both allowlists', () => {
    const g = resolveAllowedAccount([demo], {
      metaApiIds: [demo.accountId],
      brokerIds: [demo.companionBrokerAccountId],
    });
    expect(g.status).toBe('allowed');
    expect(g.accountId).toBe(demo.accountId);
    expect(g.companionBrokerAccountId).toBe(demo.companionBrokerAccountId);
  });
});
