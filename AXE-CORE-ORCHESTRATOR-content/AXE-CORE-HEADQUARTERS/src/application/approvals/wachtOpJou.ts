/** Haalt "Wacht op jou" op: AXE core_approvals + NorthSea list_pending_approvals. */
import { laadBesluiten, laadRegels, logBesluit } from '@/domain/approvals/beleidOpslag';
import {
  samen,
  splitsOpBeleid,
  vanAxe,
  vanNorthsea,
  type NorthseaVraag,
  type WachtItem,
} from '@/domain/approvals/wachtOpJou';
import { listPendingApprovals, northseaActie } from '@/infrastructure/gateways/axeCoreApiService';

async function haalNorthsea(): Promise<WachtItem[]> {
  const uit: NorthseaVraag[] = [];
  const regels = laadRegels();
  for (let offset = 0; offset < 400; offset += 100) {
    const { result } = await northseaActie('list_pending_approvals', { limit: 100, offset });
    const r = result as { items?: NorthseaVraag[]; next_offset?: number | null };
    uit.push(...(r.items ?? []));
    if (r.next_offset == null) break;
  }
  return vanNorthsea(uit, regels);
}

export async function haalWachtOpJou(): Promise<{ items: WachtItem[]; auto: WachtItem[]; fouten: string[] }> {
  const fouten: string[] = [];
  const [axe, ns] = await Promise.all([
    listPendingApprovals(100).then((r) => vanAxe(r)).catch(() => { fouten.push('AXE'); return []; }),
    haalNorthsea().catch(() => { fouten.push('NorthSea'); return []; }),
  ]);
  const { pending, auto } = splitsOpBeleid(samen(axe, ns));
  const gezien = new Set(laadBesluiten().map((b) => b.itemId));
  for (const i of auto) {
    if (!i.beleid || gezien.has(i.id)) continue;
    logBesluit({
      itemId: i.id,
      sourceId: i.approvalId,
      action: i.beleid.mode === 'auto_reject' ? 'auto_reject' : 'auto_approve',
      actorType: i.beleid.actorType,
      reason: i.beleid.reason,
      via: 'policy',
      at: new Date().toISOString(),
      threadId: i.threadId,
      messageId: i.messageId,
    });
  }
  return { items: pending, auto, fouten };
}
