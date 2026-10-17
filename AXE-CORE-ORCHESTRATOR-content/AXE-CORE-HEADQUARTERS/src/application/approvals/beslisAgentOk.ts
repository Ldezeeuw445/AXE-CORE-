/**
 * Eén pad naar POST /tasks/.../approvals/.../decision, vanuit Home, Awareness, PWA.
 */
import { rijenVoorAgent, type GoedkeuringsRij } from '@/domain/agents/pendingApproval';
import type { ServerAgent } from '@/domain/agents/serverStatus';
import {
  decideDurableTaskApproval,
  listPendingApprovals,
} from '@/infrastructure/gateways/axeCoreApiService';
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';

async function rijenNu(
  agent: ServerAgent | null | undefined,
  job?: Pick<AxeJob, 'taskId' | 'approvalId' | 'title' | 'approvalVraag'> | null,
): Promise<GoedkeuringsRij[]> {
  const extra = await listPendingApprovals(50).catch(() => []);
  const uit = rijenVoorAgent(agent, extra);
  if (job?.taskId && job.approvalId && !uit.some((r) => r.id === job.approvalId)) {
    uit.unshift({
      id: job.approvalId,
      taskId: job.taskId,
      wat: job.approvalVraag || job.title || 'This needs your OK.',
      waarom: '',
    });
  }
  return uit;
}

export async function beslisAgentOk(in_: {
  akkoord: boolean;
  reden?: string;
  agent?: ServerAgent | null;
  job?: Pick<AxeJob, 'taskId' | 'approvalId' | 'title' | 'approvalVraag'> | null;
  rij?: GoedkeuringsRij | null;
}): Promise<boolean> {
  const reden = in_.reden
    ?? (in_.akkoord ? 'Approved by Luka.' : 'Declined by Luka.');
  if (in_.rij?.id && in_.rij.taskId) {
    await decideDurableTaskApproval(in_.rij.taskId, in_.rij.id, in_.akkoord, reden);
    return true;
  }
  if (in_.job?.taskId && in_.job.approvalId) {
    await decideDurableTaskApproval(in_.job.taskId, in_.job.approvalId, in_.akkoord, reden);
    return true;
  }
  const rijen = await rijenNu(in_.agent, in_.job);
  const eerste = rijen[0];
  if (!eerste) return false;
  await decideDurableTaskApproval(eerste.taskId, eerste.id, in_.akkoord, reden);
  return true;
}
