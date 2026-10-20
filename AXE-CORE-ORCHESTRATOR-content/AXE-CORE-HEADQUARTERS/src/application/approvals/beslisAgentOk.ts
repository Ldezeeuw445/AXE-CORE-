/**
 * Eén pad naar POST /tasks/.../approvals/.../decision, vanuit Home, Awareness, PWA.
 *
 * Dubbel tikken is geen fout. De API-logs van 19 okt tonen telkens hetzelfde:
 * POST 200, en één tot tien seconden later dezelfde approval nog eens met 404
 * "Pending approval not found" -- een tweede tik voordat de lijst ververst was,
 * of de pil en de rail die allebei dezelfde approval tonen. Het besluit stond
 * al; de app meldde "approval failed". Dus: per approval-id één besluit in de
 * lucht, en een 404 op een approval die niet meer pending is telt als gedaan.
 * Staat hij na een 404 wél nog pending, dan is het een echte fout en gooien we.
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

const besluiten = new Map<string, Promise<void>>();

function nietMeerPending(e: unknown): boolean {
  return /AXE API 404\b/.test(e instanceof Error ? e.message : String(e));
}

export function beslisApproval(taskId: string, approvalId: string, akkoord: boolean, reden?: string): Promise<void> {
  const bezig = besluiten.get(approvalId);
  if (bezig) return bezig;
  const besluit = decideDurableTaskApproval(taskId, approvalId, akkoord, reden)
    .then(() => undefined)
    .catch(async (e: unknown) => {
      if (nietMeerPending(e)) {
        const open = await listPendingApprovals(50).catch(() => null);
        if (open && !open.some((a) => a.id === approvalId)) return;
      }
      besluiten.delete(approvalId);
      throw e;
    });
  besluiten.set(approvalId, besluit);
  return besluit;
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
    await beslisApproval(in_.rij.taskId, in_.rij.id, in_.akkoord, reden);
    return true;
  }
  if (in_.job?.taskId && in_.job.approvalId) {
    await beslisApproval(in_.job.taskId, in_.job.approvalId, in_.akkoord, reden);
    return true;
  }
  const rijen = await rijenNu(in_.agent, in_.job);
  const eerste = rijen[0];
  if (!eerste) return false;
  await beslisApproval(eerste.taskId, eerste.id, in_.akkoord, reden);
  return true;
}
