import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cycleSlot, holderId } from '@/domain/tradingIntel/autopilotLease';

const h = vi.hoisted(() => ({
  settings: new Map<string, unknown>(),
  claim: vi.fn(),
  release: vi.fn(),
}));

// Alles buiten de planning wordt automatisch leeg gemockt: de cyclus zelf mag
// vroeg stoppen, het gaat hier om due → lease → cyclus → vrijgeven.
vi.mock('@/application/tradingIntel/backtestEngine');
vi.mock('@/application/tradingIntel/cycleJournalService');
vi.mock('@/application/tradingIntel/deskAgentModels');
vi.mock('@/application/tradingIntel/deskAgents');
vi.mock('@/application/tradingIntel/liveTradeReconciler');
vi.mock('@/application/tradingIntel/positionManager');
vi.mock('@/application/tradingIntel/runDecisionFunnel');
vi.mock('@/application/tradingIntel/runTradingResearch');
vi.mock('@/application/tradingIntel/strategySignals');
vi.mock('@/application/tradingIntel/tradingAgentChat');
vi.mock('@/application/tradingIntel/tradingAgentEngine');
vi.mock('@/infrastructure/gateways/axeCoreApiService');
vi.mock('@/infrastructure/gateways/llmGateway');
vi.mock('@/infrastructure/gateways/marketDataService');
vi.mock('@/infrastructure/gateways/metaApiService');
vi.mock('@/infrastructure/gateways/metaApiSymbolResolver');
vi.mock('@/infrastructure/persistence/agentMotorenOpslag');
vi.mock('@/infrastructure/persistence/deskFeitenService');
vi.mock('@/infrastructure/persistence/tradingAccountsService');
vi.mock('@/infrastructure/persistence/tradingIntelService');
vi.mock('@/infrastructure/persistence/tradingLedgerService');
vi.mock('@/infrastructure/persistence/tradingObsidianMemory');
vi.mock('@/shared/axeActiviteit');

vi.mock('@/infrastructure/persistence/userSettingsService', () => ({
  loadSetting: async (k: string, d: unknown) => (h.settings.has(k) ? h.settings.get(k) : d),
  saveSetting: async (k: string, v: unknown) => { h.settings.set(k, v); },
}));
vi.mock('@/infrastructure/persistence/autopilotLeaseStore', () => ({
  myHolderId: () => 'desktop:test',
  tryAcquireAutopilotLease: (...a: unknown[]) => h.claim(...a),
  releaseAutopilotLease: (...a: unknown[]) => h.release(...a),
  readAutopilotLease: async () => null,
}));

const ap = await import('@/application/tradingIntel/agentAutopilot');

const LEASE = { holder: 'vps:abc', expiresAt: '2026-09-22T13:00:00Z', lastSlot: 1 };

beforeEach(() => {
  h.settings.clear();
  h.claim.mockReset();
  h.release.mockReset().mockResolvedValue(undefined);
  h.settings.set('axe_trading_autopilot_enabled', true);
  h.settings.set('axe_trading_autopilot_interval_min', 15);
  h.settings.set('axe_trading_autopilot_last_run', new Date(Date.now() - 20 * 60_000).toISOString());
});

describe('cycleSlot', () => {
  it('is de due-minuut: laatste start + interval', () => {
    const last = '2026-09-22T10:00:00Z';
    expect(cycleSlot(last, 15, Date.parse('2026-09-22T10:20:00Z'))).toBe(Date.parse('2026-09-22T10:15:00Z') / 60_000);
  });
  it('twee instanties die dezelfde start lezen, claimen dezelfde slot', () => {
    const last = '2026-09-22T10:00:00Z';
    expect(cycleSlot(last, 15, Date.parse('2026-09-22T10:16:00Z'))).toBe(cycleSlot(last, 15, Date.parse('2026-09-22T10:17:30Z')));
  });
  it('blijft oplopen als het interval verandert', () => {
    const a = cycleSlot('2026-09-22T10:00:00Z', 15, Date.parse('2026-09-22T10:20:00Z'));
    const b = cycleSlot('2026-09-22T10:15:00Z', 60, Date.parse('2026-09-22T11:20:00Z'));
    expect(b).toBeGreaterThan(a);
  });
  it('zonder vorige start: nu', () => {
    expect(cycleSlot(null, 15, 120_000)).toBe(2);
    expect(holderId('vps', 'x1')).toBe('vps:x1');
  });
});

describe('maybeRunTradingAutopilot met lease', () => {
  it('draait niet als een andere instantie de slot heeft', async () => {
    h.claim.mockResolvedValue({ kind: 'held', lease: LEASE });
    const before = h.settings.get('axe_trading_autopilot_last_run');
    await ap.maybeRunTradingAutopilot();
    expect(h.settings.get('axe_trading_autopilot_last_run')).toBe(before); // geen cyclus gestart
    expect(h.release).not.toHaveBeenCalled();
    expect((await ap.getAutopilotStatus()).lastSkip).toContain('held by vps:abc');
  });

  it('draait niet als de lease-check faalt', async () => {
    h.claim.mockResolvedValue({ kind: 'error', reason: 'network down' });
    const before = h.settings.get('axe_trading_autopilot_last_run');
    await ap.maybeRunTradingAutopilot();
    expect(h.settings.get('axe_trading_autopilot_last_run')).toBe(before);
    expect((await ap.getAutopilotStatus()).lastSkip).toContain('network down');
  });

  it('claimt de due-slot, draait, en geeft vrij met status', async () => {
    const last = h.settings.get('axe_trading_autopilot_last_run') as string;
    h.claim.mockResolvedValue({ kind: 'acquired', lease: { ...LEASE, holder: 'desktop:test' } });
    await ap.maybeRunTradingAutopilot();
    expect(h.claim).toHaveBeenCalledWith(cycleSlot(last, 15, Date.now()), 25 * 60);
    expect(h.settings.get('axe_trading_autopilot_last_run')).not.toBe(last); // cyclus gestart
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.release.mock.calls[0][0]).toMatchObject({ slot: cycleSlot(last, 15, Date.now()) });
  });

  it('zonder lease-tabel draait hij zoals voorheen, met de waarschuwing in de status', async () => {
    h.claim.mockResolvedValue({ kind: 'unavailable', reason: 'lease table not migrated' });
    await ap.maybeRunTradingAutopilot();
    expect(h.release).not.toHaveBeenCalled();
    expect((await ap.getAutopilotStatus()).lastSkip).toContain('not migrated');
  });

  it('niet due: geen claim', async () => {
    h.settings.set('axe_trading_autopilot_last_run', new Date().toISOString());
    await ap.maybeRunTradingAutopilot();
    expect(h.claim).not.toHaveBeenCalled();
  });
});
