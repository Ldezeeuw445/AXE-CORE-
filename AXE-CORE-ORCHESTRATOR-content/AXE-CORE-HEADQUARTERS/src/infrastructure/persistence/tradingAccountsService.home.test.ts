import { describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({
  memList: vi.fn(async () => [{ key: 'cfg:trading_accounts', value: JSON.stringify({ activeId: 'a', accounts: [
    { id: 'a', label: 'Demo', token: 'geheim-token', accountId: 'm1', region: 'london', enabled: true },
  ] }) }]),
}));
vi.mock('@/infrastructure/persistence/durableConfigService', () => ({ saveDurableConfig: vi.fn() }));

describe('leesAccountsZonderToken (Home)', () => {
  it('geeft de lijst zonder token en schrijft niets', async () => {
    const { leesAccountsZonderToken } = await import('@/infrastructure/persistence/tradingAccountsService');
    const { saveDurableConfig } = await import('@/infrastructure/persistence/durableConfigService');
    const r = await leesAccountsZonderToken();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'a', label: 'Demo', accountId: 'm1', enabled: true });
    expect(JSON.stringify(r)).not.toContain('geheim-token');
    expect('token' in r[0]).toBe(false);
    expect(saveDurableConfig).not.toHaveBeenCalled();
  });
});
