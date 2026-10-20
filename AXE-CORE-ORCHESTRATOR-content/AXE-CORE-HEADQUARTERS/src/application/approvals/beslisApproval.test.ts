import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  decideDurableTaskApproval: vi.fn(),
  listPendingApprovals: vi.fn(),
}));
vi.mock('@/infrastructure/gateways/axeCoreApiService', () => api);

import { beslisApproval } from './beslisAgentOk';

let n = 0;
const nieuwId = () => `ok-${++n}`;

describe('beslisApproval: dubbel tikken is geen "approval failed"', () => {
  beforeEach(() => {
    api.decideDurableTaskApproval.mockReset();
    api.listPendingApprovals.mockReset();
  });

  it('twee tikken op dezelfde approval sturen één besluit', async () => {
    api.decideDurableTaskApproval.mockResolvedValue({ approval: {} });
    const id = nieuwId();
    await Promise.all([beslisApproval('t', id, true), beslisApproval('t', id, true)]);
    await beslisApproval('t', id, true);
    expect(api.decideDurableTaskApproval).toHaveBeenCalledTimes(1);
  });

  it('een 404 op een approval die niet meer pending is telt als gedaan', async () => {
    api.decideDurableTaskApproval.mockRejectedValue(new Error('AXE API 404: Pending approval not found'));
    api.listPendingApprovals.mockResolvedValue([{ id: 'iets-anders' }]);
    await expect(beslisApproval('t', nieuwId(), true)).resolves.toBeUndefined();
  });

  it('een 404 terwijl hij nog pending staat is een echte fout', async () => {
    const id = nieuwId();
    api.decideDurableTaskApproval.mockRejectedValue(new Error('AXE API 404: Pending approval not found'));
    api.listPendingApprovals.mockResolvedValue([{ id }]);
    await expect(beslisApproval('t', id, true)).rejects.toThrow('404');
  });

  it('een andere fout komt door, en daarna mag je het opnieuw proberen', async () => {
    const id = nieuwId();
    api.decideDurableTaskApproval.mockRejectedValueOnce(new Error('AXE API 502: Bad Gateway'));
    await expect(beslisApproval('t', id, true)).rejects.toThrow('502');
    api.decideDurableTaskApproval.mockResolvedValueOnce({ approval: {} });
    await expect(beslisApproval('t', id, true)).resolves.toBeUndefined();
    expect(api.decideDurableTaskApproval).toHaveBeenCalledTimes(2);
  });
});
