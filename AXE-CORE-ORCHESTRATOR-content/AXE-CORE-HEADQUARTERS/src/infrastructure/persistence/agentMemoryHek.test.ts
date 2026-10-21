import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sbInsertRow } = vi.hoisted(() => ({
  sbInsertRow: vi.fn(async () => []),
}));

vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({
  isAxeApiConfigured: true,
  sbInsertRow,
  sbGetRows: vi.fn(async () => []),
}));
vi.mock('@/infrastructure/persistence/chatPersistence', () => ({ AXE_USER_ID: 'u' }));
vi.mock('@/shared/axeActiviteit', () => ({ meldActiviteit: () => undefined }));

import { remember } from './agentMemoryService';

beforeEach(() => sbInsertRow.mockClear());

describe('remember weigert ruis', () => {
  it('schrijft een echte les', async () => {
    expect(await remember({ agent: 'axe_trader', content: 'stopped out on the retest', key: 'ta:x:lesson:EURUSD:1' })).toBe(true);
    expect(sbInsertRow).toHaveBeenCalledTimes(1);
    expect(sbInsertRow.mock.calls[0][1]).toMatchObject({ agent: 'axe_trader', content: 'stopped out on the retest' });
    expect(String(sbInsertRow.mock.calls[0][1].key)).toContain('ta:x:lesson:EURUSD');
  });

  it('schrijft geen HOLD, skip of cron-run', async () => {
    expect(await remember({ content: 'HOLD score=0.1' })).toBe(false);
    expect(await remember({ content: 'skipped' })).toBe(false);
    expect(await remember({ key: 'agent_run:cron:x:1', content: 'Cron fired' })).toBe(false);
    expect(await remember({ key: 'ta:axe_trading_agent:cycle:abc', content: '{"action":"buy"}' })).toBe(false);
    expect(sbInsertRow).not.toHaveBeenCalled();
  });
});
